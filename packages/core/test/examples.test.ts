import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportExcel, exportPdf, generateReport, parseTemplate } from '../src';

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
