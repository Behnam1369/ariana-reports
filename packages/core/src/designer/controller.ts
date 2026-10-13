import { checkExpression } from '../expressions';
import { generateReport, type GenerateOptions } from '../layout/engine';
import type { LayoutDocument } from '../layout/types';
import { cloneTemplate, createBand, createComponent, createDataRegion, createStaticBand, createTemplate, generateId } from '../model/factory';
import type {
  Band,
  ComponentType,
  DataRegion,
  DataSourceDefinition,
  Group,
  ParameterDefinition,
  ReportComponent,
  ReportTemplate,
  StyleProps,
  TextAlign,
  Unit,
  VerticalAlign,
} from '../model/types';
import { mergeStyles, resolveStyle } from '../layout/style';
import { resolvePageSize } from '../model/units';
import { parseTemplate, validateTemplate, type ValidationIssue } from '../model/validate';
import { findBand, findComponent, walkBands } from '../model/walk';
import { readPath } from '../layout/data';
import {
  alignRects,
  clampPosition,
  distributeRects,
  intersects,
  resizeRect,
  round,
  snapMove,
  type Alignment,
  type Guide,
  type Rect,
  type ResizeHandle,
} from './geometry';
import { fieldExpression, inferFields } from './infer';
import { convertTemplateUnit, designSections, findGroup, findRegion, type DesignSection, type SectionLabels } from './sections';

export type PageBandSlot = 'reportHeader' | 'pageHeader' | 'pageFooter' | 'reportFooter';

export interface Selection {
  /** Selected component ids (all in the same band). */
  componentIds: string[];
  /** Selected band: the band of the selected components, or a band selected on its own. */
  bandId: string | null;
}

export interface DesignerSettings {
  /** Grid size in template units. */
  grid: number;
  showGrid: boolean;
  snapToGrid: boolean;
  /** Snap to other components' edges. */
  snapToObjects: boolean;
  /** Snap distance in template units. */
  snapTolerance: number;
  /** Show the page margins around the bands on the design surface. */
  showMargins: boolean;
}

export interface DesignerState {
  template: ReportTemplate;
  selection: Selection;
  settings: DesignerSettings;
  canUndo: boolean;
  canRedo: boolean;
  /** True when the template changed since the last `markSaved()` or `load()`. */
  dirty: boolean;
  /** Template validation errors (paths and messages). */
  errors: ValidationIssue[];
  /** Snap guides for the current drag, in band coordinates. */
  guides: { bandId: string; guides: Guide[] } | null;
  /** True while a drag or resize is in progress. */
  interacting: boolean;
}

export interface DesignerControllerOptions {
  template?: ReportTemplate | string;
  /** Sample data used for field inference and previews. */
  sampleData?: unknown;
  settings?: Partial<DesignerSettings>;
  /** Maximum undo steps. Defaults to 100. */
  historyLimit?: number;
}

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

type Listener = (state: DesignerState) => void;

const DEFAULT_SETTINGS: Record<Unit, DesignerSettings> = {
  mm: { grid: 2.5, showGrid: true, snapToGrid: true, snapToObjects: true, snapTolerance: 1, showMargins: true },
  cm: { grid: 0.25, showGrid: true, snapToGrid: true, snapToObjects: true, snapTolerance: 0.1, showMargins: true },
  in: { grid: 0.1, showGrid: true, snapToGrid: true, snapToObjects: true, snapTolerance: 0.04, showMargins: true },
  pt: { grid: 6, showGrid: true, snapToGrid: true, snapToObjects: true, snapTolerance: 3, showMargins: true },
  px: { grid: 8, showGrid: true, snapToGrid: true, snapToObjects: true, snapTolerance: 4, showMargins: true },
};

interface Transaction {
  label: string;
  base: ReportTemplate;
  selection: Selection;
}

/**
 * Framework-neutral designer logic: the template being edited, selection,
 * move/resize/snap, band and data management, clipboard and undo/redo.
 * Every change produces a new template object, so views can compare by
 * reference.
 */
export class DesignerController {
  private state: DesignerState;
  private readonly listeners = new Set<Listener>();
  private undoStack: { template: ReportTemplate; selection: Selection; label: string }[] = [];
  private redoStack: { template: ReportTemplate; selection: Selection; label: string }[] = [];
  private savedTemplate: ReportTemplate;
  private transaction: Transaction | null = null;
  private clipboard: ReportComponent[] = [];
  private sampleData: unknown;
  private readonly historyLimit: number;

  constructor(options: DesignerControllerOptions = {}) {
    const template = options.template === undefined ? createTemplate() : parseTemplate(options.template);
    this.sampleData = options.sampleData;
    this.historyLimit = options.historyLimit ?? 100;
    this.savedTemplate = template;
    this.state = {
      template,
      selection: { componentIds: [], bandId: null },
      settings: { ...DEFAULT_SETTINGS[template.unit], ...options.settings },
      canUndo: false,
      canRedo: false,
      dirty: false,
      errors: validateTemplate(template).errors,
      guides: null,
      interacting: false,
    };
  }

  // -- state ----------------------------------------------------------------

  getState(): DesignerState {
    return this.state;
  }

  get template(): ReportTemplate {
    return this.state.template;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<DesignerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private historyFlags(): Pick<DesignerState, 'canUndo' | 'canRedo'> {
    return { canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 };
  }

  /**
   * Applies a change to a copy of the template and records it for undo.
   * Inside a transaction the change is applied to the transaction's base
   * template, so drag handlers can pass total deltas from the drag start.
   */
  private commit(label: string, mutate: (t: ReportTemplate) => Selection | void): void {
    const base = this.transaction ? this.transaction.base : this.state.template;
    const next = cloneTemplate(base);
    const selection = mutate(next) ?? this.validSelection(next, this.state.selection);
    if (!this.transaction) {
      this.undoStack.push({ template: this.state.template, selection: this.state.selection, label });
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit({
      template: next,
      selection,
      errors: validateTemplate(next).errors,
      dirty: next !== this.savedTemplate,
      ...this.historyFlags(),
    });
  }

  /** Drops selected ids that no longer exist. */
  private validSelection(t: ReportTemplate, selection: Selection): Selection {
    const ids = selection.componentIds.filter((id) => findComponent(t, id));
    const bandId = selection.bandId && findBand(t, selection.bandId) ? selection.bandId : null;
    return { componentIds: ids, bandId };
  }

  /** Replaces the template (e.g. after opening a file). Clears history. Throws for invalid templates. */
  load(template: ReportTemplate | string): void {
    const t = parseTemplate(template);
    this.undoStack = [];
    this.redoStack = [];
    this.transaction = null;
    this.savedTemplate = t;
    this.emit({
      template: t,
      selection: { componentIds: [], bandId: null },
      errors: validateTemplate(t).errors,
      dirty: false,
      guides: null,
      interacting: false,
      settings: { ...this.state.settings, ...(t.unit !== this.state.template.unit ? DEFAULT_SETTINGS[t.unit] : {}) },
      ...this.historyFlags(),
    });
  }

  /** Template as JSON text. */
  toJSON(pretty = true): string {
    return JSON.stringify(this.state.template, null, pretty ? 2 : undefined);
  }

  /** Marks the current template as saved (clears `dirty`). */
  markSaved(): void {
    this.savedTemplate = this.state.template;
    this.emit({ dirty: false });
  }

  updateSettings(patch: Partial<DesignerSettings>): void {
    this.emit({ settings: { ...this.state.settings, ...patch } });
  }

  // -- history --------------------------------------------------------------

  undo(): void {
    if (this.transaction) this.cancelInteraction();
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push({ template: this.state.template, selection: this.state.selection, label: entry.label });
    this.restore(entry.template, entry.selection);
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push({ template: this.state.template, selection: this.state.selection, label: entry.label });
    this.restore(entry.template, entry.selection);
  }

  private restore(template: ReportTemplate, selection: Selection): void {
    this.emit({
      template,
      selection: this.validSelection(template, selection),
      errors: validateTemplate(template).errors,
      dirty: template !== this.savedTemplate,
      guides: null,
      ...this.historyFlags(),
    });
  }

  /** Label of the change that undo would revert. */
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  // -- interactions (drag / resize) -----------------------------------------

  /** Starts a drag or resize. Changes until `endInteraction()` become one undo step. */
  beginInteraction(label: string): void {
    if (this.transaction) this.endInteraction();
    this.transaction = { label, base: this.state.template, selection: this.state.selection };
    this.emit({ interacting: true });
  }

  endInteraction(): void {
    const tx = this.transaction;
    if (!tx) return;
    this.transaction = null;
    if (this.state.template !== tx.base) {
      this.undoStack.push({ template: tx.base, selection: tx.selection, label: tx.label });
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit({ interacting: false, guides: null, ...this.historyFlags() });
  }

  cancelInteraction(): void {
    const tx = this.transaction;
    if (!tx) return;
    this.transaction = null;
    this.restore(tx.base, tx.selection);
    this.emit({ interacting: false });
  }

  // -- selection --------------------------------------------------------------

  /**
   * Selects components. Components must share a band; selecting a component
   * from another band replaces the selection.
   */
  select(ids: string[], mode: 'replace' | 'add' | 'toggle' = 'replace'): void {
    const t = this.state.template;
    const valid = ids.filter((id) => findComponent(t, id));
    const firstBand = valid.length ? findComponent(t, valid[0]!)!.band.band.id : null;
    let next: string[];
    const current = this.state.selection;
    const sameBand = firstBand !== null && current.bandId === firstBand && current.componentIds.length > 0;
    if (mode === 'replace' || !sameBand) {
      next = valid.filter((id) => findComponent(t, id)!.band.band.id === firstBand);
    } else if (mode === 'add') {
      next = [...new Set([...current.componentIds, ...valid.filter((id) => findComponent(t, id)!.band.band.id === firstBand)])];
    } else {
      const set = new Set(current.componentIds);
      for (const id of valid) set.has(id) ? set.delete(id) : set.add(id);
      next = [...set];
    }
    this.emit({ selection: { componentIds: next, bandId: next.length ? firstBand : mode === 'toggle' ? current.bandId : null } });
  }

  selectBand(bandId: string | null): void {
    const exists = bandId === null || findBand(this.state.template, bandId);
    this.emit({ selection: { componentIds: [], bandId: exists ? bandId : null } });
  }

  clearSelection(): void {
    this.emit({ selection: { componentIds: [], bandId: null } });
  }

  /** Selects every component in a band (the selected band by default). */
  selectAll(bandId = this.state.selection.bandId): void {
    if (!bandId) return;
    const band = findBand(this.state.template, bandId)?.band;
    if (!band) return;
    this.emit({ selection: { componentIds: band.components.map((c) => c.id), bandId } });
  }

  /** Rubber-band selection inside one band; `rect` is in band coordinates. */
  selectInRect(bandId: string, rect: Rect, additive = false): void {
    const band = findBand(this.state.template, bandId)?.band;
    if (!band) return;
    const hits = band.components.filter((c) => intersects(c, rect)).map((c) => c.id);
    if (additive && this.state.selection.bandId === bandId) {
      this.emit({ selection: { componentIds: [...new Set([...this.state.selection.componentIds, ...hits])], bandId } });
    } else {
      this.emit({ selection: { componentIds: hits, bandId } });
    }
  }

  /**
   * Rubber-band selection that may cover several bands, e.g. started in the
   * page margin. Selections are limited to one band, so the band with the most
   * hits wins (the first one on a tie). `rects` are in each band's coordinates.
   * With no hits the selection is cleared (unless `additive`).
   */
  selectInBands(rects: { bandId: string; rect: Rect }[], additive = false): void {
    let best: { bandId: string; rect: Rect; hits: number } | null = null;
    for (const { bandId, rect } of rects) {
      const band = findBand(this.state.template, bandId)?.band;
      if (!band) continue;
      const hits = band.components.filter((c) => intersects(c, rect)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { bandId, rect, hits };
    }
    if (best) this.selectInRect(best.bandId, best.rect, additive);
    else if (!additive) this.clearSelection();
  }

  /** Sets the horizontal text alignment of the selected text components. */
  setTextAlign(textAlign: TextAlign, ids = this.state.selection.componentIds): void {
    this.updateComponentStyle({ textAlign }, this.textIds(ids));
  }

  /** Sets the vertical text alignment of the selected text components. */
  setVerticalAlign(verticalAlign: VerticalAlign, ids = this.state.selection.componentIds): void {
    this.updateComponentStyle({ verticalAlign }, this.textIds(ids));
  }

  /**
   * Effective content alignment of the selected text components (named style
   * and inline style applied). A value is null when the components differ or
   * no text component is selected.
   */
  textAlignment(ids = this.state.selection.componentIds): { textAlign: TextAlign | null; verticalAlign: VerticalAlign | null } {
    const t = this.state.template;
    const styles = this.textIds(ids).map((id) => {
      const c = findComponent(t, id)!.component;
      return resolveStyle(mergeStyles(c.styleName ? t.styles?.[c.styleName] : undefined, c.style), t.unit);
    });
    const common = <K extends 'textAlign' | 'verticalAlign'>(key: K) =>
      styles.length && styles.every((s) => s[key] === styles[0]![key]) ? styles[0]![key] : null;
    return { textAlign: common('textAlign'), verticalAlign: common('verticalAlign') };
  }

  private textIds(ids: string[]): string[] {
    return ids.filter((id) => findComponent(this.state.template, id)?.component.type === 'text');
  }

  /** Selected components, in selection order. */
  selectedComponents(): ReportComponent[] {
    const t = this.state.template;
    return this.state.selection.componentIds.map((id) => findComponent(t, id)?.component).filter((c): c is ReportComponent => !!c);
  }

  // -- design surface helpers ---------------------------------------------------

  /** Bands in design order. Pass translated labels for localized captions. */
  sections(labels?: SectionLabels): DesignSection[] {
    return designSections(this.state.template, labels);
  }

  /** Page size in template units, with the orientation applied. */
  pageSize(): { width: number; height: number } {
    const t = this.state.template;
    return resolvePageSize(t.page, t.unit);
  }

  /** Width of the printable body in template units: components should stay within it. */
  bodyWidth(): number {
    const t = this.state.template;
    const size = resolvePageSize(t.page, t.unit);
    return round(size.width - t.page.margins.left - t.page.margins.right);
  }

  // -- template settings ---------------------------------------------------------

  /** Updates top-level template fields. Changing `unit` converts every length. */
  updateTemplate(patch: Partial<Pick<ReportTemplate, 'name' | 'description' | 'locale' | 'page' | 'unit'>>): void {
    this.commit('Edit report settings', (t) => {
      const { unit, ...rest } = patch;
      Object.assign(t, rest);
      if (patch.description === undefined && 'description' in patch) delete t.description;
      if (unit && unit !== t.unit) convertTemplateUnit(t, unit);
    });
    if (patch.unit) this.emit({ settings: { ...this.state.settings, ...DEFAULT_SETTINGS[patch.unit] } });
  }

  // -- bands ----------------------------------------------------------------------

  /** Adds or removes a report/page header or footer. */
  setPageBand(slot: PageBandSlot, enabled: boolean): string | null {
    let id: string | null = this.state.template[slot]?.id ?? null;
    if (enabled === !!this.state.template[slot]) return id;
    this.commit(enabled ? `Add ${slot}` : `Remove ${slot}`, (t) => {
      if (enabled) {
        const band = createBand({ height: slot.startsWith('page') ? 8 : 15 });
        if (t.unit !== 'mm') band.height = slot.startsWith('page') ? 24 : 40;
        t[slot] = band;
        id = band.id;
        return { componentIds: [], bandId: band.id };
      }
      delete t[slot];
      id = null;
      return undefined;
    });
    return id;
  }

  /** Inserts a static band into the body at `index` (end by default). Returns its id. */
  addStaticBand(index?: number): string {
    const band = createStaticBand({ height: this.defaultBandHeight() });
    this.commit('Add band', (t) => {
      t.body.splice(index ?? t.body.length, 0, band);
      return { componentIds: [], bandId: band.id };
    });
    return band.id;
  }

  /** Inserts a data region bound to a data source. Returns the region id. */
  addDataRegion(dataSource: string, index?: number): string {
    const region = createDataRegion(dataSource, { detail: createBand({ height: this.defaultBandHeight() }) });
    this.commit('Add data region', (t) => {
      t.body.splice(index ?? t.body.length, 0, region);
      return { componentIds: [], bandId: region.detail.id };
    });
    return region.id;
  }

  /** Adds a nested (master-detail) region. Pass `{ relation: 'items' }` or `{ dataSource: 'notes' }`. */
  addChildRegion(parentRegionId: string, source: { relation: string } | { dataSource: string }): string {
    const child: DataRegion = {
      kind: 'dataRegion',
      id: generateId('region'),
      ...source,
      detail: createBand({ height: this.defaultBandHeight() }),
    };
    this.commit('Add child region', (t) => {
      const hit = findRegion(t, parentRegionId);
      if (!hit) throw new Error(`Unknown region "${parentRegionId}"`);
      (hit.region.children ??= []).push(child);
      return { componentIds: [], bandId: child.detail.id };
    });
    return child.id;
  }

  /** Removes a data region with all its bands and children. */
  removeRegion(regionId: string): void {
    this.commit('Remove data region', (t) => {
      const hit = findRegion(t, regionId);
      if (!hit) return;
      if (hit.list) {
        hit.list.splice(hit.list.indexOf(hit.region), 1);
        if (hit.parent && hit.list.length === 0) delete hit.parent.children;
      } else {
        t.body.splice(hit.bodyIndex, 1);
      }
    });
  }

  updateRegion(regionId: string, patch: Partial<Omit<DataRegion, 'kind' | 'id' | 'detail' | 'header' | 'footer' | 'groups' | 'children'>>): void {
    this.commit('Edit data region', (t) => {
      const region = findRegion(t, regionId)?.region;
      if (!region) return;
      assignDefined(region as unknown as Record<string, unknown>, patch);
    });
  }

  /** Adds or removes a region's header or footer band. */
  setRegionBand(regionId: string, which: 'header' | 'footer', enabled: boolean): void {
    this.commit(`${enabled ? 'Add' : 'Remove'} region ${which}`, (t) => {
      const region = findRegion(t, regionId)?.region;
      if (!region) return;
      if (enabled && !region[which]) {
        const band = createBand({ height: this.defaultBandHeight() });
        region[which] = band;
        return { componentIds: [], bandId: band.id };
      }
      if (!enabled) delete region[which];
      return undefined;
    });
  }

  /** Adds a group to a region (as the innermost group). Returns the group id. */
  addGroup(regionId: string, expression: string): string {
    const group: Group = { id: generateId('group'), expression, header: createBand({ height: this.defaultBandHeight() }) };
    this.commit('Add group', (t) => {
      const region = findRegion(t, regionId)?.region;
      if (!region) throw new Error(`Unknown region "${regionId}"`);
      (region.groups ??= []).push(group);
      return { componentIds: [], bandId: group.header!.id };
    });
    return group.id;
  }

  updateGroup(groupId: string, patch: Partial<Pick<Group, 'expression' | 'sortDirection' | 'pageBreakBefore'>>): void {
    this.commit('Edit group', (t) => {
      const hit = findGroup(t, groupId);
      if (hit) assignDefined(hit.group as unknown as Record<string, unknown>, patch);
    });
  }

  setGroupBand(groupId: string, which: 'header' | 'footer', enabled: boolean): void {
    this.commit(`${enabled ? 'Add' : 'Remove'} group ${which}`, (t) => {
      const group = findGroup(t, groupId)?.group;
      if (!group) return;
      if (enabled && !group[which]) {
        const band = createBand({ height: this.defaultBandHeight() });
        group[which] = band;
        return { componentIds: [], bandId: band.id };
      }
      if (!enabled) delete group[which];
      return undefined;
    });
  }

  removeGroup(groupId: string): void {
    this.commit('Remove group', (t) => {
      const hit = findGroup(t, groupId);
      if (!hit) return;
      hit.region.groups = hit.region.groups!.filter((g) => g.id !== groupId);
      if (hit.region.groups.length === 0) delete hit.region.groups;
    });
  }

  /** Moves a group one level out (-1) or in (+1). */
  moveGroup(groupId: string, direction: -1 | 1): void {
    this.commit('Reorder groups', (t) => {
      const hit = findGroup(t, groupId);
      if (!hit) return;
      const groups = hit.region.groups!;
      const i = groups.indexOf(hit.group);
      const j = i + direction;
      if (j < 0 || j >= groups.length) return;
      [groups[i], groups[j]] = [groups[j]!, groups[i]!];
    });
  }

  /** Moves a top-level body item (static band or region) to another position. */
  moveBodyItem(fromIndex: number, toIndex: number): void {
    const len = this.state.template.body.length;
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len || fromIndex === toIndex) return;
    this.commit('Reorder bands', (t) => {
      const [item] = t.body.splice(fromIndex, 1);
      t.body.splice(toIndex, 0, item!);
    });
  }

  updateBand(bandId: string, patch: Partial<Omit<Band, 'id' | 'components'>>): void {
    this.commit('Edit band', (t) => {
      const band = findBand(t, bandId)?.band;
      if (band) assignDefined(band as unknown as Record<string, unknown>, patch);
    });
  }

  /**
   * Removes a band. Detail bands cannot be removed on their own: remove the
   * region instead. Returns false when nothing was removed.
   */
  removeBand(bandId: string): boolean {
    const visit = findBand(this.state.template, bandId);
    if (!visit || visit.role === 'detail') return false;
    this.commit('Remove band', (t) => {
      const v = findBand(t, bandId)!;
      switch (v.role) {
        case 'reportHeader':
        case 'pageHeader':
        case 'pageFooter':
        case 'reportFooter':
          delete t[v.role];
          break;
        case 'static':
          t.body = t.body.filter((b) => b.id !== bandId);
          break;
        case 'regionHeader':
          delete v.region!.header;
          break;
        case 'regionFooter':
          delete v.region!.footer;
          break;
        case 'groupHeader':
        case 'groupFooter': {
          const key = v.role === 'groupHeader' ? 'header' : 'footer';
          const group = v.region!.groups!.find((g) => g[key]?.id === bandId);
          if (group) delete group[key];
          break;
        }
        default:
          break;
      }
    });
    return true;
  }

  /** Resizes a band by dragging its bottom edge; `height` is in template units. */
  resizeBand(bandId: string, height: number): void {
    const grid = this.state.settings.snapToGrid ? this.state.settings.grid : 0;
    this.commit('Resize band', (t) => {
      const band = findBand(t, bandId)?.band;
      if (!band) return;
      const minHeight = band.components.reduce((m, c) => Math.max(m, c.y + (c.type === 'line' && c.orientation === 'horizontal' ? 0 : c.height)), 0);
      const snapped = grid > 0 ? Math.round(height / grid) * grid : height;
      band.height = round(Math.max(0, minHeight, snapped));
    });
  }

  private defaultBandHeight(): number {
    const unit = this.state.template.unit;
    return { mm: 10, cm: 1, in: 0.4, pt: 28, px: 38 }[unit];
  }

  // -- components ---------------------------------------------------------------

  /** Adds a component to a band and selects it. Returns its id. */
  addComponent<T extends ComponentType>(bandId: string, type: T, overrides: Partial<Extract<ReportComponent, { type: T }>> = {}): string {
    const component = createComponent(type, this.defaultGeometry(type, overrides));
    this.commit(`Add ${type}`, (t) => {
      const band = findBand(t, bandId)?.band;
      if (!band) throw new Error(`Unknown band "${bandId}"`);
      band.components.push(component);
      growBandToFit(band, component);
      return { componentIds: [component.id], bandId };
    });
    return component.id;
  }

  private defaultGeometry<T extends ComponentType>(type: T, overrides: Partial<Extract<ReportComponent, { type: T }>>) {
    const factor = { mm: 1, cm: 0.1, in: 1 / 25.4, pt: 72 / 25.4, px: 96 / 25.4 }[this.state.template.unit];
    const sizes: Record<ComponentType, [number, number]> = { text: [40, 6], image: [30, 20], line: [40, 0], rectangle: [30, 15] };
    const [w, h] = sizes[type];
    return { width: round(w * factor), height: round(h * factor), ...overrides };
  }

  /**
   * Inserts a text bound to a data field, e.g. path ["customer", "name"]
   * becomes `{{ row.customer.name }}`. `root` defaults to "row".
   */
  insertField(bandId: string, path: string[], at: { x: number; y: number } = { x: 0, y: 0 }, root = 'row'): string {
    const expression = fieldExpression(root, path);
    return this.addComponent(bandId, 'text', { ...at, text: `{{ ${expression} }}`, name: path.join('.') });
  }

  /** Replaces properties of a component. Use `updateComponentStyle` for style changes. */
  updateComponent(id: string, patch: Partial<ReportComponent>): void {
    this.commit('Edit component', (t) => {
      const component = findComponent(t, id)?.component;
      if (!component) return;
      const { id: _id, type: _type, ...rest } = patch as Record<string, unknown>;
      assignDefined(component as unknown as Record<string, unknown>, rest);
    });
  }

  /** Merges style properties into the selected (or given) components. `undefined` removes a property. */
  updateComponentStyle(patch: Partial<Record<keyof StyleProps, unknown>>, ids = this.state.selection.componentIds): void {
    if (ids.length === 0) return;
    this.commit('Edit style', (t) => {
      for (const id of ids) {
        const component = findComponent(t, id)?.component;
        if (!component) continue;
        const style: Record<string, unknown> = { ...component.style };
        assignDefined(style, patch);
        if (Object.keys(style).length) component.style = style as StyleProps;
        else delete component.style;
      }
    });
  }

  /** Removes the selected (or given) components. */
  removeComponents(ids = this.state.selection.componentIds): void {
    if (ids.length === 0) return;
    const remove = new Set(ids);
    this.commit('Delete', (t) => {
      for (const { band } of walkBands(t)) band.components = band.components.filter((c) => !remove.has(c.id));
      return { componentIds: [], bandId: this.state.selection.bandId };
    });
  }

  /**
   * Moves components by a delta. Inside an interaction the delta is measured
   * from the drag start. Snaps the primary (first) component and moves the
   * others by the same amount. Positions stay non-negative.
   */
  moveComponents(ids: string[], dx: number, dy: number, snap = true): void {
    if (ids.length === 0) return;
    let guides: Guide[] = [];
    let bandId: string | null = null;
    this.commit('Move', (t) => {
      const found = ids.map((id) => findComponent(t, id)).filter((f): f is NonNullable<typeof f> => !!f);
      if (found.length === 0) return;
      const band = found[0]!.band.band;
      bandId = band.id;
      const comps = found.map((f) => f.component);
      guides = this.offsetComponents(comps, band, dx, dy, snap);
      for (const f of found) growBandToFit(f.band.band, f.component);
    });
    this.emit({ guides: bandId && guides.length ? { bandId, guides } : null });
  }

  /**
   * Moves components by a delta inside `band` (which must already contain
   * them), snapping the first one and keeping the group inside the band's
   * left/top edges. Returns the snap guides.
   */
  private offsetComponents(comps: ReportComponent[], band: Band, dx: number, dy: number, snap: boolean): Guide[] {
    const { settings } = this.state;
    const primary = comps[0]!;
    const minX = Math.min(...comps.map((c) => c.x));
    const minY = Math.min(...comps.map((c) => c.y));
    let ox = Math.max(dx, -minX);
    let oy = Math.max(dy, -minY);
    let guides: Guide[] = [];
    if (snap && (settings.snapToGrid || settings.snapToObjects)) {
      const moving = new Set(comps.map((c) => c.id));
      const others = band.components.filter((c) => !moving.has(c.id));
      const bounds = { x: 0, y: 0, width: this.bodyWidth(), height: band.height };
      const target = { ...primary, x: primary.x + ox, y: primary.y + oy };
      const snapped = snapMove(target, settings.snapToObjects ? others : [], bounds, {
        grid: settings.snapToGrid ? settings.grid : 0,
        tolerance: settings.snapToObjects ? settings.snapTolerance : 0,
      });
      guides = snapped.guides;
      ox = Math.max(snapped.rect.x - primary.x, -minX);
      oy = Math.max(snapped.rect.y - primary.y, -minY);
    }
    for (const c of comps) {
      c.x = round(c.x + ox);
      c.y = round(c.y + oy);
    }
    return guides;
  }

  /**
   * Moves components (all from one band) into another band while dragging.
   * `dx`/`dy` are measured from the components' original positions, in the
   * target band's coordinates: when the target band starts 30 units below the
   * source band, a pointer movement of 35 units down is `dy = 5`. Inside an
   * interaction the change is applied to the drag start state, so the drag can
   * move back and forth between bands. Moving to the components' own band is
   * the same as `moveComponents`.
   */
  moveComponentsToBand(ids: string[], bandId: string, dx: number, dy: number, snap = true): void {
    if (ids.length === 0) return;
    const base = this.transaction ? this.transaction.base : this.state.template;
    const first = findComponent(base, ids[0]!);
    if (!first || !findBand(base, bandId)) return;
    if (first.band.band.id === bandId) {
      this.moveComponents(ids, dx, dy, snap);
      return;
    }
    let guides: Guide[] = [];
    this.commit('Move to band', (t) => {
      const target = findBand(t, bandId)!.band;
      const moving = new Set(ids);
      const comps: ReportComponent[] = [];
      for (const id of ids) {
        const f = findComponent(t, id);
        if (!f || f.band.band === target) continue;
        f.band.band.components = f.band.band.components.filter((c) => c.id !== id);
        comps.push(f.component);
      }
      if (comps.length === 0) return undefined;
      target.components = [...target.components.filter((c) => !moving.has(c.id)), ...comps];
      guides = this.offsetComponents(comps, target, dx, dy, snap);
      for (const c of comps) growBandToFit(target, c);
      return { componentIds: comps.map((c) => c.id), bandId };
    });
    this.emit({ guides: guides.length ? { bandId, guides } : null });
  }

  /** Moves the selection by a small step (arrow keys). Uses the grid unless `fine` is true. */
  nudge(dxSteps: number, dySteps: number, fine = false): void {
    const step = fine || !this.state.settings.snapToGrid ? this.fineStep() : this.state.settings.grid;
    this.moveComponents(this.state.selection.componentIds, dxSteps * step, dySteps * step, false);
  }

  private fineStep(): number {
    return { mm: 0.5, cm: 0.05, in: 0.02, pt: 1, px: 1 }[this.state.template.unit];
  }

  /** Moves a component to another band at the given position (band coordinates). */
  moveComponentToBand(id: string, bandId: string, x: number, y: number): void {
    this.commit('Move to band', (t) => {
      const found = findComponent(t, id);
      const target = findBand(t, bandId)?.band;
      if (!found || !target) return;
      found.band.band.components = found.band.band.components.filter((c) => c.id !== id);
      const pos = clampPosition({ ...found.component, x, y });
      const grid = this.state.settings.snapToGrid ? this.state.settings.grid : 0;
      found.component.x = grid ? round(Math.round(pos.x / grid) * grid) : round(pos.x);
      found.component.y = grid ? round(Math.round(pos.y / grid) * grid) : round(pos.y);
      target.components.push(found.component);
      growBandToFit(target, found.component);
      return { componentIds: [id], bandId };
    });
  }

  /** Resizes a component with a handle; inside an interaction the delta is measured from the drag start. */
  resizeComponent(id: string, handle: ResizeHandle, dx: number, dy: number): void {
    this.resizeComponents([id], handle, dx, dy);
  }

  /**
   * Resizes several components with the same handle and delta, e.g. to make
   * every cell of a table row taller at once. Each component keeps its own
   * opposite edge fixed.
   */
  resizeComponents(ids: string[], handle: ResizeHandle, dx: number, dy: number): void {
    if (ids.length === 0) return;
    const grid = this.state.settings.snapToGrid ? this.state.settings.grid : 0;
    this.commit('Resize', (t) => {
      for (const id of ids) {
        const found = findComponent(t, id);
        if (!found) continue;
        const c = found.component;
        const isHLine = c.type === 'line' && c.orientation === 'horizontal';
        const isVLine = c.type === 'line' && c.orientation === 'vertical';
        const next = resizeRect(c, handle, isVLine ? 0 : dx, isHLine ? 0 : dy, grid, isHLine || isVLine ? 0 : this.fineStep());
        c.x = next.x;
        c.y = next.y;
        c.width = isVLine ? 0 : next.width;
        c.height = isHLine ? 0 : next.height;
        growBandToFit(found.band.band, c);
      }
    });
  }

  align(alignment: Alignment): void {
    const comps = this.selectedComponents();
    if (comps.length === 0) return;
    // A single component aligns to its band.
    const band = this.state.selection.bandId ? findBand(this.state.template, this.state.selection.bandId)?.band : undefined;
    const reference = comps.length === 1 && band ? { x: 0, y: 0, width: this.bodyWidth(), height: band.height } : undefined;
    const rects = alignRects(comps, alignment, reference);
    this.applyRects(comps.map((c) => c.id), rects, 'Align');
  }

  distribute(axis: 'horizontal' | 'vertical'): void {
    const comps = this.selectedComponents();
    if (comps.length < 3) return;
    this.applyRects(comps.map((c) => c.id), distributeRects(comps, axis), 'Distribute');
  }

  /** Gives the selected components the same width and/or height as the first one. */
  matchSize(dimension: 'width' | 'height' | 'both'): void {
    const comps = this.selectedComponents();
    if (comps.length < 2) return;
    const first = comps[0]!;
    const rects = comps.map((c) => ({
      ...c,
      width: dimension !== 'height' ? first.width : c.width,
      height: dimension !== 'width' ? first.height : c.height,
    }));
    this.applyRects(comps.map((c) => c.id), rects, 'Match size');
  }

  private applyRects(ids: string[], rects: Rect[], label: string): void {
    this.commit(label, (t) => {
      ids.forEach((id, i) => {
        const found = findComponent(t, id);
        const r = rects[i];
        if (!found || !r) return;
        const p = clampPosition(r);
        Object.assign(found.component, { x: round(p.x), y: round(p.y), width: round(r.width), height: round(r.height) });
        growBandToFit(found.band.band, found.component);
      });
    });
  }

  /** Changes paint order: components later in the band list are drawn on top. */
  reorder(where: 'front' | 'back' | 'forward' | 'backward'): void {
    const ids = new Set(this.state.selection.componentIds);
    if (ids.size === 0) return;
    this.commit('Reorder', (t) => {
      const band = this.state.selection.bandId ? findBand(t, this.state.selection.bandId)?.band : undefined;
      if (!band) return;
      const list = band.components;
      const sel = list.filter((c) => ids.has(c.id));
      const rest = list.filter((c) => !ids.has(c.id));
      if (where === 'front') band.components = [...rest, ...sel];
      else if (where === 'back') band.components = [...sel, ...rest];
      else {
        const out = [...list];
        const step = where === 'forward' ? 1 : -1;
        const indices = out.map((c, i) => (ids.has(c.id) ? i : -1)).filter((i) => i >= 0);
        if (step > 0) indices.reverse();
        for (const i of indices) {
          const j = i + step;
          if (j < 0 || j >= out.length || ids.has(out[j]!.id)) continue;
          [out[i], out[j]] = [out[j]!, out[i]!];
        }
        band.components = out;
      }
    });
  }

  // -- clipboard --------------------------------------------------------------------

  copy(): number {
    this.clipboard = cloneTemplate(this.selectedComponents());
    return this.clipboard.length;
  }

  cut(): number {
    const n = this.copy();
    if (n) this.removeComponents();
    return n;
  }

  /** Pastes into the selected band (or `bandId`), offset when pasting into the same place. Returns new ids. */
  paste(bandId = this.state.selection.bandId): string[] {
    if (!bandId || this.clipboard.length === 0) return [];
    const offset = this.state.settings.grid || this.fineStep();
    const copies = this.clipboard.map((c) => ({ ...cloneTemplate(c), id: generateId(c.type) }));
    this.commit('Paste', (t) => {
      const band = findBand(t, bandId)?.band;
      if (!band) return;
      for (const copy of copies) {
        const occupied = band.components.some((c) => c.x === copy.x && c.y === copy.y);
        if (occupied) {
          copy.x = round(copy.x + offset);
          copy.y = round(copy.y + offset);
        }
        band.components.push(copy);
        growBandToFit(band, copy);
      }
      return { componentIds: copies.map((c) => c.id), bandId };
    });
    // Next paste lands further down/right.
    this.clipboard = copies.map((c) => cloneTemplate(c));
    return copies.map((c) => c.id);
  }

  duplicate(): string[] {
    if (this.selectedComponents().length === 0) return [];
    const saved = this.clipboard;
    this.copy();
    const ids = this.paste();
    this.clipboard = saved;
    return ids;
  }

  // -- data sources, parameters and styles ---------------------------------------------

  setSampleData(data: unknown): void {
    this.sampleData = data;
  }

  getSampleData(): unknown {
    return this.sampleData;
  }

  addDataSource(def: DataSourceDefinition): void {
    this.commit('Add data source', (t) => {
      if (t.dataSources.some((d) => d.name === def.name)) throw new Error(`Data source "${def.name}" already exists`);
      t.dataSources.push(cloneTemplate(def));
    });
  }

  /** Updates a data source. Renaming also updates regions that use it. */
  updateDataSource(name: string, patch: Partial<DataSourceDefinition>): void {
    this.commit('Edit data source', (t) => {
      const ds = t.dataSources.find((d) => d.name === name);
      if (!ds) return;
      assignDefined(ds as unknown as Record<string, unknown>, patch);
      if (patch.name && patch.name !== name) {
        const rename = (r: DataRegion) => {
          if (r.dataSource === name) r.dataSource = patch.name;
          r.children?.forEach(rename);
        };
        t.body.forEach((b) => b.kind === 'dataRegion' && rename(b));
      }
    });
  }

  removeDataSource(name: string): void {
    this.commit('Remove data source', (t) => {
      t.dataSources = t.dataSources.filter((d) => d.name !== name);
    });
  }

  /** Infers a data source's fields from the sample data. Returns the field count. */
  inferDataSourceFields(name: string): number {
    const ds = this.state.template.dataSources.find((d) => d.name === name);
    if (!ds) return 0;
    const fields = inferFields(readPath(this.sampleData, ds.path ?? ds.name));
    this.updateDataSource(name, { fields });
    return fields.length;
  }

  addParameter(def: ParameterDefinition): void {
    this.commit('Add parameter', (t) => {
      if ((t.parameters ?? []).some((p) => p.name === def.name)) throw new Error(`Parameter "${def.name}" already exists`);
      (t.parameters ??= []).push(cloneTemplate(def));
    });
  }

  updateParameter(name: string, patch: Partial<ParameterDefinition>): void {
    this.commit('Edit parameter', (t) => {
      const p = t.parameters?.find((x) => x.name === name);
      if (p) assignDefined(p as unknown as Record<string, unknown>, patch);
    });
  }

  removeParameter(name: string): void {
    this.commit('Remove parameter', (t) => {
      t.parameters = (t.parameters ?? []).filter((p) => p.name !== name);
      if (t.parameters.length === 0) delete t.parameters;
    });
  }

  /** Creates or replaces a named style. */
  setStyle(name: string, style: StyleProps): void {
    this.commit('Edit style', (t) => {
      (t.styles ??= {})[name] = cloneTemplate(style);
    });
  }

  /** Removes a named style and detaches components that used it. */
  removeStyle(name: string): void {
    this.commit('Remove style', (t) => {
      if (t.styles) delete t.styles[name];
      for (const { band } of walkBands(t)) for (const c of band.components) if (c.styleName === name) delete c.styleName;
    });
  }

  /** Renames a named style and updates components that use it. */
  renameStyle(from: string, to: string): void {
    if (from === to) return;
    this.commit('Rename style', (t) => {
      const styles = t.styles ?? {};
      if (!(from in styles)) return;
      if (to in styles) throw new Error(`Style "${to}" already exists`);
      styles[to] = styles[from]!;
      delete styles[from];
      for (const { band } of walkBands(t)) for (const c of band.components) if (c.styleName === from) c.styleName = to;
    });
  }

  // -- expressions and preview -----------------------------------------------------

  /** Checks expression syntax; null when valid. */
  checkExpression(source: string): string | null {
    return checkExpression(source);
  }

  /**
   * Names available in expressions inside a band, for autocompletion:
   * scope variables, data sources, parameters and `row` fields.
   */
  completions(bandId?: string): string[] {
    const t = this.state.template;
    const names = new Set<string>(['params', 'report', 'page.number', 'page.count']);
    for (const ds of t.dataSources) names.add(ds.name);
    for (const p of t.parameters ?? []) names.add(`params.${p.name}`);
    for (const v of walkBands(t)) {
      if (v.role !== 'detail' || !v.region) continue;
      for (const part of ['rows', 'before', 'through']) names.add(`page.regions.${v.region.id}.${part}`);
    }
    const visit = bandId ? findBand(t, bandId) : undefined;
    if (visit?.region) {
      names.add('rows');
      if (visit.role !== 'regionHeader' && visit.role !== 'regionFooter') {
        names.add('row');
        names.add('rowNumber');
        const fields = this.regionFields(visit.region);
        const add = (prefix: string, defs: typeof fields) => {
          for (const f of defs ?? []) {
            const path = fieldExpression(prefix, [f.name]);
            names.add(path);
            if (f.type === 'object') add(path, f.fields);
          }
        };
        add('row', fields);
      }
      if (visit.role === 'groupHeader' || visit.role === 'groupFooter' || (visit.region.groups?.length ?? 0) > 0) {
        names.add('group.key');
        names.add('group.rows');
        names.add('group.count');
      }
      if (findRegion(t, visit.region.id)?.parent) names.add('parent');
    }
    return [...names];
  }

  /** Field schema of the rows a region iterates (from the data source or the parent's relation). */
  regionFields(region: DataRegion): DataSourceDefinition['fields'] {
    const t = this.state.template;
    if (region.dataSource) return t.dataSources.find((d) => d.name === region.dataSource)?.fields;
    const hit = findRegion(t, region.id);
    if (!hit?.parent || !region.relation) return undefined;
    let fields = this.regionFields(hit.parent);
    for (const key of region.relation.split('.')) fields = fields?.find((f) => f.name === key)?.fields;
    return fields;
  }

  /** Generates the report with the sample data. Errors are returned, not thrown. */
  preview(options: GenerateOptions = {}): { document: LayoutDocument | null; error: Error | null } {
    try {
      return { document: generateReport(this.state.template, this.sampleData ?? {}, options), error: null };
    } catch (err) {
      return { document: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // -- keyboard -------------------------------------------------------------------------

  /**
   * Handles designer shortcuts. Returns true when the key was handled, so
   * the view can call preventDefault(). Views should not forward keys typed
   * into inputs.
   */
  handleKey(e: KeyInput): boolean {
    const mod = !!(e.ctrlKey || e.metaKey);
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const hasSelection = this.state.selection.componentIds.length > 0;
    if (mod && key === 'z') {
      e.shiftKey ? this.redo() : this.undo();
      return true;
    }
    if (mod && key === 'y') {
      this.redo();
      return true;
    }
    if (mod && key === 'c') return this.copy() > 0;
    if (mod && key === 'x') return this.cut() > 0;
    if (mod && key === 'v') return this.paste().length > 0;
    if (mod && key === 'd') return this.duplicate().length > 0;
    if (mod && key === 'a') {
      this.selectAll();
      return !!this.state.selection.bandId;
    }
    if (key === 'Escape') {
      if (this.transaction) this.cancelInteraction();
      else this.clearSelection();
      return true;
    }
    if (!hasSelection) return false;
    if (key === 'Delete' || key === 'Backspace') {
      this.removeComponents();
      return true;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[key];
    if (dir) {
      this.nudge(dir[0], dir[1], !!e.altKey || !!e.shiftKey);
      return true;
    }
    return false;
  }
}

/** Assigns patch values; `undefined` deletes the key. */
function assignDefined(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete target[k];
    else target[k] = v;
  }
}

/** Grows a band so a component fits inside it vertically. */
function growBandToFit(band: Band, c: ReportComponent): void {
  const bottom = c.y + c.height;
  if (bottom > band.height) band.height = round(bottom);
}
