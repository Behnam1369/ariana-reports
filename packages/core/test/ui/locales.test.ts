import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LABELS,
  designSections,
  fa,
  findUiLocale,
  formatLabel,
  optionLabel,
  registerUiLocale,
  resolveUiLocale,
  uiLocales,
} from '../../src';
import { invoiceTemplate } from '../fixtures/invoice';

describe('UI locales', () => {
  it('defaults to English, left to right', () => {
    const ui = resolveUiLocale();
    expect(ui).toMatchObject({ code: 'en', dir: 'ltr' });
    expect(ui.labels).toEqual(DEFAULT_LABELS);
  });

  it('ships a complete Persian translation, right to left', () => {
    const ui = resolveUiLocale('fa');
    expect(ui.dir).toBe('rtl');
    expect(Object.keys(fa.labels).sort()).toEqual(Object.keys(DEFAULT_LABELS).sort());
    expect(ui.labels.nextPage).toBe('صفحهٔ بعد');
    expect(optionLabel(ui.values, 'portrait')).toBe('عمودی');
    expect(optionLabel(ui.values, 'A4')).toBe('A4');
  });

  it('matches region codes to their language and falls back to English', () => {
    expect(findUiLocale('fa-IR')).toBe(fa);
    expect(findUiLocale('FA_ir')).toBe(fa);
    expect(resolveUiLocale('xx').code).toBe('en');
  });

  it('applies label overrides on top of the locale', () => {
    const ui = resolveUiLocale('fa', { print: 'چاپ گزارش' });
    expect(ui.labels.print).toBe('چاپ گزارش');
    expect(ui.labels.zoomIn).toBe(fa.labels.zoomIn);
  });

  it('accepts locale objects and registered locales; missing labels fall back to English', () => {
    const de = { code: 'de', labels: { print: 'Drucken' }, values: { bold: 'fett' } };
    expect(resolveUiLocale(de).labels).toMatchObject({ print: 'Drucken', zoomIn: 'Zoom in' });
    registerUiLocale(de);
    expect(uiLocales()).toContain('de');
    expect(resolveUiLocale('de-CH')).toMatchObject({ code: 'de', dir: 'ltr', values: { bold: 'fett' } });
  });

  it('formats placeholders', () => {
    expect(formatLabel('Page {page} of {count}', { page: 2, count: 9 })).toBe('Page 2 of 9');
    expect(formatLabel('{a} {missing}', { a: 1 })).toBe('1 {missing}');
  });

  it('translates design surface captions', () => {
    const en = designSections(invoiceTemplate()).map((s) => s.label);
    const persian = designSections(invoiceTemplate(), fa.labels as typeof DEFAULT_LABELS).map((s) => s.label);
    expect(en).toContain('Page header');
    expect(persian).toContain('سرصفحه');
    expect(persian.some((l) => l.startsWith('جزئیات: '))).toBe(true);
  });
});
