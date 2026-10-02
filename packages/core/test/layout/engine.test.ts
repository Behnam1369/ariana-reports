import { describe, expect, it } from 'vitest';
import { ERROR_MARKER, generateReport, type GenerateOptions, type LayoutText } from '../../src/layout';
import { TemplateValidationError } from '../../src/model';
import type { ReportTemplate } from '../../src/model/types';
import { invoiceTemplate } from '../fixtures/invoice';
import { allTexts, band, bandsOf, fixedMeasurer, pageTexts, region, text, tpl } from './helpers';

const run = (template: ReportTemplate, data: unknown = {}, options: GenerateOptions = {}) =>
  generateReport(template, data, { measurer: fixedMeasurer, ...options });

const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `item ${i + 1}` }));

describe('document basics', () => {
  it('reports page geometry in points', () => {
    const doc = run(tpl({ unit: 'mm', page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } } }));
    expect(doc.pageWidth).toBeCloseTo(595.28, 1);
    expect(doc.pageHeight).toBeCloseTo(841.89, 1);
    expect(doc.margins.top).toBeCloseTo(28.35, 2);
    expect(doc.name).toBe('Test');
    expect(doc.locale).toBe('en-US');
  });

  it('always produces at least one page', () => {
    const doc = run(tpl());
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]!.number).toBe(1);
    expect(doc.pages[0]!.bands).toEqual([]);
  });

  it('places static bands inside the margins, top to bottom', () => {
    const doc = run(tpl({ body: [{ kind: 'band', ...band(20, [text('A', { x: 5, y: 3 })]) }, { kind: 'band', ...band(30) }] }));
    const [first, second] = bandsOf(doc, 0);
    expect(first).toMatchObject({ x: 10, y: 10, width: 180, height: 20, role: 'static' });
    expect(second).toMatchObject({ y: 30, height: 30 });
    expect(first!.items[0]).toMatchObject({ kind: 'text', x: 15, y: 13, text: 'A' });
  });

  it('accepts templates as JSON strings', () => {
    const doc = run(JSON.stringify(tpl({ body: [{ kind: 'band', ...band(10, [text('hi')]) }] })) as any);
    expect(allTexts(doc)).toEqual(['hi']);
  });

  it('throws TemplateValidationError for invalid templates', () => {
    expect(() => run({ ...tpl(), unit: 'x' } as any)).toThrow(TemplateValidationError);
  });

  it('can skip validation', () => {
    const t = tpl({ body: [{ kind: 'band', ...band(10, [text('ok')]) }] });
    (t as any).extra = true;
    expect(() => run(t)).toThrow(TemplateValidationError);
    expect(allTexts(run(t, {}, { validate: false }))).toEqual(['ok']);
  });
});

describe('scope: params, report, data sources', () => {
  it('uses parameter defaults and overrides', () => {
    const t = tpl({
      parameters: [
        { name: 'title', type: 'string', defaultValue: 'Default' },
        { name: 'year', type: 'number' },
      ],
      body: [{ kind: 'band', ...band(10, [text('{{ params.title }}/{{ params.year }}/{{ params.extra }}')]) }],
    });
    expect(allTexts(run(t))).toEqual(['Default//']);
    expect(allTexts(run(t, {}, { params: { title: 'Mine', year: 2026, extra: 'x' } }))).toEqual(['Mine/2026/x']);
  });

  it('exposes report info and data sources by name', () => {
    const t = tpl({
      name: 'Sales',
      dataSources: [{ name: 'orders', path: 'a.b' }],
      body: [{ kind: 'band', ...band(10, [text('{{ report.name }}: {{ sum(orders, "total") }} in {{ orders.length }}')]) }],
    });
    expect(allTexts(run(t, { a: { b: [{ total: 2 }, { total: 3 }] } }))).toEqual(['Sales: 5 in 2']);
  });

  it('treats missing data as empty and a single object as one row', () => {
    const t = tpl({ body: [region({ detail: band(10, [text('{{ row.name }}')]) })] });
    expect(allTexts(run(t, {}))).toEqual([]);
    expect(allTexts(run(t, { items: { name: 'solo' } }))).toEqual(['solo']);
  });
});

describe('data regions', () => {
  it('prints header, one detail per row and footer', () => {
    const t = tpl({
      body: [
        region({
          header: band(10, [text('Header')]),
          detail: band(10, [text('{{ rowNumber }}. {{ row.name }}')]),
          footer: band(10, [text('Count: {{ rows.length }}')]),
        }),
      ],
    });
    const doc = run(t, { items: rowsOf(3) });
    expect(allTexts(doc)).toEqual(['Header', '1. item 1', '2. item 2', '3. item 3', 'Count: 3']);
    expect(bandsOf(doc, 0).map((b) => b.role)).toEqual(['regionHeader', 'detail', 'detail', 'detail', 'regionFooter']);
    expect(bandsOf(doc, 0).map((b) => b.y)).toEqual([10, 20, 30, 40, 50]);
    expect(bandsOf(doc, 0).every((b) => b.regionId === t.body[0]!.id)).toBe(true);
  });

  it('prints header and footer for empty data', () => {
    const t = tpl({
      body: [region({ header: band(10, [text('H')]), detail: band(10, [text('D')]), footer: band(10, [text('F {{ rows.length }}')]) })],
    });
    expect(allTexts(run(t, { items: [] }))).toEqual(['H', 'F 0']);
  });

  it('filters rows', () => {
    const t = tpl({ body: [region({ filter: 'row.id % 2 === 0', detail: band(10, [text('{{ row.id }}')]) })] });
    expect(allTexts(run(t, { items: rowsOf(5) }))).toEqual(['2', '4']);
  });

  it('sorts by several rules, stably', () => {
    const items = [
      { id: 1, cat: 'b', v: 2 },
      { id: 2, cat: 'a', v: 1 },
      { id: 3, cat: 'b', v: 1 },
      { id: 4, cat: 'a', v: 1 },
    ];
    const t = tpl({
      body: [
        region({
          sort: [
            { expression: 'row.cat', direction: 'asc' },
            { expression: 'row.v', direction: 'desc' },
          ],
          detail: band(10, [text('{{ row.id }}')]),
        }),
      ],
    });
    expect(allTexts(run(t, { items }))).toEqual(['2', '4', '1', '3']);
  });

  it('sorts ISO date strings chronologically', () => {
    const items = [{ d: '2026-03-01' }, { d: '2025-12-31T10:00:00Z' }, { d: '2026-01-15' }];
    const t = tpl({ body: [region({ sort: [{ expression: 'row.d', direction: 'asc' }], detail: band(10, [text('{{ row.d }}')]) })] });
    expect(allTexts(run(t, { items }))).toEqual(['2025-12-31T10:00:00Z', '2026-01-15', '2026-03-01']);
  });
});

describe('groups', () => {
  const items = [
    { id: 1, cust: 'Bob', total: 10 },
    { id: 2, cust: 'Ann', total: 5 },
    { id: 3, cust: 'Bob', total: 20 },
    { id: 4, cust: 'Ann', total: 1 },
  ];

  const grouped = (sortDirection?: 'asc' | 'desc' | 'none') =>
    tpl({
      body: [
        region({
          groups: [
            {
              id: 'g',
              expression: 'row.cust',
              ...(sortDirection ? { sortDirection } : {}),
              header: band(10, [text('[{{ group.key }}] first={{ row.id }}')]),
              footer: band(10, [text('{{ group.key }} total {{ sum(group.rows, "total") }} ({{ group.count }}) last={{ row.id }}')]),
            },
          ],
          detail: band(10, [text('{{ row.id }}')]),
        }),
      ],
    });

  it('sorts by the group key ascending by default and prints headers/footers', () => {
    expect(allTexts(run(grouped(), { items }))).toEqual([
      '[Ann] first=2',
      '2',
      '4',
      'Ann total 6 (2) last=4',
      '[Bob] first=1',
      '1',
      '3',
      'Bob total 30 (2) last=3',
    ]);
  });

  it('supports descending group order', () => {
    expect(allTexts(run(grouped('desc'), { items }))[0]).toBe('[Bob] first=1');
  });

  it('groups consecutive rows only when sortDirection is none', () => {
    const texts = allTexts(run(grouped('none'), { items })).filter((s) => s.startsWith('['));
    expect(texts).toEqual(['[Bob] first=1', '[Ann] first=2', '[Bob] first=3', '[Ann] first=4']);
  });

  it('nests groups with the outer group first and exposes all active groups', () => {
    const data = {
      items: [
        { y: 2026, m: 2, v: 1 },
        { y: 2025, m: 12, v: 2 },
        { y: 2026, m: 1, v: 3 },
        { y: 2026, m: 1, v: 4 },
      ],
    };
    const t = tpl({
      body: [
        region({
          groups: [
            { id: 'gy', expression: 'row.y', header: band(10, [text('Y{{ group.key }}')]), footer: band(10, [text('/Y{{ group.key }}')]) },
            {
              id: 'gm',
              expression: 'row.m',
              header: band(10, [text('M{{ groups[0].key }}-{{ group.key }} #{{ group.index }}')]),
              footer: band(10, [text('/M{{ group.key }}')]),
            },
          ],
          detail: band(10, [text('{{ row.v }}')]),
        }),
      ],
    });
    expect(allTexts(run(t, data))).toEqual([
      'Y2025',
      'M2025-12 #0',
      '2',
      '/M12',
      '/Y2025',
      'Y2026',
      'M2026-1 #0',
      '3',
      '4',
      '/M1',
      'M2026-2 #1',
      '1',
      '/M2',
      '/Y2026',
    ]);
  });

  it('starts groups on a new page with pageBreakBefore', () => {
    const t = grouped();
    (t.body[0] as any).groups[0].pageBreakBefore = true;
    const doc = run(t, { items });
    expect(doc.pages).toHaveLength(2);
    expect(pageTexts(doc, 0)[0]).toBe('[Ann] first=2');
    expect(pageTexts(doc, 1)[0]).toBe('[Bob] first=1');
  });
});

describe('master-detail', () => {
  const data = {
    items: [
      { no: 'A', lines: [{ sku: 'x', qty: 1 }, { sku: 'y', qty: 2 }] },
      { no: 'B', lines: [] },
      { no: 'C', lines: [{ sku: 'z', qty: 5 }] },
    ],
  };

  it('nests child regions through a relation and exposes the parent row', () => {
    const t = tpl({
      body: [
        region({
          detail: band(10, [text('Order {{ row.no }}')]),
          children: [
            {
              kind: 'dataRegion',
              id: 'lines',
              relation: 'lines',
              detail: band(10, [text('- {{ parent.no }}/{{ row.sku }} x{{ row.qty }} ({{ rowNumber }})')]),
              footer: band(10, [text('  lines: {{ sum(rows, "qty") }}')]),
            },
          ],
        }),
      ],
    });
    expect(allTexts(run(t, data))).toEqual([
      'Order A',
      '- A/x x1 (1)',
      '- A/y x2 (2)',
      '  lines: 3',
      'Order B',
      '  lines: 0',
      'Order C',
      '- C/z x5 (1)',
      '  lines: 5',
    ]);
  });

  it('supports child regions over another data source filtered by the parent', () => {
    const t = tpl({
      dataSources: [{ name: 'items' }, { name: 'notes' }],
      body: [
        region({
          detail: band(10, [text('{{ row.no }}')]),
          children: [
            { kind: 'dataRegion', id: 'n', dataSource: 'notes', filter: 'row.order === parent.no', detail: band(10, [text('note {{ row.text }}')]) },
          ],
        }),
      ],
    });
    const notes = [
      { order: 'C', text: 'c1' },
      { order: 'A', text: 'a1' },
    ];
    expect(allTexts(run(t, { ...data, notes }))).toEqual(['A', 'note a1', 'B', 'C', 'note c1']);
  });
});

describe('pagination', () => {
  it('flows rows onto new pages', () => {
    const t = tpl({ body: [region({ detail: band(20, [text('{{ row.id }}')]) })] });
    // Body is 280 pt tall: 14 rows of 20 pt per page.
    const doc = run(t, { items: rowsOf(30) });
    expect(doc.pages.map((p) => p.bands.length)).toEqual([14, 14, 2]);
    expect(bandsOf(doc, 1)[0]).toMatchObject({ y: 10 });
    expect(pageTexts(doc, 1)[0]).toBe('15');
    expect(doc.pages.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('reserves page header and footer space and prints page numbers', () => {
    const t = tpl({
      pageHeader: band(20, [text('Header {{ page.number }}')]),
      pageFooter: band(20, [text('Page {{ page.number }} of {{ page.count }}')]),
      body: [region({ detail: band(20, [text('{{ row.id }}')]) })],
    });
    // Body area is now 280 - 40 = 240 pt: 12 rows per page.
    const doc = run(t, { items: rowsOf(25) });
    expect(doc.pages).toHaveLength(3);
    const p1 = bandsOf(doc, 0);
    expect(p1[0]).toMatchObject({ role: 'pageHeader', y: 10 });
    expect(p1[1]).toMatchObject({ role: 'detail', y: 30 });
    expect(p1.at(-1)).toMatchObject({ role: 'pageFooter', y: 270 });
    expect(p1.filter((b) => b.role === 'detail')).toHaveLength(12);
    expect(pageTexts(doc, 2).at(-1)).toBe('Page 3 of 3');
    expect(pageTexts(doc, 0)[0]).toBe('Header 1');
  });

  it('places the report header above the page header on the first page', () => {
    const t = tpl({
      reportHeader: band(30, [text('Title')]),
      pageHeader: band(10, [text('PH')]),
      body: [{ kind: 'band', ...band(10, [text('body')]) }],
      reportFooter: band(10, [text('end')]),
    });
    const doc = run(t);
    expect(bandsOf(doc, 0).map((b) => [b.role, b.y])).toEqual([
      ['reportHeader', 10],
      ['pageHeader', 40],
      ['static', 50],
      ['reportFooter', 60],
    ]);
  });

  it('still reserves the page header when the report header is hidden', () => {
    const t = tpl({
      reportHeader: band(30, [text('Title')], { visible: 'false' }),
      pageHeader: band(10, [text('PH')]),
      body: [{ kind: 'band', ...band(10, [text('body')]) }],
    });
    expect(bandsOf(run(t), 0).map((b) => [b.role, b.y])).toEqual([
      ['pageHeader', 10],
      ['static', 20],
    ]);
  });

  it('honours printOnFirstPage and printOnLastPage', () => {
    const t = tpl({
      pageHeader: band(10, [text('PH')], { printOnFirstPage: false }),
      pageFooter: band(10, [text('PF')], { printOnLastPage: false }),
      body: [region({ detail: band(50, [text('{{ row.id }}')]) })],
    });
    // Page 1 fits 5 rows (270 pt), later pages 5 rows (260 pt): 12 rows -> 3 pages.
    const doc = run(t, { items: rowsOf(12) });
    expect(doc.pages).toHaveLength(3);
    const roles = doc.pages.map((p) => p.bands.map((b) => b.role).filter((r) => r.startsWith('page')));
    expect(roles[0]).toEqual(['pageFooter']);
    expect(roles[1]).toEqual(['pageHeader', 'pageFooter']);
    expect(roles.at(-1)).toEqual(['pageHeader']);
    // Without a header slot the first page body starts at the top margin.
    expect(bandsOf(doc, 0)[0]).toMatchObject({ role: 'detail', y: 10 });
  });

  it('repeats region headers on each new page', () => {
    const t = tpl({
      pageHeader: band(10, [text('PH')]),
      body: [
        region({
          repeatHeaderOnEachPage: true,
          header: band(10, [text('Columns')]),
          detail: band(50, [text('{{ row.id }}')]),
          footer: band(10, [text('Footer')]),
        }),
        { kind: 'band', ...band(260, [text('after')]) },
      ],
    });
    const doc = run(t, { items: rowsOf(8) });
    // Page 1: PH, Columns, 1..5 (10 + 10 + 250 = 270 of 280)
    expect(pageTexts(doc, 0)).toEqual(['PH', 'Columns', '1', '2', '3', '4', '5']);
    expect(pageTexts(doc, 1)).toEqual(['PH', 'Columns', '6', '7', '8', 'Footer']);
    expect(bandsOf(doc, 0)[1]!.repeated).toBeUndefined();
    expect(bandsOf(doc, 1)[1]).toMatchObject({ role: 'regionHeader', repeated: true });
    // The static band after the region does not repeat the header.
    expect(pageTexts(doc, 2)).toEqual(['PH', 'after']);
  });

  it('keeps group and region headers with the next band', () => {
    const t = tpl({
      body: [
        { kind: 'band', ...band(255) },
        region({
          header: band(10, [text('Header')]),
          detail: band(20, [text('{{ row.id }}')]),
        }),
      ],
    });
    const doc = run(t, { items: rowsOf(1) });
    // 255 + 10 fits, but 255 + 10 + 20 does not: the header moves with the row.
    expect(pageTexts(doc, 0)).toEqual([]);
    expect(pageTexts(doc, 1)).toEqual(['Header', '1']);
  });

  it('supports pageBreakBefore and pageBreakAfter on bands', () => {
    const t = tpl({
      body: [
        { kind: 'band', ...band(10, [text('a')]), pageBreakAfter: true },
        { kind: 'band', ...band(10, [text('b')]) },
        { kind: 'band', ...band(10, [text('c')]), pageBreakBefore: true },
      ],
    });
    const doc = run(t);
    expect(doc.pages.map((_, i) => pageTexts(doc, i))).toEqual([['a'], ['b'], ['c']]);
  });

  it('does not start with an empty page for pageBreakBefore on the first band', () => {
    const t = tpl({ body: [{ kind: 'band', ...band(10, [text('a')]), pageBreakBefore: true }] });
    expect(run(t).pages).toHaveLength(1);
  });

  it('places oversized bands on their own page and warns', () => {
    const t = tpl({
      body: [
        { kind: 'band', ...band(10, [text('small')]) },
        { kind: 'band', id: 'huge', height: 500, components: [] },
      ],
    });
    const doc = run(t);
    expect(doc.pages).toHaveLength(2);
    expect(doc.issues).toEqual([
      { severity: 'warning', message: 'Band is taller than the available page area and was clipped', bandId: 'huge' },
    ]);
  });

  it('runs a second pass when body bands use page.count', () => {
    const t = tpl({ body: [region({ detail: band(100, [text('{{ row.id }} / {{ page.count }}')]) })] });
    const doc = run(t, { items: rowsOf(5) });
    expect(doc.pages).toHaveLength(3);
    expect(allTexts(doc)).toEqual(['1 / 3', '2 / 3', '3 / 3', '4 / 3', '5 / 3']);
  });

  it('stops at maxPages', () => {
    const t = tpl({ body: [region({ detail: band(200) })] });
    expect(() => run(t, { items: rowsOf(20) }, { maxPages: 5 })).toThrow(/limit of 5 pages/);
  });
});

describe('bands and components', () => {
  it('grows text and bands with canGrow, and leaves fixed text alone', () => {
    const long = 'word '.repeat(20).trim(); // 99 characters
    const t = tpl({
      body: [
        { kind: 'band', ...band(10, [text(long, { width: 50, canGrow: true, style: { fontSize: 10, padding: 1 } })]) },
        { kind: 'band', ...band(10, [text(long, { width: 50 })]) },
      ],
    });
    const doc = run(t);
    const [grown, fixed] = bandsOf(doc, 0);
    const item = grown!.items[0] as LayoutText;
    // 5 pt per char, 48 pt inner width => at most 9 chars per line => "word word" per line, 10 lines.
    expect(item.lines).toHaveLength(10);
    expect(item.lines.every((l) => l === 'word word')).toBe(true);
    expect(item.lineHeight).toBe(12);
    expect(item.height).toBeCloseTo(10 * 12 + 2, 10);
    expect(grown!.height).toBeCloseTo(122, 10);
    expect(fixed!.height).toBe(10);
    expect(fixed!.items[0]!.height).toBe(10);
  });

  it('does not grow bands with canGrow false', () => {
    const t = tpl({ body: [{ kind: 'band', ...band(10, [text('x', { height: 40 })], { canGrow: false }) }] });
    expect(bandsOf(run(t), 0)[0]!.height).toBe(10);
  });

  it('shrinks bands with canShrink when components are hidden', () => {
    const t = tpl({
      body: [
        { kind: 'band', ...band(40, [text('a', { height: 10 }), text('b', { y: 20, height: 10, visible: 'false' })], { canShrink: true }) },
        { kind: 'band', ...band(40, [], { canShrink: true }) },
      ],
    });
    const [a, b] = bandsOf(run(t), 0);
    expect(a!.height).toBe(10);
    expect(a!.items).toHaveLength(1);
    expect(b!.height).toBe(0);
  });

  it('skips bands whose visible expression is falsy', () => {
    const t = tpl({ body: [region({ detail: band(10, [text('{{ row.id }}')], { visible: 'row.id !== 2' }) })] });
    expect(allTexts(run(t, { items: rowsOf(3) }))).toEqual(['1', '3']);
  });

  it('merges named, inline and conditional styles', () => {
    const t = tpl({
      styles: { base: { fontSize: 8, color: '#111111', fontWeight: 'bold' } },
      body: [
        region({
          detail: band(10, [
            text('{{ row.id }}', {
              styleName: 'base',
              style: { color: '#222222' },
              conditions: [
                { expression: 'row.id > 1', style: { color: '#ff0000' } },
                { expression: 'row.id > 2', style: { fontStyle: 'italic' } },
              ],
            }),
          ]),
        }),
      ],
    });
    const styles = run(t, { items: rowsOf(3) }).pages[0]!.bands.map((b) => (b.items[0] as LayoutText).style);
    expect(styles.map((s) => s.color)).toEqual(['#222222', '#ff0000', '#ff0000']);
    expect(styles.map((s) => s.fontStyle)).toEqual(['normal', 'normal', 'italic']);
    expect(styles.every((s) => s.fontSize === 8 && s.fontWeight === 'bold')).toBe(true);
  });

  it('applies band background and border', () => {
    const t = tpl({
      body: [{ kind: 'band', ...band(10, [], { style: { backgroundColor: '#eeeeee', border: { width: 1, color: '#000', style: 'solid', sides: ['bottom'] } } }) }],
    });
    expect(bandsOf(run(t), 0)[0]).toMatchObject({
      backgroundColor: '#eeeeee',
      border: { width: 1, color: '#000', style: 'solid', sides: ['bottom'] },
    });
  });

  it('formats values and keeps raw values for single expressions', () => {
    const t = tpl({
      body: [
        region({
          detail: band(10, [
            text('{{ row.amount }}', { format: { type: 'currency', currency: 'USD' } }),
            text('Total: {{ row.amount }}', { format: { type: 'number', decimals: 1 } }),
            text('{{ row.when }}', { format: { type: 'date', pattern: 'dd/MM/yyyy' } }),
          ]),
        }),
      ],
    });
    const items = bandsOf(run(t, { items: [{ amount: 1234.5, when: '2026-03-05' }] }), 0)[0]!.items as LayoutText[];
    expect(items.map((i) => i.text)).toEqual(['$1,234.50', 'Total: 1,234.5', '05/03/2026']);
    expect(items[0]!.value).toBe(1234.5);
    expect(items[1]!.value).toBe('Total: 1,234.5');
    expect(items[2]!.value).toBe('2026-03-05');
    expect(items[0]!.format).toEqual({ type: 'currency', currency: 'USD' });
    expect(items[2]!.format).toEqual({ type: 'date', pattern: 'dd/MM/yyyy' });
  });

  it('uses the locale option for formatting', () => {
    const t = tpl({ locale: 'en-US', body: [{ kind: 'band', ...band(10, [text('{{ 1234.5 }}', { format: { type: 'number', decimals: 2 } })]) }] });
    expect(allTexts(run(t, {}, { locale: 'de-DE' }))).toEqual(['1.234,50']);
    expect(run(t, {}, { locale: 'de-DE' }).locale).toBe('de-DE');
  });

  it('builds image, line and rectangle items in points', () => {
    const t = tpl({
      unit: 'mm',
      page: { size: { width: 100, height: 100 }, orientation: 'portrait', margins: { top: 0, right: 0, bottom: 0, left: 0 } },
      body: [
        {
          kind: 'band',
          ...band(30, [
            { id: 'img', type: 'image', x: 0, y: 0, width: 10, height: 10, src: 'https://x/{{ params.n }}.png' },
            { id: 'h', type: 'line', orientation: 'horizontal', x: 0, y: 25.4, width: 25.4, height: 0, style: { border: { width: 2, color: '#f00', style: 'dashed' } } },
            { id: 'v', type: 'line', orientation: 'vertical', x: 25.4, y: 0, width: 0, height: 25.4 },
            { id: 'rect', type: 'rectangle', x: 0, y: 0, width: 25.4, height: 25.4, cornerRadius: 2.54, style: { backgroundColor: '#00f' } },
          ]),
        },
      ],
      parameters: [{ name: 'n', type: 'number', defaultValue: 7 }],
    });
    const [img, h, v, rect] = bandsOf(run(t), 0)[0]!.items;
    expect(img).toMatchObject({ kind: 'image', src: 'https://x/7.png', fit: 'contain' });
    expect(h).toMatchObject({ kind: 'line', x1: 0, x2: 72, lineWidth: 2, color: '#f00', lineStyle: 'dashed' });
    expect((h as any).y1).toBeCloseTo(72, 10);
    expect((h as any).y2).toBeCloseTo(72, 10);
    expect(v).toMatchObject({ kind: 'line', lineWidth: 1, color: '#000000', lineStyle: 'solid' });
    expect((v as any).x1).toBeCloseTo(72, 10);
    expect((v as any).y2).toBeCloseTo(72, 10);
    expect(rect).toMatchObject({ kind: 'rectangle', width: 72 });
    expect((rect as any).cornerRadius).toBeCloseTo(7.2, 10);
    expect((rect as any).style.backgroundColor).toBe('#00f');
  });
});

describe('expression errors', () => {
  it('marks failing text, records one issue per expression and keeps going', () => {
    const t = tpl({
      body: [region({ detail: band(10, [text('{{ row.missing.deep }}', { id: 'bad' }), text('{{ row.id }}', { id: 'good' })]) })],
    });
    const doc = run(t, { items: rowsOf(3) });
    const texts = doc.pages[0]!.bands.map((b) => (b.items as LayoutText[]).map((i) => i.text));
    expect(texts).toEqual([
      [ERROR_MARKER, '1'],
      [ERROR_MARKER, '2'],
      [ERROR_MARKER, '3'],
    ]);
    expect((doc.pages[0]!.bands[0]!.items[0] as LayoutText).error).toBe(true);
    expect(doc.issues).toHaveLength(1);
    expect(doc.issues[0]).toMatchObject({
      severity: 'error',
      componentId: 'bad',
      expression: 'row.missing.deep',
      message: expect.stringMatching(/Cannot read property "deep" of undefined/),
    });
  });

  it('records errors in filters, sort, group, visible and condition expressions', () => {
    const t = tpl({
      body: [
        region({
          id: 'r',
          filter: 'row.a.b',
          sort: [{ expression: 'nope1', direction: 'asc' }],
          groups: [{ id: 'g', expression: 'nope2' }],
          detail: band(10, [text('x', { visible: 'nope3', conditions: [{ expression: 'nope4', style: { color: '#f00' } }] })], { visible: 'nope5' }),
        }),
      ],
    });
    const doc = run(t, { items: [{ a: { b: 1 } }, { a: null }] });
    const expressions = doc.issues.map((i) => i.expression);
    expect(expressions).toEqual(expect.arrayContaining(['row.a.b', 'nope1', 'nope2', 'nope3', 'nope4', 'nope5']));
    // Failed filter excludes the row; failed visible expressions keep things visible.
    expect(allTexts(doc)).toEqual(['x']);
  });

  it('records image src errors and leaves the src empty', () => {
    const t = tpl({ body: [{ kind: 'band', ...band(10, [{ id: 'i', type: 'image', x: 0, y: 0, width: 5, height: 5, src: '{{ nope }}' }]) }] });
    const doc = run(t);
    expect((doc.pages[0]!.bands[0]!.items[0] as any).src).toBe('');
    expect(doc.issues[0]).toMatchObject({ componentId: 'i', expression: '{{ nope }}' });
  });

  it('can call host functions', () => {
    const t = tpl({ body: [{ kind: 'band', ...band(10, [text('{{ shout("hi") }}')]) }] });
    expect(allTexts(run(t, {}, { functions: { shout: (s: string) => `${s.toUpperCase()}!` } }))).toEqual(['HI!']);
  });
});

describe('sample template', () => {
  it('renders the invoice fixture without issues using real font metrics', () => {
    const orders = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      customer: ['Contoso', 'Fabrikam', 'Northwind'][i % 3],
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      total: (i + 1) * 37.5,
      items: [{ sku: `SKU-${i}`, qty: (i % 4) + 1 }],
    }));
    const doc = generateReport(invoiceTemplate(), { sales: { orders } }, { params: { title: 'Q1 orders' } });
    expect(doc.issues).toEqual([]);
    expect(doc.pages.length).toBeGreaterThan(1);
    const texts = allTexts(doc);
    expect(texts[0]).toBe('Q1 orders');
    expect(texts).toContain('Contoso');
    const grand = (60 * 61 * 37.5) / 2;
    expect(texts).toContain(`$${grand.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    const footers = texts.filter((s) => /^Page \d+ of \d+$/.test(s));
    expect(footers).toHaveLength(doc.pages.length);
    expect(footers.at(-1)).toBe(`Page ${doc.pages.length} of ${doc.pages.length}`);
    // Page header is skipped on the first page (printOnFirstPage: false).
    expect(doc.pages[0]!.bands.some((b) => b.role === 'pageHeader')).toBe(false);
    expect(doc.pages[1]!.bands[0]!.role).toBe('pageHeader');
    // Region header repeats after the page header on later pages.
    expect(doc.pages[1]!.bands[1]!.role).toBe('regionHeader');
    // Every band stays inside the body area.
    for (const page of doc.pages) {
      for (const b of page.bands) {
        expect(b.y).toBeGreaterThanOrEqual(doc.margins.top - 1e-6);
        expect(b.y + b.height).toBeLessThanOrEqual(doc.pageHeight - doc.margins.bottom + 1e-6);
      }
    }
  });
});
