import { describe, expect, it, vi } from 'vitest';
import {
  DesignerController,
  findBand,
  findComponent,
  TemplateValidationError,
  validateTemplate,
  type DesignerState,
  type ReportTemplate,
  type TextComponent,
} from '../../src';
import { invoiceTemplate } from '../fixtures/invoice';

const make = (template: ReportTemplate = invoiceTemplate(), settings = { snapToGrid: false, snapToObjects: false }) =>
  new DesignerController({ template, settings });

const comp = (c: DesignerController, id: string) => findComponent(c.template, id)!.component;
const band = (c: DesignerController, id: string) => findBand(c.template, id)!.band;

describe('construction, load and save', () => {
  it('starts with a blank valid template by default', () => {
    const c = new DesignerController();
    expect(c.template.schemaVersion).toBe(1);
    expect(c.getState()).toMatchObject({ canUndo: false, canRedo: false, dirty: false, errors: [], interacting: false });
    expect(c.getState().settings).toMatchObject({ grid: 2.5, showGrid: true });
  });

  it('accepts JSON text and rejects invalid templates', () => {
    const c = new DesignerController({ template: JSON.stringify(invoiceTemplate()) });
    expect(c.template.name).toBe('Orders by customer');
    expect(() => new DesignerController({ template: '{"x":1}' })).toThrow(TemplateValidationError);
    expect(() => c.load('nope')).toThrow(TemplateValidationError);
  });

  it('load replaces the template and clears history and selection', () => {
    const c = make();
    c.select(['d_id']);
    c.removeComponents();
    c.load(invoiceTemplate());
    expect(c.getState()).toMatchObject({ canUndo: false, dirty: false, selection: { componentIds: [], bandId: null } });
    expect(comp(c, 'd_id')).toBeDefined();
  });

  it('serializes to JSON that loads back identically', () => {
    const c = make();
    expect(JSON.parse(c.toJSON())).toEqual(invoiceTemplate());
    expect(c.toJSON(false)).not.toContain('\n');
  });

  it('tracks dirty state against the last save, including undo back to it', () => {
    const c = make();
    c.updateComponent('d_id', { x: 5 });
    expect(c.getState().dirty).toBe(true);
    c.undo();
    expect(c.getState().dirty).toBe(false);
    c.redo();
    c.markSaved();
    expect(c.getState().dirty).toBe(false);
    c.undo();
    expect(c.getState().dirty).toBe(true);
  });

  it('notifies subscribers with new template objects and never mutates old ones', () => {
    const c = make();
    const states: DesignerState[] = [];
    const off = c.subscribe((s) => states.push(s));
    const before = c.template;
    c.updateComponent('d_id', { x: 42 });
    expect(states).toHaveLength(1);
    expect(states[0]!.template).not.toBe(before);
    expect(findComponent(before, 'd_id')!.component.x).toBe(0);
    off();
    c.updateComponent('d_id', { x: 1 });
    expect(states).toHaveLength(1);
  });

  it('keeps validation errors up to date', () => {
    const c = make();
    c.updateComponent('d_id', { visible: 'row.id >' } as never);
    expect(c.getState().errors.map((e) => e.path)).toEqual(['body[0].detail.components[0].visible']);
    c.undo();
    expect(c.getState().errors).toEqual([]);
  });
});

describe('undo and redo', () => {
  it('undoes and redoes changes with labels and restores selection', () => {
    const c = make();
    c.select(['d_id']);
    c.removeComponents();
    expect(c.undoLabel).toBe('Delete');
    expect(comp(c, 'd_total')).toBeDefined();
    expect(findComponent(c.template, 'd_id')).toBeUndefined();
    c.undo();
    expect(comp(c, 'd_id')).toBeDefined();
    expect(c.getState().selection.componentIds).toEqual(['d_id']);
    expect(c.redoLabel).toBe('Delete');
    c.redo();
    expect(findComponent(c.template, 'd_id')).toBeUndefined();
    expect(c.getState().selection.componentIds).toEqual([]);
  });

  it('clears redo after a new change and respects the history limit', () => {
    const c = new DesignerController({ template: invoiceTemplate(), historyLimit: 3 });
    for (let i = 1; i <= 5; i++) c.updateComponent('d_id', { x: i });
    c.undo();
    c.undo();
    c.undo();
    expect(c.getState().canUndo).toBe(false);
    expect(comp(c, 'd_id').x).toBe(2);
    c.updateComponent('d_id', { x: 9 });
    expect(c.getState().canRedo).toBe(false);
  });

  it('ignores undo and redo with empty stacks', () => {
    const c = make();
    c.undo();
    c.redo();
    expect(c.template).toEqual(invoiceTemplate());
  });
});

describe('selection', () => {
  it('replaces, adds and toggles within one band', () => {
    const c = make();
    c.select(['d_id']);
    expect(c.getState().selection).toEqual({ componentIds: ['d_id'], bandId: 'order_detail' });
    c.select(['d_total'], 'add');
    expect(c.getState().selection.componentIds).toEqual(['d_id', 'd_total']);
    c.select(['d_id'], 'toggle');
    expect(c.getState().selection.componentIds).toEqual(['d_total']);
    c.select(['title'], 'add');
    expect(c.getState().selection).toEqual({ componentIds: ['title'], bandId: 'rh' });
    c.select(['nope']);
    expect(c.getState().selection).toEqual({ componentIds: [], bandId: null });
  });

  it('keeps only components from the first band on mixed replace', () => {
    const c = make();
    c.select(['d_id', 'title', 'd_total']);
    expect(c.getState().selection.componentIds).toEqual(['d_id', 'd_total']);
  });

  it('selects bands, all components and by rectangle', () => {
    const c = make();
    c.selectBand('order_detail');
    expect(c.getState().selection).toEqual({ componentIds: [], bandId: 'order_detail' });
    c.selectAll();
    expect(c.getState().selection.componentIds).toEqual(['d_id', 'd_total']);
    c.selectInRect('order_detail', { x: 140, y: 0, width: 20, height: 3 });
    expect(c.getState().selection.componentIds).toEqual(['d_total']);
    c.selectInRect('order_detail', { x: 0, y: 0, width: 5, height: 5 }, true);
    expect(c.getState().selection.componentIds).toEqual(['d_total', 'd_id']);
    c.selectBand('missing');
    expect(c.getState().selection.bandId).toBeNull();
    c.clearSelection();
    c.selectAll();
    expect(c.getState().selection.componentIds).toEqual([]);
  });

  it('returns selected components', () => {
    const c = make();
    c.select(['d_total', 'd_id']);
    expect(c.selectedComponents().map((x) => x.id)).toEqual(['d_total', 'd_id']);
  });
});

describe('components', () => {
  it('adds components with unit-aware default sizes, selects them and grows the band', () => {
    const c = make();
    const id = c.addComponent('pf', 'text', { y: 5, text: 'Hi' });
    expect(c.getState().selection).toEqual({ componentIds: [id], bandId: 'pf' });
    expect(comp(c, id)).toMatchObject({ type: 'text', text: 'Hi', width: 40, height: 6, y: 5 });
    expect(band(c, 'pf').height).toBe(11);
    expect(validateTemplate(c.template).errors).toEqual([]);
    const pt = new DesignerController({ template: { ...invoiceTemplate(), unit: 'pt' } as ReportTemplate });
    const img = pt.addComponent('rf', 'image');
    expect(comp(pt, img).width).toBeCloseTo(85.039, 3);
    expect(() => c.addComponent('missing', 'text')).toThrow(/Unknown band/);
  });

  it('inserts bound fields', () => {
    const c = make();
    const id = c.insertField('order_detail', ['customer'], { x: 40, y: 0 });
    expect(comp(c, id)).toMatchObject({ text: '{{ row.customer }}', x: 40, name: 'customer' });
    const nested = c.insertField('order_detail', ['unit price'], undefined, 'parent');
    expect((comp(c, nested) as TextComponent).text).toBe('{{ parent["unit price"] }}');
  });

  it('updates properties and styles, deleting undefined keys', () => {
    const c = make();
    c.updateComponent('d_id', { x: 3, name: 'Order id', id: 'hacked' } as never);
    expect(comp(c, 'd_id')).toMatchObject({ x: 3, name: 'Order id' });
    c.updateComponent('d_id', { name: undefined });
    expect(comp(c, 'd_id').name).toBeUndefined();
    c.select(['d_id', 'd_total']);
    c.updateComponentStyle({ color: '#ff0000', fontSize: 12 });
    expect(comp(c, 'd_id').style).toEqual({ color: '#ff0000', fontSize: 12 });
    c.updateComponentStyle({ color: undefined, fontSize: undefined });
    expect(comp(c, 'd_id').style).toBeUndefined();
    const undoDepth = c.undoLabel;
    c.clearSelection();
    c.updateComponentStyle({ color: '#000' });
    expect(c.undoLabel).toBe(undoDepth);
  });

  it('removes components', () => {
    const c = make();
    c.removeComponents(['d_id', 'title']);
    expect(findComponent(c.template, 'd_id')).toBeUndefined();
    expect(findComponent(c.template, 'title')).toBeUndefined();
    const label = c.undoLabel;
    c.removeComponents([]);
    expect(c.undoLabel).toBe(label);
  });

  it('moves components, keeping them inside the band origin and growing the band', () => {
    const c = make();
    c.moveComponents(['d_id', 'd_total'], -5, 3, false);
    expect(comp(c, 'd_id')).toMatchObject({ x: 0, y: 3 });
    expect(comp(c, 'd_total')).toMatchObject({ x: 150, y: 3 });
    expect(band(c, 'order_detail').height).toBe(10);
  });

  it('snaps the primary component and moves the rest by the same offset, publishing guides', () => {
    const c = new DesignerController({ template: invoiceTemplate(), settings: { grid: 5, snapToGrid: true, snapToObjects: false } });
    c.moveComponents(['d_id', 'd_total'], 1.7, 0);
    expect(comp(c, 'd_id').x).toBe(0);
    c.moveComponents(['d_id', 'd_total'], 3.2, 0);
    expect(comp(c, 'd_id').x).toBe(5);
    expect(comp(c, 'd_total').x).toBe(155);
    expect(c.getState().guides).toBeNull();

    const o = new DesignerController({ template: invoiceTemplate(), settings: { snapToGrid: false, snapToObjects: true, snapTolerance: 1 } });
    o.moveComponents(['d_id'], 119.4, 0);
    expect(comp(o, 'd_id').x).toBe(120); // right edge (150) meets d_total's left edge
    expect(o.getState().guides).toEqual({ bandId: 'order_detail', guides: [{ orientation: 'vertical', position: 150 }, { orientation: 'horizontal', position: 0 }] });
  });

  it('turns a drag into one undo step measured from the drag start', () => {
    const c = make();
    c.beginInteraction('Move');
    expect(c.getState().interacting).toBe(true);
    c.moveComponents(['d_id'], 1, 0, false);
    c.moveComponents(['d_id'], 2, 0, false);
    c.moveComponents(['d_id'], 3, 1, false);
    expect(comp(c, 'd_id')).toMatchObject({ x: 3, y: 1 });
    c.endInteraction();
    expect(c.getState()).toMatchObject({ interacting: false, guides: null });
    c.undo();
    expect(comp(c, 'd_id')).toMatchObject({ x: 0, y: 0 });
    expect(c.getState().canUndo).toBe(false);
  });

  it('cancels a drag and skips empty interactions', () => {
    const c = make();
    c.beginInteraction('Move');
    c.moveComponents(['d_id'], 10, 0, false);
    c.cancelInteraction();
    expect(comp(c, 'd_id').x).toBe(0);
    c.beginInteraction('Nothing');
    c.endInteraction();
    expect(c.getState().canUndo).toBe(false);
  });

  it('nudges by grid or fine steps', () => {
    const c = new DesignerController({ template: invoiceTemplate(), settings: { grid: 2.5, snapToGrid: true } });
    c.select(['d_id']);
    c.nudge(1, 0);
    expect(comp(c, 'd_id').x).toBe(2.5);
    c.nudge(0, 1, true);
    expect(comp(c, 'd_id').y).toBe(0.5);
  });

  it('moves a component to another band', () => {
    const c = make();
    c.moveComponentToBand('d_id', 'rf', 30.2, 1);
    expect(band(c, 'order_detail').components.map((x) => x.id)).toEqual(['d_total']);
    expect(comp(c, 'd_id')).toMatchObject({ x: 30.2, y: 1 });
    expect(c.getState().selection).toEqual({ componentIds: ['d_id'], bandId: 'rf' });
    const g = new DesignerController({ template: invoiceTemplate(), settings: { grid: 5, snapToGrid: true } });
    g.moveComponentToBand('d_id', 'rf', 31, -4);
    expect(comp(g, 'd_id')).toMatchObject({ x: 30, y: 0 });
  });

  it('resizes components; lines only change length', () => {
    const c = make();
    c.beginInteraction('Resize');
    c.resizeComponent('d_id', 'se', 5, 2);
    c.resizeComponent('d_id', 'se', 10, 3);
    c.endInteraction();
    expect(comp(c, 'd_id')).toMatchObject({ width: 40, height: 10 });
    expect(band(c, 'order_detail').height).toBe(10);
    c.resizeComponent('ph_line', 'se', 10, 10);
    expect(comp(c, 'ph_line')).toMatchObject({ width: 200, height: 0 });
    c.resizeComponent('d_id', 'e', -100, 0);
    expect(comp(c, 'd_id').width).toBe(0.5);
  });

  it('aligns, distributes, matches size and reorders', () => {
    const c = make();
    c.select(['d_id', 'd_total']);
    c.align('right');
    expect(comp(c, 'd_id').x + comp(c, 'd_id').width).toBe(190);
    c.select(['d_id']);
    c.align('center');
    expect(comp(c, 'd_id').x).toBe(80);
    c.addComponent('order_detail', 'text', { x: 0 });
    c.updateComponent('d_id', { x: 50 });
    c.select(band(c, 'order_detail').components.map((x) => x.id));
    c.distribute('horizontal');
    // Widths 30, 40, 40 between 0 and 190 leave two 40-unit gaps.
    expect(band(c, 'order_detail').components.map((x) => x.x)).toEqual([80, 150, 0]);
    c.matchSize('both');
    expect(new Set(band(c, 'order_detail').components.map((x) => `${x.width}x${x.height}`)).size).toBe(1);
    c.select(['d_id']);
    c.reorder('front');
    expect(band(c, 'order_detail').components.at(-1)!.id).toBe('d_id');
    c.reorder('backward');
    expect(band(c, 'order_detail').components[1]!.id).toBe('d_id');
    c.reorder('back');
    expect(band(c, 'order_detail').components[0]!.id).toBe('d_id');
    c.reorder('forward');
    expect(band(c, 'order_detail').components[1]!.id).toBe('d_id');
  });

  it('copies, pastes with an offset, cuts and duplicates with new ids', () => {
    const c = make();
    c.select(['d_id']);
    expect(c.copy()).toBe(1);
    const [p1] = c.paste();
    expect(p1).not.toBe('d_id');
    expect(comp(c, p1!)).toMatchObject({ x: 2.5, y: 2.5, text: '#{{ row.id }}' });
    const [p2] = c.paste();
    expect(comp(c, p2!)).toMatchObject({ x: 5, y: 5 });
    c.select(['d_total']);
    const [dup] = c.duplicate();
    expect(comp(c, dup!).x).toBe(152.5);
    const [p3] = c.paste('rf');
    expect(findComponent(c.template, p3!)!.band.band.id).toBe('rf');
    c.select(['d_total']);
    expect(c.cut()).toBe(1);
    expect(findComponent(c.template, 'd_total')).toBeUndefined();
    expect(validateTemplate(c.template).errors).toEqual([]);
    c.clearSelection();
    expect(c.paste()).toEqual([]);
    expect(c.duplicate()).toEqual([]);
  });
});

describe('bands and regions', () => {
  it('toggles page bands', () => {
    const c = make();
    expect(c.setPageBand('pageHeader', false)).toBeNull();
    expect(c.template.pageHeader).toBeUndefined();
    const id = c.setPageBand('pageHeader', true)!;
    expect(c.template.pageHeader).toMatchObject({ id, height: 8 });
    expect(c.getState().selection.bandId).toBe(id);
    const label = c.undoLabel;
    expect(c.setPageBand('pageHeader', true)).toBe(id);
    expect(c.undoLabel).toBe(label);
  });

  it('adds static bands and data regions at positions', () => {
    const c = make();
    const bandId = c.addStaticBand(0);
    expect(c.template.body[0]).toMatchObject({ kind: 'band', id: bandId, height: 10 });
    const regionId = c.addDataRegion('orders');
    expect(c.template.body.at(-1)).toMatchObject({ kind: 'dataRegion', id: regionId, dataSource: 'orders' });
    c.moveBodyItem(2, 0);
    expect(c.template.body[0]!.id).toBe(regionId);
    const label = c.undoLabel;
    c.moveBodyItem(0, 9);
    c.moveBodyItem(1, 1);
    expect(c.undoLabel).toBe(label);
    expect(validateTemplate(c.template).errors).toEqual([]);
  });

  it('adds and removes child regions, groups and region bands', () => {
    const c = make();
    const child = c.addChildRegion('orders_region', { relation: 'items' });
    expect(validateTemplate(c.template).errors).toEqual([]);
    c.removeRegion(child);
    c.removeRegion('items_region');
    expect((c.template.body[0] as any).children).toBeUndefined();
    expect(() => c.addChildRegion('nope', { relation: 'x' })).toThrow(/Unknown region/);

    const g = c.addGroup('orders_region', 'row.date');
    const groups = () => (c.template.body[0] as any).groups.map((x: any) => x.id);
    expect(groups()).toEqual(['by_customer', g]);
    c.moveGroup(g, -1);
    expect(groups()).toEqual([g, 'by_customer']);
    c.moveGroup(g, -1);
    expect(groups()).toEqual([g, 'by_customer']);
    c.updateGroup(g, { sortDirection: 'desc', pageBreakBefore: true });
    c.setGroupBand(g, 'footer', true);
    c.setGroupBand(g, 'header', false);
    const group = (c.template.body[0] as any).groups[0];
    expect(group).toMatchObject({ sortDirection: 'desc', pageBreakBefore: true });
    expect(group.header).toBeUndefined();
    expect(group.footer).toBeDefined();
    c.removeGroup(g);
    c.removeGroup('by_customer');
    expect((c.template.body[0] as any).groups).toBeUndefined();

    c.setRegionBand('orders_region', 'header', false);
    expect((c.template.body[0] as any).header).toBeUndefined();
    c.setRegionBand('orders_region', 'header', true);
    expect((c.template.body[0] as any).header.height).toBe(10);
    c.updateRegion('orders_region', { filter: 'row.total > 5', repeatHeaderOnEachPage: undefined });
    expect(c.template.body[0]).toMatchObject({ filter: 'row.total > 5' });
    expect((c.template.body[0] as any).repeatHeaderOnEachPage).toBeUndefined();
    expect(validateTemplate(c.template).errors).toEqual([]);
  });

  it('removes bands by role but never detail bands', () => {
    const c = make();
    expect(c.removeBand('order_detail')).toBe(false);
    expect(c.removeBand('nope')).toBe(false);
    for (const id of ['rh', 'pf', 'orders_header', 'orders_footer', 'customer_header', 'customer_footer']) {
      expect(c.removeBand(id)).toBe(true);
      expect(findBand(c.template, id)).toBeUndefined();
    }
    const s = c.addStaticBand();
    c.removeBand(s);
    expect(c.template.body).toHaveLength(1);
    expect(validateTemplate(c.template).errors).toEqual([]);
  });

  it('updates and resizes bands, never smaller than their content', () => {
    const c = new DesignerController({ template: invoiceTemplate(), settings: { grid: 2.5, snapToGrid: true } });
    c.updateBand('order_detail', { canShrink: true, visible: 'row.total > 0' });
    expect(band(c, 'order_detail')).toMatchObject({ canShrink: true, visible: 'row.total > 0' });
    c.resizeBand('order_detail', 11.1);
    expect(band(c, 'order_detail').height).toBe(10);
    c.resizeBand('order_detail', 1);
    expect(band(c, 'order_detail').height).toBe(7);
    c.resizeBand('ph', 0);
    expect(band(c, 'ph').height).toBe(7);
  });

  it('computes sections and body width', () => {
    const c = make();
    expect(c.sections()).toHaveLength(10);
    expect(c.bodyWidth()).toBe(190);
  });
});

describe('template settings', () => {
  it('updates name, page and description', () => {
    const c = make();
    c.updateTemplate({ name: 'New', description: 'd', page: { ...c.template.page, orientation: 'landscape' } });
    expect(c.template).toMatchObject({ name: 'New', description: 'd' });
    expect(c.bodyWidth()).toBe(277);
    c.updateTemplate({ description: undefined });
    expect(c.template.description).toBeUndefined();
  });

  it('converts lengths and grid settings when the unit changes', () => {
    const c = make();
    c.updateTemplate({ unit: 'in' });
    expect(c.template.unit).toBe('in');
    expect(comp(c, 'd_total').x).toBeCloseTo(150 / 25.4, 3);
    expect(c.getState().settings.grid).toBe(0.1);
    c.undo();
    expect(c.template.unit).toBe('mm');
  });
});

describe('data, parameters and styles', () => {
  const sample = {
    sales: {
      orders: [
        { id: 1, customer: 'A', date: '2026-01-01', total: 5, items: [{ sku: 'x', qty: 1 }] },
        { id: 2, customer: 'B', date: '2026-01-02', total: 7, items: [] },
      ],
    },
  };

  it('manages data sources and renames them in regions', () => {
    const c = make();
    c.addDataSource({ name: 'notes' });
    expect(() => c.addDataSource({ name: 'notes' })).toThrow(/already exists/);
    c.updateDataSource('orders', { name: 'sales' });
    expect(c.template.body[0]).toMatchObject({ dataSource: 'sales' });
    expect(validateTemplate(c.template).errors).toEqual([]);
    c.removeDataSource('notes');
    expect(c.template.dataSources.map((d) => d.name)).toEqual(['sales']);
  });

  it('infers data source fields from sample data', () => {
    const c = new DesignerController({ template: invoiceTemplate(), sampleData: sample });
    expect(c.getSampleData()).toBe(sample);
    c.updateDataSource('orders', { fields: undefined });
    expect(c.inferDataSourceFields('orders')).toBe(5);
    expect(c.template.dataSources[0]!.fields!.find((f) => f.name === 'items')).toEqual({
      name: 'items',
      type: 'array',
      fields: [
        { name: 'sku', type: 'string' },
        { name: 'qty', type: 'number' },
      ],
    });
    expect(c.inferDataSourceFields('missing')).toBe(0);
    c.setSampleData({});
    expect(c.inferDataSourceFields('orders')).toBe(0);
  });

  it('manages parameters', () => {
    const c = make();
    c.addParameter({ name: 'year', type: 'number', defaultValue: 2026 });
    expect(() => c.addParameter({ name: 'year', type: 'number' })).toThrow(/already exists/);
    c.updateParameter('year', { label: 'Year' });
    expect(c.template.parameters![1]).toEqual({ name: 'year', type: 'number', defaultValue: 2026, label: 'Year' });
    c.removeParameter('year');
    c.removeParameter('title');
    expect(c.template.parameters).toBeUndefined();
  });

  it('manages named styles and keeps component references in sync', () => {
    const c = make();
    c.setStyle('total', { fontWeight: 'bold' });
    expect(c.template.styles!.total).toEqual({ fontWeight: 'bold' });
    c.renameStyle('cell', 'tableCell');
    expect(comp(c, 'd_id').styleName).toBe('tableCell');
    expect(() => c.renameStyle('tableCell', 'total')).toThrow(/already exists/);
    c.removeStyle('tableCell');
    expect(comp(c, 'd_id').styleName).toBeUndefined();
    expect(validateTemplate(c.template).errors).toEqual([]);
  });

  it('lists expression completions for a band context', () => {
    const c = make();
    const detail = c.completions('order_detail');
    expect(detail).toEqual(expect.arrayContaining(['row', 'row.total', 'row.items', 'rows', 'rowNumber', 'group.key', 'params.title', 'orders', 'page.number']));
    expect(c.completions('orders_header')).not.toContain('row');
    expect(c.completions('item_detail')).toEqual(expect.arrayContaining(['parent', 'row.sku', 'row.qty']));
    expect(c.completions()).not.toContain('rows');
    expect(c.completions()).toEqual(
      expect.arrayContaining(['page.regions.orders_region.before', 'page.regions.items_region.through']),
    );
    expect(c.checkExpression('row.total >')).toMatch(/Unexpected end/);
    expect(c.checkExpression('row.total > 1')).toBeNull();
  });

  it('resolves child region fields through the relation', () => {
    const c = make();
    const child = (c.template.body[0] as any).children[0];
    expect(c.regionFields(child)!.map((f) => f.name)).toEqual(['sku', 'qty']);
  });

  it('previews with sample data and reports errors', () => {
    const c = new DesignerController({ template: invoiceTemplate(), sampleData: sample });
    const { document, error } = c.preview();
    expect(error).toBeNull();
    expect(document!.pages.length).toBe(1);
    c.updateComponent('d_id', { visible: '1 +' } as never);
    expect(c.preview().error).toBeInstanceOf(TemplateValidationError);
  });
});

describe('keyboard shortcuts', () => {
  it('handles undo/redo, clipboard, select all, delete, escape and arrows', () => {
    const c = new DesignerController({ template: invoiceTemplate(), settings: { grid: 2.5, snapToGrid: true } });
    expect(c.handleKey({ key: 'Delete' })).toBe(false);
    c.select(['d_id']);
    expect(c.handleKey({ key: 'ArrowRight' })).toBe(true);
    expect(comp(c, 'd_id').x).toBe(2.5);
    c.handleKey({ key: 'ArrowDown', shiftKey: true });
    expect(comp(c, 'd_id').y).toBe(0.5);
    expect(c.handleKey({ key: 'z', ctrlKey: true })).toBe(true);
    expect(comp(c, 'd_id').y).toBe(0);
    c.handleKey({ key: 'Z', metaKey: true, shiftKey: true });
    expect(comp(c, 'd_id').y).toBe(0.5);
    c.handleKey({ key: 'z', ctrlKey: true });
    c.handleKey({ key: 'y', ctrlKey: true });
    expect(comp(c, 'd_id').y).toBe(0.5);
    expect(c.handleKey({ key: 'c', ctrlKey: true })).toBe(true);
    expect(c.handleKey({ key: 'v', ctrlKey: true })).toBe(true);
    expect(c.handleKey({ key: 'd', ctrlKey: true })).toBe(true);
    expect(band(c, 'order_detail').components).toHaveLength(4);
    expect(c.handleKey({ key: 'a', ctrlKey: true })).toBe(true);
    expect(c.getState().selection.componentIds).toHaveLength(4);
    expect(c.handleKey({ key: 'Backspace' })).toBe(true);
    expect(band(c, 'order_detail').components).toHaveLength(0);
    c.select(['title']);
    expect(c.handleKey({ key: 'x', ctrlKey: true })).toBe(true);
    expect(c.handleKey({ key: 'Escape' })).toBe(true);
    expect(c.getState().selection.bandId).toBeNull();
    expect(c.handleKey({ key: 'q' })).toBe(false);
  });

  it('Escape cancels a running interaction', () => {
    const c = make();
    c.beginInteraction('Move');
    c.moveComponents(['d_id'], 5, 0, false);
    c.handleKey({ key: 'Escape' });
    expect(comp(c, 'd_id').x).toBe(0);
    expect(c.getState().interacting).toBe(false);
  });

  it('undo during an interaction cancels it first', () => {
    const c = make();
    c.updateComponent('d_total', { x: 100 });
    const listener = vi.fn();
    c.subscribe(listener);
    c.beginInteraction('Move');
    c.moveComponents(['d_id'], 5, 0, false);
    c.undo();
    expect(comp(c, 'd_id').x).toBe(0);
    expect(comp(c, 'd_total').x).toBe(150);
  });
});

describe('moving components between bands', () => {
  it('moves a multi-selection into another band during one interaction', () => {
    const c = make();
    c.select(['d_id', 'd_total']);
    c.beginInteraction('Move');
    c.moveComponentsToBand(['d_id', 'd_total'], 'orders_footer', 2, 1);
    expect(band(c, 'orders_footer').components.map((x) => x.id)).toEqual(['grand_total', 'd_id', 'd_total']);
    expect(band(c, 'order_detail').components).toEqual([]);
    expect(comp(c, 'd_id')).toMatchObject({ x: 2, y: 1 });
    expect(comp(c, 'd_total')).toMatchObject({ x: 152, y: 1 });
    expect(c.getState().selection).toEqual({ componentIds: ['d_id', 'd_total'], bandId: 'orders_footer' });
    // Back to the source band: the move is relative to the drag start.
    c.moveComponentsToBand(['d_id', 'd_total'], 'order_detail', 1, 0);
    expect(band(c, 'order_detail').components.map((x) => x.id)).toEqual(['d_id', 'd_total']);
    expect(band(c, 'orders_footer').components.map((x) => x.id)).toEqual(['grand_total']);
    expect(comp(c, 'd_id')).toMatchObject({ x: 1, y: 0 });
    c.moveComponentsToBand(['d_id', 'd_total'], 'orders_footer', 0, 5);
    c.endInteraction();
    expect(findComponent(c.template, 'd_id')!.band.band.id).toBe('orders_footer');
    // Grows the target band to fit and keeps positions non-negative.
    expect(band(c, 'orders_footer').height).toBe(12);
    c.undo();
    expect(findComponent(c.template, 'd_id')!.band.band.id).toBe('order_detail');
    expect(c.getState().canUndo).toBe(false);
  });

  it('clamps the group to the band origin and ignores unknown bands', () => {
    const c = make();
    c.moveComponentsToBand(['d_id', 'd_total'], 'orders_footer', -50, -50);
    expect(comp(c, 'd_id')).toMatchObject({ x: 0, y: 0 });
    expect(comp(c, 'd_total')).toMatchObject({ x: 150, y: 0 });
    const before = c.template;
    c.moveComponentsToBand(['d_id'], 'nope', 1, 1);
    expect(c.template).toBe(before);
  });

  it('exposes the page size and a showMargins setting', () => {
    const c = make();
    expect(c.getState().settings.showMargins).toBe(true);
    const size = c.pageSize();
    const m = c.template.page.margins;
    expect(c.bodyWidth()).toBeCloseTo(size.width - m.left - m.right, 3);
  });
});
