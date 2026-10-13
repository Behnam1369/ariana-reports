import { describe, expect, it } from 'vitest';
import { exportExcel, exportPdf, generateReport, validateTemplate } from '../src';
import { examples } from '../../../apps/docs/src/demos/data';

// The documentation site's demos and gallery run these templates; they must stay valid and error free.
describe('documentation examples', () => {
  for (const example of examples) {
    it(`${example.id}: valid template, no layout issues`, () => {
      expect(validateTemplate(example.template).errors).toEqual([]);
      const doc = generateReport(example.template, example.data);
      expect(doc.issues).toEqual([]);
      expect(doc.pages.length).toBeGreaterThan(0);
    });
  }

  it('the product catalog spans several pages', () => {
    const e = examples.find((x) => x.id === 'products')!;
    expect(generateReport(e.template, e.data).pages.length).toBeGreaterThan(3);
  });

  it('exports every example to PDF and Excel (Persian falls back to a placeholder glyph in standard fonts)', async () => {
    for (const e of examples) {
      const doc = generateReport(e.template, e.data);
      expect((await exportPdf(doc)).length).toBeGreaterThan(500);
      expect((await exportExcel(doc)).length).toBeGreaterThan(500);
    }
  });
});
