import { describe, expect, it, vi } from 'vitest';
import { createFontMeasurer, createStandardFontMeasurer, exportPdf, generateReport } from '../../src';
import { fontBytes, FontSet, loadFontkit } from '../../src/export/fonts';
import { band, text, tpl } from '../layout/helpers';
import { latoBytes, vazirmatnBytes } from './helpers';

const lato = { family: 'Lato', data: latoBytes() };
const vazirmatn = { family: 'Vazirmatn', data: vazirmatnBytes() };
const spec = (family: string) => ({ family, size: 10, bold: false, italic: false });
const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]);

async function fontSet(...fonts: { family: string; data: Uint8Array }[]) {
  return new FontSet(await loadFontkit(), fonts);
}
const names = (set: FontSet, text: string, family: string) => set.assign(text, spec(family)).map((c) => c?.registration.family ?? 'standard');

describe('FontSet: per-character fallback', () => {
  it('draws characters the requested font lacks with another registered font', async () => {
    const set = await fontSet(lato, vazirmatn);
    // Lato has no Persian letters; the space after "Hi" stays with Lato, the one after "سلام" with Vazirmatn.
    expect(names(set, 'Hi سلام', 'Lato')).toEqual(['Lato', 'Lato', 'Lato', 'Vazirmatn', 'Vazirmatn', 'Vazirmatn', 'Vazirmatn']);
  });

  it('uses registered fonts for text in standard font families', async () => {
    const set = await fontSet(vazirmatn);
    expect(names(set, 'Hi سل', 'Helvetica')).toEqual(['standard', 'standard', 'standard', 'Vazirmatn', 'Vazirmatn']);
  });

  it('keeps joiners, marks and digits with the previous font', async () => {
    const set = await fontSet(lato, vazirmatn);
    // "می‌شود" with a zero-width non-joiner, then Persian digits.
    expect(new Set(names(set, 'می\u200Cشود ۱۲', 'Lato'))).toEqual(new Set(['Vazirmatn']));
  });

  it('reports characters no font has and falls back to the primary font', async () => {
    const set = await fontSet(lato);
    const onMissing = vi.fn();
    const choices = set.assign('a中', spec('Lato'), onMissing);
    expect(onMissing).toHaveBeenCalledWith(0x4e2d);
    expect(choices.map((c) => c?.registration.family)).toEqual(['Lato', 'Lato']);
  });

  it('treats several files of one family as one font (script subsets)', async () => {
    // As Fontsource ships fonts: a "latin" file and an "arabic" file under the same family.
    const set = await fontSet({ family: 'Brand', data: latoBytes() }, { family: 'Brand', data: vazirmatnBytes() });
    const choices = set.assign('aس', spec('Brand'));
    expect(choices[0]!.font).not.toBe(choices[1]!.font);
    expect(set.candidates(spec('Brand'))).toHaveLength(3);
  });

  it('prefers the closest variant', async () => {
    const set = await fontSet(lato, { family: 'Lato', bold: true, data: latoBytes() } as never);
    expect(set.candidates({ family: 'Lato', bold: true, italic: false })[0]!.bold).toBe(true);
    expect(set.candidates({ family: 'Lato', bold: false, italic: true })[0]!.bold).toBe(false);
  });
});

describe('createFontMeasurer', () => {
  it('measures fallback characters with the font that draws them', async () => {
    const m = await createFontMeasurer([lato, vazirmatn]);
    expect(m.measure('سلام', spec('Lato'))).toBeCloseTo(m.measure('سلام', spec('Vazirmatn')), 6);
    expect(m.measure('Hi سلام', spec('Lato'))).toBeCloseTo(m.measure('Hi ', spec('Lato')) + m.measure('سلام', spec('Vazirmatn')), 6);
  });

  it('ignores bidi controls and keeps standard metrics without fonts', async () => {
    const m = await createFontMeasurer([lato]);
    expect(m.measure('a\u200Fb', spec('Lato'))).toBeCloseTo(m.measure('ab', spec('Lato')), 6);
    const none = await createFontMeasurer([]);
    expect(none.measure('Hello', spec('Helvetica'))).toBeCloseTo(createStandardFontMeasurer().measure('Hello', spec('Helvetica')), 6);
  });
});

describe('WOFF2 fonts', () => {
  it('are rejected with a clear message', async () => {
    expect(() => fontBytes({ family: 'Roboto', data: woff2 })).toThrow(/Font "Roboto" is a WOFF2 file.*\.ttf, \.otf or \.woff/);
    await expect(createFontMeasurer([{ family: 'Roboto', data: woff2 }])).rejects.toThrow(/WOFF2/);
    const doc = generateReport(tpl({ body: [{ kind: 'band', ...band(20, [text('Hi', { style: { fontFamily: 'Roboto' } })]) }] }), {});
    await expect(exportPdf(doc, { fonts: [{ family: 'Roboto', data: woff2.buffer }] })).rejects.toThrow(/WOFF2/);
  });
});
