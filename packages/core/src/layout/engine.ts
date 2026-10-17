import { DEFAULT_LOCALE, formatValue, toDisplayString } from '../format/format';
import {
  compileExpression,
  compileText,
  ExpressionError,
  type CompiledText,
  type EvaluateOptions,
} from '../expressions';
import type {
  Band,
  DataRegion,
  ReportComponent,
  ReportTemplate,
  StyleProps,
  TextComponent,
} from '../model/types';
import { resolvePageSize, toPoints } from '../model/units';
import { parseTemplate } from '../model/validate';
import type { BandRole } from '../model/walk';
import { compareValues, readPath, sameGroupKey, sortKey, toRows } from './data';
import { mergeStyles, resolveBorder, resolveStyle } from './style';
import { createStandardFontMeasurer, LINE_HEIGHT_FACTOR, wrapText, type TextMeasurer } from './text';
import type { LayoutBand, LayoutDocument, LayoutIssue, LayoutItem, LayoutPage, LayoutTextRun } from './types';
import { parseHtmlText, resolveRuns, runsText, wrapRuns } from './html';
import { resolveBaseDirection } from './bidi';

export interface GenerateOptions {
  /** Values for template parameters; override parameter defaults. */
  params?: Record<string, unknown>;
  /** Overrides the template locale. */
  locale?: string;
  /** Extra functions callable from expressions. */
  functions?: EvaluateOptions['functions'];
  /** Text measurer. Defaults to PDF standard font metrics. */
  measurer?: TextMeasurer;
  /** Safety limit on the number of pages. Defaults to 10,000. */
  maxPages?: number;
  /** Maximum evaluation steps per expression. */
  maxSteps?: number;
  /** Validate the template first. Defaults to true. */
  validate?: boolean;
}

export const DEFAULT_MAX_PAGES = 10_000;
const MAX_ISSUES = 500;
export const ERROR_MARKER = '#ERROR';

type Scope = Record<string, unknown>;

/** A band to be printed, with its data scope, before pagination. */
interface Instance {
  band: Band;
  role: BandRole;
  regionId?: string;
  scope: Scope;
  pageBreakBefore: boolean;
  keepWithNext: boolean;
  /** Region headers to repeat at the top of a page that starts with this band. */
  repeatHeaders: Instance[];
}

interface GroupInfo {
  key: unknown;
  rows: unknown[];
  index: number;
  level: number;
  count: number;
}

interface Measured {
  height: number;
  items: LayoutItem[];
  backgroundColor?: string;
  border?: LayoutBand['border'];
}

interface PageState {
  number: number;
  bands: LayoutBand[];
  cursor: number;
  limit: number;
  contentPlaced: boolean;
  headerSlot?: number;
  footerSlot?: number;
}

class ReportGenerator {
  readonly issues: LayoutIssue[] = [];
  private readonly issueKeys = new Set<string>();
  private readonly texts = new Map<string, CompiledText>();
  private readonly unit;
  private readonly locale: string;
  private readonly evalOptions: EvaluateOptions;
  private readonly measurer: TextMeasurer;
  private readonly maxPages: number;
  private readonly pageWidth: number;
  private readonly pageHeight: number;
  private readonly margins: LayoutDocument['margins'];
  private readonly baseScope: Scope;
  private readonly sources = new Map<string, unknown[]>();

  constructor(
    private readonly template: ReportTemplate,
    data: unknown,
    options: GenerateOptions,
  ) {
    this.unit = template.unit;
    this.locale = options.locale ?? template.locale ?? DEFAULT_LOCALE;
    this.evalOptions = { locale: this.locale, functions: options.functions, maxSteps: options.maxSteps };
    this.measurer = options.measurer ?? createStandardFontMeasurer();
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    const size = resolvePageSize(template.page, template.unit);
    this.pageWidth = toPoints(size.width, this.unit);
    this.pageHeight = toPoints(size.height, this.unit);
    const m = template.page.margins;
    this.margins = {
      top: toPoints(m.top, this.unit),
      right: toPoints(m.right, this.unit),
      bottom: toPoints(m.bottom, this.unit),
      left: toPoints(m.left, this.unit),
    };

    const params: Scope = {};
    for (const p of template.parameters ?? []) params[p.name] = p.defaultValue ?? null;
    for (const [k, v] of Object.entries(options.params ?? {})) params[k] = v;

    const scope: Scope = {
      params: Object.freeze(params),
      report: Object.freeze({ name: template.name, description: template.description ?? '' }),
    };
    for (const ds of template.dataSources) {
      const rows = toRows(readPath(data, ds.path ?? ds.name));
      this.sources.set(ds.name, rows);
      scope[ds.name] = rows;
    }
    this.baseScope = scope;
  }

  // -- issues ---------------------------------------------------------------

  private issue(issue: LayoutIssue): void {
    const key = `${issue.severity}|${issue.bandId}|${issue.componentId}|${issue.expression}|${issue.message}`;
    if (this.issueKeys.has(key) || this.issues.length >= MAX_ISSUES) return;
    this.issueKeys.add(key);
    this.issues.push(issue);
  }

  private exprError(err: unknown, ctx: { bandId?: string; componentId?: string; expression: string }): void {
    const message = err instanceof Error ? err.message : String(err);
    const issue: LayoutIssue = { severity: 'error', message, expression: ctx.expression };
    if (ctx.bandId !== undefined) issue.bandId = ctx.bandId;
    if (ctx.componentId !== undefined) issue.componentId = ctx.componentId;
    this.issue(issue);
  }

  /** Evaluates an expression; on failure records an issue and returns `fallback`. */
  private evaluate(
    source: string,
    scope: Scope,
    fallback: unknown,
    ctx: { bandId?: string; componentId?: string },
  ): unknown {
    try {
      return compileExpression(source).evaluate(scope, this.evalOptions);
    } catch (err) {
      this.exprError(err, { ...ctx, expression: source });
      return fallback;
    }
  }

  private compiledText(source: string): CompiledText {
    let t = this.texts.get(source);
    if (!t) {
      t = compileText(source);
      this.texts.set(source, t);
    }
    return t;
  }

  // -- expansion: template + data -> band instances ------------------------

  expand(): Instance[] {
    const out: Instance[] = [];
    const t = this.template;
    if (t.reportHeader) out.push(this.instance(t.reportHeader, 'reportHeader', this.baseScope));
    for (const item of t.body) {
      if (item.kind === 'band') out.push(this.instance(item, 'static', this.baseScope));
      else this.expandRegion(item, this.baseScope, undefined, [], out);
    }
    if (t.reportFooter) out.push(this.instance(t.reportFooter, 'reportFooter', this.baseScope));
    return out;
  }

  private instance(
    band: Band,
    role: BandRole,
    scope: Scope,
    extra: Partial<Pick<Instance, 'regionId' | 'keepWithNext' | 'repeatHeaders'>> = {},
  ): Instance {
    const inst: Instance = {
      band,
      role,
      scope,
      pageBreakBefore: band.pageBreakBefore === true,
      keepWithNext: extra.keepWithNext ?? false,
      repeatHeaders: extra.repeatHeaders ?? [],
    };
    if (extra.regionId !== undefined) inst.regionId = extra.regionId;
    return inst;
  }

  private regionRows(region: DataRegion, parentRow: unknown): unknown[] {
    if (region.relation !== undefined) {
      if (parentRow === null || parentRow === undefined) return [];
      return toRows(readPath(parentRow, region.relation));
    }
    return this.sources.get(region.dataSource!) ?? [];
  }

  private expandRegion(
    region: DataRegion,
    outerScope: Scope,
    parentRow: unknown,
    repeatStack: Instance[],
    out: Instance[],
  ): void {
    const ctx = { bandId: region.id };
    const scopeBase: Scope = { ...outerScope, parent: parentRow ?? outerScope.parent ?? null };
    delete scopeBase.row;
    delete scopeBase.rowNumber;
    delete scopeBase.group;
    scopeBase.groups = [];

    let rows = this.regionRows(region, parentRow);
    if (region.filter) {
      const filter = region.filter;
      rows = rows.filter((row) => Boolean(this.evaluate(filter, { ...scopeBase, row }, false, ctx)));
    }

    const groups = region.groups ?? [];
    // Sort keys: group keys first (outermost first), then the region sort rules.
    const groupKeys = rows.map((row) =>
      groups.map((g) => this.evaluate(g.expression, { ...scopeBase, row }, null, { bandId: g.id })),
    );
    const sortRules = region.sort ?? [];
    const sortKeys = rows.map((row) =>
      sortRules.map((r) => sortKey(this.evaluate(r.expression, { ...scopeBase, row }, null, ctx))),
    );
    const order = rows.map((_, i) => i);
    const needsSort = sortRules.length > 0 || groups.some((g) => (g.sortDirection ?? 'asc') !== 'none');
    if (needsSort) {
      order.sort((a, b) => {
        for (let level = 0; level < groups.length; level++) {
          const dir = groups[level]!.sortDirection ?? 'asc';
          if (dir === 'none') continue;
          const c = compareValues(sortKey(groupKeys[a]![level]), sortKey(groupKeys[b]![level]), this.locale);
          if (c !== 0) return dir === 'desc' ? -c : c;
        }
        for (let i = 0; i < sortRules.length; i++) {
          const c = compareValues(sortKeys[a]![i], sortKeys[b]![i], this.locale);
          if (c !== 0) return sortRules[i]!.direction === 'desc' ? -c : c;
        }
        return a - b;
      });
    }
    const sortedRows = order.map((i) => rows[i]);
    const sortedKeys = order.map((i) => groupKeys[i]!);
    scopeBase.rows = sortedRows;

    const regionId = region.id;
    if (region.header) {
      const header = this.instance(region.header, 'regionHeader', scopeBase, {
        regionId,
        keepWithNext: true,
        repeatHeaders: repeatStack,
      });
      out.push(header);
      if (region.repeatHeaderOnEachPage) repeatStack = [...repeatStack, header];
    }

    let pendingGroupBreak = false;
    let rowNumber = 0;
    const push = (inst: Instance) => {
      if (pendingGroupBreak) {
        inst.pageBreakBefore = true;
        pendingGroupBreak = false;
      }
      out.push(inst);
    };

    const emit = (start: number, end: number, level: number, groupStack: GroupInfo[]) => {
      if (level === groups.length) {
        for (let i = start; i < end; i++) {
          const row = sortedRows[i];
          rowNumber++;
          const detailScope: Scope = {
            ...scopeBase,
            row,
            rowNumber,
            group: groupStack[groupStack.length - 1] ?? null,
            groups: groupStack,
          };
          push(this.instance(region.detail, 'detail', detailScope, { regionId, repeatHeaders: repeatStack }));
          for (const child of region.children ?? []) {
            const before = out.length;
            this.expandRegion(child, detailScope, row, repeatStack, out);
            if (pendingGroupBreak && out.length > before) {
              out[before]!.pageBreakBefore = true;
              pendingGroupBreak = false;
            }
          }
        }
        return;
      }
      const group = groups[level]!;
      let index = 0;
      let i = start;
      while (i < end) {
        let j = i + 1;
        while (j < end && sameGroupKey(sortedKeys[j]![level], sortedKeys[i]![level])) j++;
        const info: GroupInfo = {
          key: sortedKeys[i]![level],
          rows: sortedRows.slice(i, j),
          index,
          level,
          count: j - i,
        };
        const stack = [...groupStack, info];
        const groupScope: Scope = { ...scopeBase, row: sortedRows[i], group: info, groups: stack };
        if (index > 0 && group.pageBreakBefore) pendingGroupBreak = true;
        if (group.header) {
          push(
            this.instance(group.header, 'groupHeader', groupScope, {
              regionId,
              keepWithNext: true,
              repeatHeaders: repeatStack,
            }),
          );
        }
        emit(i, j, level + 1, stack);
        if (group.footer) {
          push(
            this.instance(group.footer, 'groupFooter', { ...groupScope, row: sortedRows[j - 1] }, {
              regionId,
              repeatHeaders: repeatStack,
            }),
          );
        }
        index++;
        i = j;
      }
    };
    emit(0, sortedRows.length, 0, []);

    if (region.footer) {
      const footerRepeat = region.repeatHeaderOnEachPage && region.header ? repeatStack.slice(0, -1) : repeatStack;
      push(this.instance(region.footer, 'regionFooter', scopeBase, { regionId, repeatHeaders: footerRepeat }));
    }
  }

  // -- measuring: band instance -> items ------------------------------------

  private componentStyle(c: ReportComponent, scope: Scope, bandId: string): StyleProps {
    const named = c.styleName ? this.template.styles?.[c.styleName] : undefined;
    const layers: (StyleProps | undefined)[] = [named, c.style];
    for (const cond of c.conditions ?? []) {
      if (this.evaluate(cond.expression, scope, false, { bandId, componentId: c.id })) layers.push(cond.style);
    }
    return mergeStyles(...layers);
  }

  private measureComponent(c: ReportComponent, scope: Scope, bandId: string): LayoutItem | null {
    const ctx = { bandId, componentId: c.id };
    if (c.visible !== undefined && !this.evaluate(c.visible, scope, true, ctx)) return null;

    const raw = this.componentStyle(c, scope, bandId);
    const style = resolveStyle(raw, this.unit);
    const base = {
      componentId: c.id,
      x: toPoints(c.x, this.unit),
      y: toPoints(c.y, this.unit),
      width: toPoints(c.width, this.unit),
      height: toPoints(c.height, this.unit),
      style,
    };

    switch (c.type) {
      case 'text':
        return this.measureText(c, base, ctx, scope, raw);
      case 'image': {
        let src = '';
        try {
          src = this.compiledText(c.src).evaluate(scope, this.evalOptions);
        } catch (err) {
          this.exprError(err, { ...ctx, expression: c.src });
        }
        return { ...base, kind: 'image', src, fit: c.fit ?? 'contain' };
      }
      case 'line': {
        const lineWidth = raw.border?.width ?? 1;
        const color = raw.border?.color ?? style.color;
        const lineStyle = raw.border?.style ?? 'solid';
        const horizontal = c.orientation === 'horizontal';
        return {
          ...base,
          kind: 'line',
          x1: base.x,
          y1: base.y,
          x2: horizontal ? base.x + base.width : base.x,
          y2: horizontal ? base.y : base.y + base.height,
          lineWidth,
          color,
          lineStyle,
        };
      }
      case 'rectangle':
        return { ...base, kind: 'rectangle', cornerRadius: toPoints(c.cornerRadius ?? 0, this.unit) };
    }
  }

  private measureText(
    c: TextComponent,
    base: Omit<Extract<LayoutItem, { kind: 'text' }>, 'kind' | 'text' | 'lines' | 'lineHeight' | 'value'>,
    ctx: { bandId: string; componentId: string },
    scope: Scope,
    raw: StyleProps,
  ): LayoutItem {
    let text: string;
    let value: unknown;
    let error = false;
    try {
      const compiled = this.compiledText(c.text);
      if (compiled.isSingleExpression) {
        value = compiled.evaluateValue(scope, this.evalOptions);
        text = formatValue(value, c.format, this.locale);
      } else {
        const format = c.format;
        text = compiled.evaluate(scope, {
          ...this.evalOptions,
          stringify: format ? (v) => formatValue(v, format, this.locale) : toDisplayString,
        });
        value = text;
      }
    } catch (err) {
      const expression = err instanceof ExpressionError && err.source ? err.source : c.text;
      this.exprError(err, { ...ctx, expression });
      text = ERROR_MARKER;
      value = ERROR_MARKER;
      error = true;
    }

    const { style } = base;
    const font = {
      family: style.fontFamily,
      size: style.fontSize,
      bold: style.fontWeight === 'bold',
      italic: style.fontStyle === 'italic',
    };
    const innerWidth = Math.max(0, base.width - style.padding.left - style.padding.right);
    let lines: string[];
    let runs: LayoutTextRun[][] | undefined;
    let richText: LayoutTextRun[] | undefined;
    if (c.allowHtml && !error) {
      richText = resolveRuns(parseHtmlText(text), {
        bold: font.bold,
        italic: font.italic,
        underline: style.textDecoration === 'underline',
        strike: style.textDecoration === 'line-through',
        color: style.color,
      });
      runs = wrapRuns(richText, innerWidth, font, this.measurer, c.wordWrap !== false);
      lines = runs.map(runsText);
      text = runsText(richText);
      if (typeof value === 'string') value = text;
    } else {
      lines = wrapText(text, innerWidth, font, this.measurer, c.wordWrap !== false);
    }
    const lineHeight = style.fontSize * LINE_HEIGHT_FACTOR;
    let height = base.height;
    if (c.canGrow) {
      height = Math.max(height, lines.length * lineHeight + style.padding.top + style.padding.bottom);
    }
    const direction = resolveBaseDirection(text, style.direction);
    // `auto` text that turns out right-to-left starts at the right edge unless an alignment is set.
    const itemStyle = direction === 'rtl' && raw.textAlign === undefined ? { ...style, textAlign: 'right' as const } : style;
    const item: LayoutItem = { ...base, style: itemStyle, height, kind: 'text', text, lines, lineHeight, direction, value };
    if (c.format) item.format = c.format;
    if (error) item.error = true;
    if (runs && richText) {
      item.runs = runs;
      item.richText = richText;
    }
    return item;
  }

  measureBand(inst: Instance, page: object, fixedHeight = false): Measured | null {
    const scope: Scope = { ...inst.scope, page };
    const band = inst.band;
    if (band.visible !== undefined && !this.evaluate(band.visible, scope, true, { bandId: band.id })) return null;

    const items: LayoutItem[] = [];
    for (const c of band.components) {
      const item = this.measureComponent(c, scope, band.id);
      if (item) items.push(item);
    }
    let height = toPoints(band.height, this.unit);
    const contentBottom = items.reduce((max, it) => Math.max(max, it.y + it.height), 0);
    if (!fixedHeight) {
      if (band.canGrow !== false) height = Math.max(height, contentBottom);
      if (band.canShrink) height = Math.min(height, contentBottom);
    }
    // Components that fill the band vertically follow its final height.
    const growIds = new Set(band.components.filter((c) => c.growToHeight).map((c) => c.id));
    if (growIds.size > 0) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        if (!growIds.has(it.componentId)) continue;
        const target = height - it.y;
        if (target <= it.height) continue;
        const grown = { ...it, height: target };
        if (grown.kind === 'line' && grown.x1 === grown.x2) grown.y2 = grown.y1 + target;
        items[i] = grown;
      }
    }
    const style = band.style ? resolveStyle(band.style, this.unit) : undefined;
    const measured: Measured = { height, items };
    if (style?.backgroundColor) measured.backgroundColor = style.backgroundColor;
    const border = resolveBorder(band.style?.border);
    if (border) measured.border = border;
    return measured;
  }

  // -- pagination -----------------------------------------------------------

  paginate(instances: Instance[], pageCount: number | null): { pages: LayoutPage[]; countUsed: boolean } {
    const t = this.template;
    const pages: PageState[] = [];
    let countUsed = false;
    const bodyTop = this.margins.top;
    const bodyBottom = this.pageHeight - this.margins.bottom;
    const bodyWidth = this.pageWidth - this.margins.left - this.margins.right;
    const pageHeaderHeight = t.pageHeader ? toPoints(t.pageHeader.height, this.unit) : 0;
    const pageFooterHeight = t.pageFooter ? toPoints(t.pageFooter.height, this.unit) : 0;
    const hasReportHeader = instances[0]?.role === 'reportHeader';

    // Detail rows placed so far, per data region, with the page they landed on.
    const placed = new Map<string, { row: unknown; page: number }[]>();
    const collectRegions = (region: DataRegion) => {
      placed.set(region.id, []);
      for (const child of region.children ?? []) collectRegions(child);
    };
    for (const item of t.body) if (item.kind === 'dataRegion') collectRegions(item);
    const rowsWhere = (id: string, test: (page: number) => boolean) =>
      (placed.get(id) ?? []).filter((p) => test(p.page)).map((p) => p.row);
    /**
     * `page.regions[id]` exposes the rows of a data region relative to a page:
     * `rows` (on this page), `before` (on earlier pages) and `through` (up to
     * and including this page). Used for brought/carried-forward totals.
     */
    const regionsFor = (number: number) => {
      const regions: Record<string, unknown> = {};
      for (const id of placed.keys()) {
        const entry = {};
        Object.defineProperties(entry, {
          rows: { enumerable: true, get: () => rowsWhere(id, (p) => p === number) },
          before: { enumerable: true, get: () => rowsWhere(id, (p) => p < number) },
          through: { enumerable: true, get: () => rowsWhere(id, (p) => p <= number) },
        });
        regions[id] = Object.freeze(entry);
      }
      return Object.freeze(regions);
    };

    const pageObject = (number: number) => {
      const page = { number };
      Object.defineProperty(page, 'count', {
        enumerable: true,
        get: () => {
          countUsed = true;
          return pageCount;
        },
      });
      Object.defineProperty(page, 'regions', { enumerable: true, get: () => regionsFor(number) });
      return page;
    };

    let page!: PageState;
    let pageScope!: object;

    const placeBand = (inst: Instance, m: Measured, repeated = false) => {
      const band: LayoutBand = {
        bandId: inst.band.id,
        role: inst.role,
        x: this.margins.left,
        y: page.cursor,
        width: bodyWidth,
        height: m.height,
        items: m.items.map((it) => offsetItem(it, this.margins.left, page.cursor)),
      };
      if (inst.regionId !== undefined) band.regionId = inst.regionId;
      if (inst.role === 'detail' && inst.regionId !== undefined && !repeated) {
        placed.get(inst.regionId)?.push({ row: inst.scope.row, page: page.number });
      }
      if (repeated) band.repeated = true;
      if (m.backgroundColor) band.backgroundColor = m.backgroundColor;
      if (m.border) band.border = m.border;
      page.bands.push(band);
      page.cursor += m.height;
    };

    const reservePageHeader = () => {
      if (t.pageHeader && (page.number > 1 || t.pageHeader.printOnFirstPage !== false)) {
        page.headerSlot = page.cursor;
        page.cursor += pageHeaderHeight;
      }
    };

    const newPage = (repeatHeaders: Instance[]) => {
      const number = pages.length + 1;
      if (number > this.maxPages) {
        throw new Error(`Report exceeds the limit of ${this.maxPages} pages`);
      }
      page = { number, bands: [], cursor: bodyTop, limit: bodyBottom, contentPlaced: false };
      pageScope = pageObject(number);
      pages.push(page);
      if (t.pageFooter && (number > 1 || t.pageFooter.printOnFirstPage !== false)) {
        page.footerSlot = bodyBottom - pageFooterHeight;
        page.limit = page.footerSlot;
      }
      // On the first page the page header follows the report header.
      if (!(number === 1 && hasReportHeader)) reservePageHeader();
      for (const header of repeatHeaders) {
        const m = this.measureBand(header, pageScope);
        if (m) placeBand(header, m, true);
      }
    };

    newPage([]);
    let breakPending = false;

    // Measurements depend only on the page number, so cache per instance.
    const cache = new Map<number, { page: number; m: Measured | null }>();
    const measure = (index: number): Measured | null => {
      const hit = cache.get(index);
      if (hit && hit.page === page.number) return hit.m;
      const m = this.measureBand(instances[index]!, pageScope);
      cache.set(index, { page: page.number, m });
      return m;
    };

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]!;
      if ((inst.pageBreakBefore || breakPending) && page.contentPlaced) newPage(inst.repeatHeaders);
      breakPending = false;

      let m = measure(i);
      if (!m) {
        // A hidden report header still has to make room for the page header.
        if (inst.role === 'reportHeader' && page.number === 1) reservePageHeader();
        continue;
      }

      // Keep headers with the first band that follows them.
      let needed = m.height;
      for (let j = i; j < instances.length && instances[j]!.keepWithNext && j - i < 10; j++) {
        const next = j + 1 < instances.length ? measure(j + 1) : null;
        if (next) needed += next.height;
      }

      if (page.cursor + needed > page.limit + 1e-6 && page.contentPlaced) {
        newPage(inst.repeatHeaders);
        m = measure(i);
        if (!m) continue;
      }
      if (page.cursor + m.height > page.limit + 1e-6) {
        this.issue({
          severity: 'warning',
          message: 'Band is taller than the available page area and was clipped',
          bandId: inst.band.id,
        });
      }
      placeBand(inst, m);
      page.contentPlaced = true;
      if (inst.role === 'reportHeader' && page.number === 1) reservePageHeader();
      if (inst.band.pageBreakAfter) breakPending = true;
    }

    // Page headers and footers know the final page count.
    const total = pages.length;
    for (const p of pages) {
      const isLast = p.number === total;
      const scope = { number: p.number, count: total, regions: regionsFor(p.number) };
      const extra: LayoutBand[] = [];
      for (const [band, role, slot] of [
        [t.pageHeader, 'pageHeader', p.headerSlot],
        [t.pageFooter, 'pageFooter', p.footerSlot],
      ] as const) {
        if (!band || slot === undefined) continue;
        if (isLast && band.printOnLastPage === false) continue;
        const inst = this.instance(band, role, this.baseScope);
        const m = this.measureBand(inst, scope, true);
        if (!m) continue;
        const layoutBand: LayoutBand = {
          bandId: band.id,
          role,
          x: this.margins.left,
          y: slot,
          width: bodyWidth,
          height: m.height,
          items: m.items.map((it) => offsetItem(it, this.margins.left, slot)),
        };
        if (m.backgroundColor) layoutBand.backgroundColor = m.backgroundColor;
        if (m.border) layoutBand.border = m.border;
        extra.push(layoutBand);
      }
      p.bands.push(...extra);
      p.bands.sort((a, b) => a.y - b.y);
    }

    return { pages: pages.map((p) => ({ number: p.number, bands: p.bands })), countUsed };
  }

  document(pages: LayoutPage[]): LayoutDocument {
    return {
      name: this.template.name,
      locale: this.locale,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      margins: this.margins,
      pages,
      issues: this.issues,
    };
  }
}

function offsetItem(item: LayoutItem, dx: number, dy: number): LayoutItem {
  const moved = { ...item, x: item.x + dx, y: item.y + dy };
  if (moved.kind === 'line') {
    moved.x1 += dx;
    moved.x2 += dx;
    moved.y1 += dy;
    moved.y2 += dy;
  }
  return moved;
}

/**
 * Generates a paginated layout document from a template and JSON data.
 * Throws `TemplateValidationError` for invalid templates. Expression errors
 * do not throw: the affected text shows `#ERROR` and the error is listed in
 * `issues`.
 */
export function generateReport(
  template: ReportTemplate | string,
  data: unknown,
  options: GenerateOptions = {},
): LayoutDocument {
  const t = options.validate === false && typeof template !== 'string' ? template : parseTemplate(template);
  const generator = new ReportGenerator(t, data, options);
  const instances = generator.expand();
  let result = generator.paginate(instances, null);
  // Bands that print `page.count` in the body need a second pass once the total is known.
  for (let pass = 0; pass < 2 && result.countUsed; pass++) {
    const count = result.pages.length;
    result = generator.paginate(instances, count);
    if (result.pages.length === count) break;
  }
  return generator.document(result.pages);
}
