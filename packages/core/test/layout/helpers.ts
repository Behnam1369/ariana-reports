import type { Band, DataRegion, ReportComponent, ReportTemplate } from '../../src/model/types';
import type { LayoutBand, LayoutDocument, LayoutText, TextMeasurer } from '../../src/layout';

/** Every character is exactly `size / 2` points wide: easy arithmetic in tests. */
export const fixedMeasurer: TextMeasurer = {
  measure: (text, font) => [...text].length * (font.size / 2),
};

/**
 * A 200 x 300 pt page with 10 pt margins, so the body is 180 pt wide and
 * spans y = 10 .. 290.
 */
export function tpl(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    schemaVersion: 1,
    name: 'Test',
    unit: 'pt',
    page: { size: { width: 200, height: 300 }, orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataSources: [{ name: 'items' }],
    body: [],
    ...overrides,
  };
}

let seq = 0;

export function text(textValue: string, extra: Partial<Extract<ReportComponent, { type: 'text' }>> = {}): ReportComponent {
  return { id: `t${++seq}`, type: 'text', x: 0, y: 0, width: 180, height: 10, text: textValue, ...extra };
}

export function band(height: number, components: ReportComponent[] = [], extra: Partial<Band> = {}): Band {
  return { id: `b${++seq}`, height, components, ...extra };
}

export function region(extra: Partial<DataRegion> & { detail: Band }): DataRegion {
  return { kind: 'dataRegion', id: `r${++seq}`, dataSource: 'items', ...extra };
}

/** Text of every text item on a page, top to bottom. */
export function pageTexts(doc: LayoutDocument, pageIndex: number): string[] {
  return doc.pages[pageIndex]!.bands.flatMap((b) => b.items.filter((i): i is LayoutText => i.kind === 'text').map((i) => i.text));
}

/** All text items of the document in reading order. */
export function allTexts(doc: LayoutDocument): string[] {
  return doc.pages.flatMap((_, i) => pageTexts(doc, i));
}

export function bandsOf(doc: LayoutDocument, pageIndex: number): LayoutBand[] {
  return doc.pages[pageIndex]!.bands;
}
