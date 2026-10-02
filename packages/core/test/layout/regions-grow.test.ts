import { describe, expect, it } from 'vitest';
import { generateReport, type GenerateOptions, type LayoutText } from '../../src/layout';
import type { ReportComponent, ReportTemplate } from '../../src/model/types';
import { band, bandsOf, fixedMeasurer, pageTexts, region, text, tpl } from './helpers';

const run = (template: ReportTemplate, data: unknown = {}, options: GenerateOptions = {}) =>
  generateReport(template, data, { measurer: fixedMeasurer, ...options });
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, amount: 10 }));

describe('page.regions', () => {
  // Body: 280 pt. Footer 20 pt -> 260 pt. Region header 20 pt repeats, rows 20 pt.
  const journal = () =>
    tpl({
      pageFooter: band(20, [
        text('cf {{ sum(page.regions.lines.through, "amount") }}', { visible: 'page.number < page.count' }),
        text('rows {{ page.regions.lines.rows.length }}', { x: 0, y: 10, width: 90 }),
      ]),
      body: [
        region({
          id: 'lines',
          repeatHeaderOnEachPage: true,
          header: band(
            20,
            [text('bf {{ sum(page.regions.lines.before, "amount") }}', { visible: 'page.number > 1' })],
            { canShrink: true },
          ),
          detail: band(20, [text('{{ row.id }}')]),
          footer: band(20, [text('total {{ sum(rows, "amount") }}')]),
        }),
      ],
    });

  it('provides rows before, on and through each page for running totals', () => {
    const doc = run(journal(), { items: rowsOf(30) });
    expect(doc.issues).toEqual([]);
    expect(doc.pages).toHaveLength(3);
    // Page 1: the header shrinks away (nothing visible) -> 13 rows of 20 pt in 260 pt.
    const p1 = pageTexts(doc, 0);
    expect(p1).not.toContain('bf 0');
    expect(p1).toContain('cf 130');
    expect(p1).toContain('rows 13');
    // Page 2: repeated header shows the brought-forward total.
    const p2 = pageTexts(doc, 1);
    expect(p2[0]).toBe('bf 130');
    expect(p2).toContain('cf 250');
    expect(p2).toContain('rows 12');
    // Last page: no carried-forward line, but the region footer total.
    const p3 = pageTexts(doc, 2);
    expect(p3[0]).toBe('bf 250');
    expect(p3).toContain('total 300');
    expect(p3.some((t) => t.startsWith('cf'))).toBe(false);
    expect(p3).toContain('rows 5');
  });

  it('is readable from body bands for the current page so far', () => {
    const t = tpl({
      body: [region({ id: 'r', detail: band(20, [text('{{ row.id }}:{{ page.regions.r.rows.length }}:{{ page.regions.r.before.length }}')]) })],
    });
    const doc = run(t, { items: rowsOf(16) });
    expect(pageTexts(doc, 0).slice(0, 3)).toEqual(['1:0:0', '2:1:0', '3:2:0']);
    expect(pageTexts(doc, 1)[0]).toBe('15:0:14');
  });

  it('tracks each region separately and ignores other bands', () => {
    const t = tpl({
      dataSources: [{ name: 'a' }, { name: 'b' }],
      pageFooter: band(20, [text('{{ page.regions.ra.through.length }}/{{ page.regions.rb.through.length }}')]),
      body: [
        region({ id: 'ra', dataSource: 'a', header: band(10, [text('A')]), detail: band(10, [text('{{ row.id }}')]) }),
        region({ id: 'rb', dataSource: 'b', detail: band(10, [text('{{ row.id }}')]) }),
      ],
    });
    const doc = run(t, { a: rowsOf(3), b: rowsOf(2) });
    expect(pageTexts(doc, 0).at(-1)).toBe('3/2');
  });

  it('is empty for unknown ids and regions without rows', () => {
    const t = tpl({
      pageFooter: band(20, [text('{{ isNull(page.regions.nope) }} {{ page.regions.r.through.length }}')]),
      body: [region({ id: 'r', detail: band(10, [text('x')]) })],
    });
    const doc = run(t, { items: [] });
    expect(pageTexts(doc, 0)).toEqual(['true 0']);
  });

  it('resets between passes when page.count is used in the body', () => {
    const t = tpl({
      pageFooter: band(20, [text('{{ page.regions.r.through.length }}')]),
      body: [region({ id: 'r', detail: band(20, [text('{{ row.id }} of {{ page.count }}')]) })],
    });
    const doc = run(t, { items: rowsOf(20) });
    expect(doc.pages).toHaveLength(2);
    expect(pageTexts(doc, 0).at(-1)).toBe('13');
    expect(pageTexts(doc, 1).at(-1)).toBe('20');
  });

  it('cannot be modified from expressions', () => {
    const t = tpl({
      body: [region({ id: 'r', detail: band(10, [text('{{ page.regions.r = 1 }}')]) })],
    });
    expect(() => run(t, { items: rowsOf(1) })).toThrow();
  });
});

describe('growToHeight', () => {
  const cells = (grow: boolean): ReportComponent[] => [
    text('{{ row.long }}', { id: `long${grow}`, width: 20, canGrow: true }),
    text('{{ row.id }}', { id: `short${grow}`, x: 20, y: 2, width: 40, growToHeight: grow }),
    { id: `vline${grow}`, type: 'line', orientation: 'vertical', x: 60, y: 0, width: 0, height: 10, growToHeight: grow },
    { id: `box${grow}`, type: 'rectangle', x: 70, y: 0, width: 10, height: 5, growToHeight: grow },
  ];

  it('stretches components to the bottom of a grown band', () => {
    // "aaaa bbbb cccc" wraps to 3 lines of 12 pt (10 pt font * 1.2) -> band height 36.
    const t = tpl({ body: [region({ detail: band(10, cells(true)) })] });
    const doc = run(t, { items: [{ id: 1, long: 'aaaa bbbb cccc' }] });
    const b = bandsOf(doc, 0)[0]!;
    expect(b.height).toBeCloseTo(36);
    const [, short, vline, box] = b.items;
    expect(short!.height).toBeCloseTo(34);
    expect((short as LayoutText).text).toBe('1');
    expect(vline).toMatchObject({ kind: 'line' });
    if (vline!.kind === 'line') expect(vline!.y2 - vline!.y1).toBeCloseTo(36);
    expect(box!.height).toBeCloseTo(36);
  });

  it('leaves components alone when the option is off', () => {
    const t = tpl({ body: [region({ detail: band(10, cells(false)) })] });
    const doc = run(t, { items: [{ id: 1, long: 'aaaa bbbb cccc' }] });
    const [, short, , box] = bandsOf(doc, 0)[0]!.items;
    expect(short!.height).toBe(10);
    expect(box!.height).toBe(5);
  });

  it('fills a fixed-height band and never shrinks a component', () => {
    const t = tpl({
      pageHeader: band(30, [text('x', { height: 10, growToHeight: true }), text('y', { y: 5, height: 40, growToHeight: true })]),
    });
    const doc = run(t);
    const [x, y] = bandsOf(doc, 0)[0]!.items;
    expect(x!.height).toBe(30);
    expect(y!.height).toBe(40);
  });
});
