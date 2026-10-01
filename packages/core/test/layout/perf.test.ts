import { describe, expect, it } from 'vitest';
import { generateReport } from '../../src/layout';
import { invoiceTemplate } from '../fixtures/invoice';

describe('performance', () => {
  it('lays out 10,000 grouped master-detail rows in a reasonable time', () => {
    const orders = Array.from({ length: 10_000 }, (_, i) => ({
      id: i + 1,
      customer: `Customer ${i % 50}`,
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      total: (i % 500) + 0.5,
      items: [{ sku: `SKU-${i}`, qty: 1 }],
    }));
    const start = performance.now();
    const doc = generateReport(invoiceTemplate(), { sales: { orders } });
    const elapsed = performance.now() - start;
    expect(doc.issues).toEqual([]);
    expect(doc.pages.length).toBeGreaterThan(100);
    // Generous bound so slow CI machines pass; typically well under this.
    expect(elapsed).toBeLessThan(15_000);
  }, 30_000);
});
