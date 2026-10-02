import { describe, expect, it } from 'vitest';
import {
  alignRects,
  allRegions,
  convertTemplateUnit,
  designSections,
  distributeRects,
  fieldExpression,
  findGroup,
  findRegion,
  inferFields,
  intersects,
  isIdentifier,
  rectFromPoints,
  resizeRect,
  snapEdges,
  snapMove,
  snapToGrid,
  validateTemplate,
} from '../../src';
import { invoiceTemplate } from '../fixtures/invoice';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('snapping', () => {
  it('snapToGrid rounds to the nearest grid line and ignores a zero grid', () => {
    expect(snapToGrid(7.4, 2.5)).toBe(7.5);
    expect(snapToGrid(6.2, 2.5)).toBe(5);
    expect(snapToGrid(6.2, 0)).toBe(6.2);
  });

  it('snapEdges picks the closest target within tolerance', () => {
    expect(snapEdges([10, 20], [11, 30], 2)).toEqual({ offset: 1, position: 11 });
    const hit = snapEdges([10], [19.5, 9.2], 1)!;
    expect(hit.position).toBe(9.2);
    expect(hit.offset).toBeCloseTo(-0.8, 10);
    expect(snapEdges([10], [15], 2)).toBeNull();
  });

  it('snapMove prefers object edges and centers, falls back to the grid, and reports guides', () => {
    const bounds = r(0, 0, 200, 50);
    const other = r(50, 10, 20, 10);
    // Left edge near the other's left edge (50); y snaps to grid.
    const a = snapMove(r(50.6, 3.1, 10, 5), [other], bounds, { grid: 2.5, tolerance: 1 });
    expect(a.rect).toMatchObject({ x: 50, y: 2.5 });
    expect(a.guides).toEqual([{ orientation: 'vertical', position: 50 }]);
    // Center aligns with the other's center (60, 15).
    const b = snapMove(r(54.7, 12.3, 10, 5), [other], bounds, { grid: 2.5, tolerance: 1 });
    expect(b.rect).toMatchObject({ x: 55, y: 12.5 });
    expect(b.guides).toEqual([
      { orientation: 'vertical', position: 60 },
      { orientation: 'horizontal', position: 15 },
    ]);
    // Band bounds count as targets.
    expect(snapMove(r(189.5, 20, 10, 5), [], bounds, { grid: 0, tolerance: 1 }).rect.x).toBe(190);
    // No snapping at all.
    expect(snapMove(r(3.3, 4.4, 1, 1), [], bounds, { grid: 0, tolerance: 0 }).rect).toMatchObject({ x: 3.3, y: 4.4 });
  });
});

describe('resizeRect', () => {
  const base = r(10, 10, 20, 10);

  it.each([
    ['e', 5, 0, r(10, 10, 25, 10)],
    ['w', 5, 0, r(15, 10, 15, 10)],
    ['s', 0, 5, r(10, 10, 20, 15)],
    ['n', 0, -5, r(10, 5, 20, 15)],
    ['se', 5, 5, r(10, 10, 25, 15)],
    ['nw', -5, -5, r(5, 5, 25, 15)],
    ['ne', 5, 2, r(10, 12, 25, 8)],
    ['sw', 2, 3, r(12, 10, 18, 13)],
  ] as const)('%s handle', (handle, dx, dy, expected) => {
    expect(resizeRect(base, handle, dx, dy)).toEqual(expected);
  });

  it('keeps a minimum size and the opposite edge fixed', () => {
    expect(resizeRect(base, 'e', -100, 0)).toEqual(r(10, 10, 1, 10));
    expect(resizeRect(base, 'w', 100, 0)).toEqual(r(29, 10, 1, 10));
  });

  it('does not go past the band origin', () => {
    expect(resizeRect(base, 'nw', -50, -50)).toEqual(r(0, 0, 30, 20));
  });

  it('snaps moving edges to the grid', () => {
    expect(resizeRect(base, 'se', 3.7, 1.1, 2.5)).toEqual(r(10, 10, 22.5, 10));
  });
});

describe('align and distribute', () => {
  const rects = [r(10, 10, 10, 10), r(30, 20, 20, 5), r(5, 40, 5, 5)];

  it.each([
    ['left', (o: any[]) => o.map((x) => x.x), [5, 5, 5]],
    ['right', (o: any[]) => o.map((x) => x.x + x.width), [50, 50, 50]],
    ['center', (o: any[]) => o.map((x) => x.x + x.width / 2), [27.5, 27.5, 27.5]],
    ['top', (o: any[]) => o.map((x) => x.y), [10, 10, 10]],
    ['bottom', (o: any[]) => o.map((x) => x.y + x.height), [45, 45, 45]],
    ['middle', (o: any[]) => o.map((x) => x.y + x.height / 2), [27.5, 27.5, 27.5]],
  ] as const)('align %s', (alignment, pick, expected) => {
    expect(pick(alignRects(rects, alignment))).toEqual(expected);
  });

  it('aligns to a reference rectangle', () => {
    expect(alignRects([r(5, 5, 10, 10)], 'right', r(0, 0, 100, 20))[0]!.x).toBe(90);
    expect(alignRects([], 'left')).toEqual([]);
  });

  it('distributes with equal gaps, keeping the outer items in place', () => {
    const out = distributeRects([r(0, 0, 10, 5), r(50, 0, 10, 5), r(15, 0, 10, 5), r(90, 0, 10, 5)], 'horizontal');
    expect(out.map((x) => x.x)).toEqual([0, 60, 30, 90]);
    expect(distributeRects([r(0, 0, 1, 1), r(5, 0, 1, 1)], 'horizontal').map((x) => x.x)).toEqual([0, 5]);
    expect(distributeRects([r(0, 0, 5, 10), r(0, 12, 5, 4), r(0, 40, 5, 10)], 'vertical').map((x) => x.y)).toEqual([0, 23, 40]);
  });

  it('intersects and rectFromPoints', () => {
    expect(intersects(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true);
    expect(intersects(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
    expect(rectFromPoints(10, 20, 5, 2)).toEqual(r(5, 2, 5, 18));
  });
});

describe('inferFields', () => {
  it('infers types, nested objects and arrays of objects', () => {
    const rows = [
      { id: 1, name: 'A', active: true, when: '2026-01-05', at: '2026-01-05T10:00:00Z', tags: ['x'], customer: { city: 'Paris' }, lines: [{ sku: 'a', qty: 1 }] },
      { id: 2, name: 'B', active: false, when: '2026-01-06', at: null, extra: 5, customer: { city: 'Rome', zip: '00100' }, lines: [{ sku: 'b', price: 2 }] },
    ];
    expect(inferFields(rows)).toEqual([
      { name: 'id', type: 'number' },
      { name: 'name', type: 'string' },
      { name: 'active', type: 'boolean' },
      { name: 'when', type: 'date' },
      { name: 'at', type: 'date' },
      { name: 'tags', type: 'array' },
      {
        name: 'customer',
        type: 'object',
        fields: [
          { name: 'city', type: 'string' },
          { name: 'zip', type: 'string' },
        ],
      },
      {
        name: 'lines',
        type: 'array',
        fields: [
          { name: 'sku', type: 'string' },
          { name: 'qty', type: 'number' },
          { name: 'price', type: 'number' },
        ],
      },
      { name: 'extra', type: 'number' },
    ]);
  });

  it('marks mixed types as unknown and dates mixed with strings as string', () => {
    expect(inferFields([{ a: 1, b: '2026-01-01' }, { a: 'x', b: 'hello' }])).toEqual([
      { name: 'a', type: 'unknown' },
      { name: 'b', type: 'string' },
    ]);
  });

  it('handles a single object, empty input and depth limits', () => {
    expect(inferFields({ a: 1 })).toEqual([{ name: 'a', type: 'number' }]);
    expect(inferFields(null)).toEqual([]);
    expect(inferFields([1, 'x'])).toEqual([]);
    expect(inferFields([{ o: { p: { q: 1 } } }], 100, 2)).toEqual([{ name: 'o', type: 'object', fields: [{ name: 'p', type: 'object' }] }]);
  });

  it('fieldExpression uses dot or bracket access as needed', () => {
    expect(isIdentifier('total')).toBe(true);
    expect(isIdentifier('unit price')).toBe(false);
    expect(fieldExpression('row', ['customer', 'name'])).toBe('row.customer.name');
    expect(fieldExpression('row', ['unit price', '2nd'])).toBe('row["unit price"]["2nd"]');
  });
});

describe('sections and lookup', () => {
  it('lists bands in design order with captions and depth', () => {
    const sections = designSections(invoiceTemplate());
    expect(sections.map((s) => [s.band.id, s.label, s.depth])).toEqual([
      ['rh', 'Report header', 0],
      ['ph', 'Page header', 0],
      ['orders_header', 'Header: orders', 0],
      ['customer_header', 'Group header: row.customer', 0],
      ['order_detail', 'Detail: orders', 0],
      ['item_detail', 'Detail: parent.items', 1],
      ['customer_footer', 'Group footer: row.customer', 0],
      ['orders_footer', 'Footer: orders', 0],
      ['pf', 'Page footer', 0],
      ['rf', 'Report footer', 0],
    ]);
    expect(sections[3]!.group!.id).toBe('by_customer');
    expect(sections[5]!.dataContext).toBe('parent.items');
  });

  it('labels static bands by position', () => {
    const t = invoiceTemplate();
    t.body.unshift({ kind: 'band', id: 's', height: 5, components: [] });
    expect(designSections(t)[2]!.label).toBe('Band 1');
  });

  it('finds regions and groups at any depth', () => {
    const t = invoiceTemplate();
    expect(findRegion(t, 'orders_region')).toMatchObject({ parent: null, list: null, bodyIndex: 0 });
    const child = findRegion(t, 'items_region')!;
    expect(child.parent!.id).toBe('orders_region');
    expect(child.list).toBe(child.parent!.children);
    expect(findRegion(t, 'nope')).toBeUndefined();
    expect(findGroup(t, 'by_customer')!.region.id).toBe('orders_region');
    expect(findGroup(t, 'nope')).toBeUndefined();
    expect(allRegions(t).map((x) => x.id)).toEqual(['orders_region', 'items_region']);
  });
});

describe('convertTemplateUnit', () => {
  it('converts every length and keeps the template valid', () => {
    const t = invoiceTemplate();
    t.page.size = { width: 210, height: 297 };
    (t.reportFooter!.components as any).push({ id: 'rr', type: 'rectangle', x: 25.4, y: 0, width: 25.4, height: 2.54, cornerRadius: 2.54 });
    convertTemplateUnit(t, 'in');
    expect(t.unit).toBe('in');
    expect(t.page.margins.top).toBeCloseTo(10 / 25.4, 3);
    expect((t.page.size as any).width).toBeCloseTo(210 / 25.4, 3);
    expect(t.reportHeader!.height).toBeCloseTo(15 / 25.4, 3);
    const rect = t.reportFooter!.components.find((c) => c.id === 'rr') as any;
    expect(rect).toMatchObject({ x: 1, width: 1, height: 0.1, cornerRadius: 0.1 });
    expect(t.styles!.cell!.padding).toBeCloseTo(1 / 25.4, 3);
    // Font sizes and border widths are points and do not change.
    expect(t.styles!.heading!.fontSize).toBe(16);
    expect(t.styles!.cell!.border!.width).toBe(0.5);
    expect(validateTemplate(t).errors).toEqual([]);
  });

  it('converts per-side padding, conditional styles and nested bands', () => {
    const t = invoiceTemplate();
    const d = (t.body[0] as any).detail.components[1];
    d.style = { padding: { top: 10, right: 10, bottom: 10, left: 10 } };
    d.conditions[0].style.padding = 10;
    convertTemplateUnit(t, 'cm');
    expect(d.style.padding).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(d.conditions[0].style.padding).toBe(1);
    expect((t.body[0] as any).children[0].detail.height).toBe(0.5);
    expect((t.body[0] as any).groups[0].footer.height).toBe(0.7);
  });

  it('is a no-op for the same unit', () => {
    const t = invoiceTemplate();
    convertTemplateUnit(t, 'mm');
    expect(t).toEqual(invoiceTemplate());
  });
});
