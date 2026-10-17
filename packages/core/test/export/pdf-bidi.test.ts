import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFPage, type PDFFont } from 'pdf-lib';
import { createFontMeasurer, exportPdf, generateReport, type LayoutText } from '../../src';
import { loadFontkit } from '../../src/export/fonts';
import type { ReportComponent } from '../../src/model/types';
import { band, text, tpl } from '../layout/helpers';
import { latoBytes, vazirmatnBytes } from './helpers';

const lato = { family: 'Lato', data: latoBytes() };
const vazirmatn = { family: 'Vazirmatn', data: vazirmatnBytes() };

interface Call {
  text: string;
  font: string;
  x: number;
  y: number;
  width: number;
}

/** Records what the renderer hands to pdf-lib: the string, the font and the position. */
function spyDrawText(): Call[] {
  const calls: Call[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, t, options) {
    const font = options!.font as PDFFont;
    calls.push({ text: t, font: font.name, x: options!.x!, y: options!.y!, width: font.widthOfTextAtSize(t, options!.size!) });
    return original.call(this, t, options);
  });
  return calls;
}

async function render(components: ReportComponent[], fonts = [lato, vazirmatn], onWarning: (m: string) => void = () => {}) {
  const measurer = await createFontMeasurer(fonts);
  const doc = generateReport(tpl({ body: [{ kind: 'band', ...band(100, components) }] }), {}, { measurer });
  const bytes = await exportPdf(doc, { fonts, onWarning });
  return { doc, bytes, item: doc.pages[0]!.bands[0]!.items[0] as LayoutText };
}

afterEach(() => vi.restoreAllMocks());

describe('exportPdf: right-to-left text', () => {
  it('draws pieces in visual order with fallback fonts', async () => {
    const calls = spyDrawText();
    const { item } = await render([text('سلام ۱۲۳ (Lato)', { style: { fontFamily: 'Lato' } })]);
    expect(item.direction).toBe('rtl');
    // Left to right on the page: "(Lato) ۱۲۳ سلام". Brackets are mirrored; Persian letters
    // and Persian digits are handed to fontkit in the order it reverses into visual order.
    expect(calls.map((c) => c.text)).toEqual(['(', 'Lato', ') ', '۳۲۱', 'سلام ']);
    expect(calls.map((c) => /Lato/.test(c.font))).toEqual([true, true, false, false, false]);
    for (let i = 1; i < calls.length; i++) expect(calls[i]!.x).toBeCloseTo(calls[i - 1]!.x + calls[i - 1]!.width, 4);
    // Right-to-left text is right-aligned by default: the last piece ends at the content edge (10 + 180).
    const last = calls.at(-1)!;
    expect(last.x + last.width).toBeCloseTo(190, 3);
  });

  it('relies on fontkit reversing right-to-left scripts, including Persian digits', async () => {
    const fontkit = await loadFontkit();
    const font = fontkit.create(vazirmatnBytes()) as unknown as { layout(s: string): { glyphs: { codePoints: number[] }[] } };
    const order = (s: string) => font.layout(s).glyphs.map((g) => String.fromCodePoint(...g.codePoints)).join('');
    expect(order('۳۲۱')).toBe('۱۲۳');
    expect(order('ab')).toBe('ab');
    expect(order('سل ')[0]).toBe(' ');
  });

  it('draws Persian in a standard-font component with a registered Persian font, without "?"', async () => {
    const calls = spyDrawText();
    const onWarning = vi.fn();
    await render([text('گزارش فروش')], [vazirmatn], onWarning);
    expect(onWarning).not.toHaveBeenCalled();
    // Nothing is drawn with a standard font, so there are no "?" placeholders.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => /Vazirmatn/.test(c.font) && !c.text.includes('?'))).toBe(true);
  });

  it('keeps left-to-right text with embedded Persian in logical order', async () => {
    const calls = spyDrawText();
    await render([text('Total: سلام 12', { style: { fontFamily: 'Lato' } })]);
    // A number after Persian letters belongs to the right-to-left run (rule W2), so it is drawn left of the word.
    expect(calls.map((c) => c.text)).toEqual(['Total: ', '12', 'سلام ']);
    expect(calls[0]!.x).toBeCloseTo(10, 4);
  });

  it('honours an explicit direction and alignment', async () => {
    const calls = spyDrawText();
    await render([text('abc', { style: { direction: 'rtl', textAlign: 'left' } })], []);
    expect(calls[0]!.x).toBeCloseTo(10, 4);
    calls.length = 0;
    await render([text('abc', { style: { direction: 'rtl' } })], []);
    expect(calls[0]!.x + calls[0]!.width).toBeCloseTo(190, 3);
    calls.length = 0;
    // `ltr` keeps Persian text left-aligned.
    await render([text('سلام', { style: { direction: 'ltr', fontFamily: 'Vazirmatn' } })]);
    expect(calls[0]!.x).toBeCloseTo(10, 4);
  });

  it('justifies right-to-left lines and right-aligns the last line', async () => {
    const calls = spyDrawText();
    const { item } = await render([
      text('این یک متن فارسی طولانی است که باید در چند خط شکسته شود', { width: 120, height: 60, style: { fontFamily: 'Vazirmatn', textAlign: 'justify' } }),
    ]);
    expect(item.lines.length).toBeGreaterThan(1);
    const rows = new Map<number, Call[]>();
    for (const c of calls) rows.set(c.y, [...(rows.get(c.y) ?? []), c]);
    const lines = [...rows.values()];
    // Every justified line spans the full content width (10 .. 130); the last ends at the right edge.
    for (const line of lines) {
      const end = line.at(-1)!;
      expect(end.x + end.width).toBeCloseTo(130, 2);
    }
    expect(lines[0]![0]!.x).toBeCloseTo(10, 2);
    // The first word of the paragraph is drawn at the right end of the first line.
    expect(lines[0]!.at(-1)!.text).toBe('این');
  });

  it('places the baseline from the font metrics so tall fonts are not clipped', async () => {
    const calls = spyDrawText();
    await render([text('سلام', { height: 30, style: { fontFamily: 'Vazirmatn', fontSize: 18 } })]);
    // Vazirmatn: ascent 2100, descent -1100, 2048 units per em; line height 1.2 em.
    const size = 18;
    const full = (3200 / 2048) * size;
    const ascent = (2100 / 2048) * size;
    const baseline = 10 + (1.2 * size - full) / 2 + ascent;
    expect(300 - calls[0]!.y).toBeCloseTo(baseline, 3);
  });

  it('warns about characters no font can draw, on the console without a handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = generateReport(tpl({ body: [{ kind: 'band', ...band(20, [text('سلام')]) }] }), {});
    await exportPdf(doc);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[ariana-reports\] No font can draw "س"/));
  });
});
