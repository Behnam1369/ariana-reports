import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currencyToWords, exportExcel, exportPdf, formatNumber, generateReport, parseTemplate, type LayoutDocument } from '../src';
const read = (name: string) => readFileSync(new URL(`../../../examples/shared/${name}`, import.meta.url), 'utf8');
describe('example report', () => {
  const template = parseTemplate(read('sales.template.json'));
  const data = JSON.parse(read('sales.data.json'));
  it('is a valid template that generates without issues', () => {
    const doc = generateReport(template, data);
    expect(doc.issues).toEqual([]);
    expect(doc.pages.length).toBeGreaterThan(1);
    const texts = doc.pages.flatMap((p) => p.bands.flatMap((b) => b.items.flatMap((i) => (i.kind === 'text' ? [i.text] : []))));
    expect(texts[0]).toBe('Sales by customer');
    expect(texts).toContain(`Grand total (${data.orders.length} orders)`);
    const grand = data.orders.reduce((s: number, o: { total: number }) => s + o.total, 0);
    expect(texts).toContain(grand.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
  });
  it('exports to PDF and Excel', async () => {
    const doc = generateReport(template, data);
    const pdf = await exportPdf(doc);
    const xlsx = await exportExcel(doc);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(xlsx[0]).toBe(0x50); // ZIP "PK"
  });
});

describe('journal entry example', () => {
  const template = parseTemplate(read('journal-entry.template.json'));
  const data = JSON.parse(read('journal-entry.data.json'));
  type Item = { row: number; debit: number; credit: number; currency_amount: number };
  const items: Item[] = data.root.items;
  const n2 = (v: number) => formatNumber(v, { decimals: 2 }, 'en-US');
  const textOf = (doc: LayoutDocument, page: number, id: string) =>
    doc.pages[page]!.bands.flatMap((b) => b.items).find((i) => i.componentId === id && i.kind === 'text') as
      | { text: string }
      | undefined;
  const rowsOn = (doc: LayoutDocument, page: number) =>
    doc.pages[page]!.bands.filter((b) => b.role === 'detail').map((b) => Number(textOfBand(b)));
  const textOfBand = (b: LayoutDocument['pages'][number]['bands'][number]) =>
    (b.items.find((i) => i.componentId === 'line_row') as { text: string }).text;

  it('generates several pages without issues', () => {
    const doc = generateReport(template, data);
    expect(doc.issues).toEqual([]);
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(doc.pageWidth).toBeGreaterThan(doc.pageHeight);
    const all = doc.pages.flatMap((_, p) => rowsOn(doc, p));
    expect(all).toEqual(items.map((i) => i.row));
  });

  it('prints brought-forward and carried-forward totals per page', () => {
    const doc = generateReport(template, data);
    const last = doc.pages.length - 1;
    let before = { debit: 0, credit: 0 };
    for (let p = 0; p <= last; p++) {
      const onPage = items.filter((i) => rowsOn(doc, p).includes(i.row));
      const through = {
        debit: before.debit + onPage.reduce((s, i) => s + i.debit, 0),
        credit: before.credit + onPage.reduce((s, i) => s + i.credit, 0),
      };
      if (p === 0) expect(textOf(doc, p, 'bf_debit')).toBeUndefined();
      else {
        expect(textOf(doc, p, 'bf_label')!.text).toBe('Brought forward');
        expect(textOf(doc, p, 'bf_debit')!.text).toBe(n2(before.debit));
        expect(textOf(doc, p, 'bf_credit')!.text).toBe(n2(before.credit));
      }
      if (p === last) expect(textOf(doc, p, 'cf_debit')).toBeUndefined();
      else {
        expect(textOf(doc, p, 'cf_debit')!.text).toBe(n2(through.debit));
        expect(textOf(doc, p, 'cf_credit')!.text).toBe(n2(through.credit));
      }
      expect(textOf(doc, p, 'page_of')!.text).toBe(`Page ${p + 1} of ${last + 1}`);
      expect(textOf(doc, p, 'org_name')!.text).toBe(data.root.organization_name);
      before = through;
    }
  });

  it('prints the total and the amount in words on the last page', () => {
    const doc = generateReport(template, data);
    const last = doc.pages.length - 1;
    const total = items.reduce((s, i) => s + i.debit, 0);
    expect(textOf(doc, last, 'total_debit')!.text).toBe(n2(total));
    expect(textOf(doc, last, 'total_credit')!.text).toBe(n2(items.reduce((s, i) => s + i.credit, 0)));
    expect(textOf(doc, last, 'total_words')!.text).toBe(`In words: ${currencyToWords(total, 'Dollars', 'Cents')}`);
    for (let p = 0; p < last; p++) expect(textOf(doc, p, 'total_debit')).toBeUndefined();
  });

  it('hides zero amounts and stretches cells to the row height', () => {
    const doc = generateReport(template, data);
    const bands = doc.pages.flatMap((p) => p.bands.filter((b) => b.role === 'detail'));
    const first = bands[0]!;
    const cell = (id: string) => first.items.find((i) => i.componentId === id) as { text: string; height: number };
    expect(cell('line_debit').text).toBe(n2(items[0]!.debit));
    expect(cell('line_credit').text).toBe('');
    const tall = bands.find((b) => b.height > bands[0]!.height + 1) ?? bands.find((b) => b.items.some((i) => i.componentId === 'line_centers'))!;
    for (const id of ['line_row', 'line_debit', 'line_rate', 'line_account_box']) {
      const it = tall.items.find((i) => i.componentId === id)!;
      expect(it.y + it.height).toBeCloseTo(tall.y + tall.height, 3);
    }
  });

  it('exports to PDF and Excel', async () => {
    const doc = generateReport(template, data);
    expect(new TextDecoder().decode((await exportPdf(doc)).slice(0, 5))).toBe('%PDF-');
    expect((await exportExcel(doc))[0]).toBe(0x50);
  });
});
