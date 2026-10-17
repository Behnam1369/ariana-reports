import { describe, expect, it, vi } from 'vitest';
import { PDFName } from 'pdf-lib';
import {
  createFontMeasurer,
  createStandardFontMeasurer,
  exportPdf,
  generateReport,
  sanitizeForStandardFont,
  type LayoutDocument,
  type LayoutText,
} from '../../src';
import type { ReportComponent, ReportTemplate } from '../../src/model/types';
import { invoiceTemplate } from '../fixtures/invoice';
import { band, region, text, tpl } from '../layout/helpers';
import { dataUri, drawnTexts, latoBytes, loadPdf, makeJpeg, makePng, pageContent } from './helpers';

const single = (components: ReportComponent[], extra: Partial<ReportTemplate> = {}): LayoutDocument =>
  generateReport(tpl({ body: [{ kind: 'band', ...band(100, components) }], ...extra }), {});

describe('exportPdf: document structure', () => {
  it('creates one page per layout page with the right size', async () => {
    const t = tpl({ body: [region({ detail: band(100, [text('{{ row.id }}')]) })] });
    const doc = generateReport(t, { items: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
    const pdf = await loadPdf(await exportPdf(doc));
    expect(pdf.getPageCount()).toBe(doc.pages.length);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 200, height: 300 });
  });

  it('sets metadata', async () => {
    const pdf = await loadPdf(await exportPdf(single([]), { author: 'Ada', subject: 'Sales' }));
    expect(pdf.getTitle()).toBe('Test');
    expect(pdf.getAuthor()).toBe('Ada');
    expect(pdf.getSubject()).toBe('Sales');
    expect(pdf.getCreator()).toBe('ariana-report');
    const custom = await loadPdf(await exportPdf(single([]), { title: 'Custom' }));
    expect(custom.getTitle()).toBe('Custom');
  });

  it('renders an empty report as one blank page', async () => {
    const pdf = await loadPdf(await exportPdf(generateReport(tpl(), {})));
    expect(pdf.getPageCount()).toBe(1);
  });
});

describe('exportPdf: text', () => {
  it('draws every line at the layout position with PDF coordinates', async () => {
    const doc = single([text('Hello world', { x: 5, y: 10, width: 100, height: 20, style: { fontSize: 10 } })]);
    const item = doc.pages[0]!.bands[0]!.items[0] as LayoutText;
    const page = (await loadPdf(await exportPdf(doc))).getPage(0);
    const [drawn] = drawnTexts(page);
    expect(drawn).toMatchObject({ text: 'Hello world', size: 10, x: item.x });
    // Baseline sits inside the first line box: between its top and bottom in PDF coordinates.
    const lineTop = 300 - item.y;
    expect(drawn!.y).toBeLessThan(lineTop);
    expect(drawn!.y).toBeGreaterThan(lineTop - item.lineHeight);
  });

  it('draws wrapped lines one line height apart', async () => {
    const doc = single([text('one two three four five six seven', { width: 40, height: 80, canGrow: true })]);
    const item = doc.pages[0]!.bands[0]!.items[0] as LayoutText;
    expect(item.lines.length).toBeGreaterThan(2);
    const drawn = drawnTexts((await loadPdf(await exportPdf(doc))).getPage(0));
    expect(drawn.map((d) => d.text)).toEqual(item.lines);
    expect(drawn[0]!.y - drawn[1]!.y).toBeCloseTo(item.lineHeight, 5);
  });

  it('aligns text horizontally', async () => {
    const m = createStandardFontMeasurer();
    const width = m.measure('abc', { family: 'Helvetica', size: 10, bold: false, italic: false });
    const doc = single([
      text('abc', { id: 'l', x: 0, y: 0, width: 100, style: { textAlign: 'left' } }),
      text('abc', { id: 'c', x: 0, y: 20, width: 100, style: { textAlign: 'center' } }),
      text('abc', { id: 'r', x: 0, y: 40, width: 100, style: { textAlign: 'right', padding: 5 } }),
    ]);
    const xs = drawnTexts((await loadPdf(await exportPdf(doc))).getPage(0)).map((d) => d.x);
    expect(xs[0]).toBeCloseTo(10, 4);
    expect(xs[1]).toBeCloseTo(10 + (100 - width) / 2, 4);
    expect(xs[2]).toBeCloseTo(10 + 100 - 5 - width, 4);
  });

  it('aligns text vertically', async () => {
    const doc = single([
      text('t', { id: 'top', x: 0, y: 0, width: 50, height: 60, style: { verticalAlign: 'top' } }),
      text('m', { id: 'mid', x: 60, y: 0, width: 50, height: 60, style: { verticalAlign: 'middle' } }),
      text('b', { id: 'bot', x: 120, y: 0, width: 50, height: 60, style: { verticalAlign: 'bottom' } }),
    ]);
    const ys = drawnTexts((await loadPdf(await exportPdf(doc))).getPage(0)).map((d) => d.y);
    const lineHeight = 12;
    expect(ys[0]! - ys[1]!).toBeCloseTo((60 - lineHeight) / 2, 4);
    expect(ys[0]! - ys[2]!).toBeCloseTo(60 - lineHeight, 4);
  });

  it('justifies all lines but the last by drawing words separately', async () => {
    const doc = single([text('aa bb cc dd ee ff gg', { width: 40, height: 60, style: { textAlign: 'justify' } })]);
    const item = doc.pages[0]!.bands[0]!.items[0] as LayoutText;
    const drawn = drawnTexts((await loadPdf(await exportPdf(doc))).getPage(0)).map((d) => d.text);
    const lastLine = item.lines.at(-1)!;
    expect(drawn).toContain(lastLine);
    expect(drawn.filter((t) => !t.includes(' ')).length).toBeGreaterThan(item.lines.length);
  });

  it('chooses bold and italic standard fonts', async () => {
    const doc = single([
      text('b', { y: 0, style: { fontWeight: 'bold' } }),
      text('i', { y: 20, style: { fontStyle: 'italic', fontFamily: 'Times' } }),
    ]);
    const pdf = await loadPdf(await exportPdf(doc));
    const fonts = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('Font'))!.toString();
    expect(fonts).toBeTruthy();
    const all = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString()).join('\n');
    expect(all).toContain('/Helvetica-Bold');
    expect(all).toContain('/Times-Italic');
  });

  it('replaces characters standard fonts cannot encode instead of failing', async () => {
    expect(sanitizeForStandardFont('Café 中\tok')).toBe('Café ?    ok');
    const doc = single([text('سلام Hi')]);
    const onWarning = vi.fn();
    const drawn = drawnTexts((await loadPdf(await exportPdf(doc, { onWarning }))).getPage(0));
    // The text starts with a Persian letter, so it is right-to-left: "Hi" is drawn on the left.
    expect(drawn.map((d) => d.text).join('')).toBe('Hi ????');
    expect(onWarning).toHaveBeenCalledWith(expect.stringMatching(/No font can draw "س" \(U\+0633\).*Register a font/));
  });

  it('adds underline and strike-through lines', async () => {
    const plain = pageContent((await loadPdf(await exportPdf(single([text('x')])))).getPage(0));
    const underlined = pageContent(
      (await loadPdf(await exportPdf(single([text('x', { style: { textDecoration: 'underline' } })])))).getPage(0),
    );
    const struck = pageContent(
      (await loadPdf(await exportPdf(single([text('x', { style: { textDecoration: 'line-through' } })])))).getPage(0),
    );
    const strokes = (s: string) => (s.match(/\bS\b/g) ?? []).length;
    expect(strokes(underlined)).toBe(strokes(plain) + 1);
    expect(strokes(struck)).toBe(strokes(plain) + 1);
  });

  it('clips text to its box', async () => {
    const content = pageContent((await loadPdf(await exportPdf(single([text('x')])))).getPage(0));
    expect(content).toMatch(/re\s+W\s+n/);
  });

  it('skips empty and transparent text', async () => {
    const doc = single([text(''), text('invisible', { y: 20, style: { color: 'transparent' } })]);
    expect(drawnTexts((await loadPdf(await exportPdf(doc))).getPage(0))).toEqual([]);
  });
});

describe('exportPdf: shapes', () => {
  it('fills backgrounds and draws border sides', async () => {
    const doc = single([
      text('x', { style: { backgroundColor: '#ff0000', border: { width: 1, color: '#0000ff', style: 'solid', sides: ['bottom', 'top'] } } }),
    ]);
    const content = pageContent((await loadPdf(await exportPdf(doc))).getPage(0));
    expect(content).toContain('1 0 0 rg');
    expect(content).toContain('0 0 1 RG');
    expect((content.match(/\bl\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('applies dash patterns for dashed and dotted lines', async () => {
    const doc = single([
      { id: 'h', type: 'line', orientation: 'horizontal', x: 0, y: 0, width: 100, height: 0, style: { border: { width: 1, color: '#000', style: 'dashed' } } },
      { id: 'v', type: 'line', orientation: 'vertical', x: 50, y: 0, width: 0, height: 50, style: { border: { width: 2, color: '#000', style: 'dotted' } } },
    ]);
    const content = pageContent((await loadPdf(await exportPdf(doc))).getPage(0));
    expect(content).toMatch(/\[3 2\] 0 d/);
    expect(content).toMatch(/\[2 3\] 0 d/);
  });

  it('honours color opacity through graphics states', async () => {
    const doc = single([{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } }]);
    const content = pageContent((await loadPdf(await exportPdf(doc))).getPage(0));
    expect(content).toMatch(/\/GS-\S+ gs/);
  });

  it('draws rounded rectangles as curves', async () => {
    const doc = single([
      {
        id: 'r',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 50,
        height: 30,
        cornerRadius: 5,
        style: { backgroundColor: '#eeeeee', border: { width: 1, color: '#000', style: 'solid' } },
      },
    ]);
    const content = pageContent((await loadPdf(await exportPdf(doc))).getPage(0));
    expect(content).toMatch(/\bc\b/);
    expect(content).toMatch(/\bB\b/);
  });

  it('draws band backgrounds and borders', async () => {
    const t = tpl({ body: [{ kind: 'band', ...band(20, [], { style: { backgroundColor: '#00ff00', border: { width: 1, color: '#000', style: 'solid' } } }) }] });
    const content = pageContent((await loadPdf(await exportPdf(generateReport(t, {})))).getPage(0));
    expect(content).toContain('0 1 0 rg');
    expect((content.match(/\bS\b/g) ?? []).length).toBe(4);
  });
});

describe('exportPdf: images', () => {
  const image = (src: string, extra: Partial<Extract<ReportComponent, { type: 'image' }>> = {}): ReportComponent => ({
    id: `img${Math.random()}`,
    type: 'image',
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    src,
    ...extra,
  });
  const imageCount = (content: string) => (content.match(/\/Image-\S+ Do/g) ?? []).length;

  it('embeds PNG and JPEG data URIs once per source', async () => {
    const png = dataUri(makePng(4, 2), 'image/png');
    const jpg = dataUri(makeJpeg(10, 10), 'image/jpeg');
    const pdf = await loadPdf(await exportPdf(single([image(png), image(png, { y: 30 }), image(jpg, { y: 60, fit: 'cover' })])));
    expect(imageCount(pageContent(pdf.getPage(0)))).toBe(3);
    // pdf-lib adds an XObject key per draw, but identical sources share one image object.
    const xobjects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'))!.toString();
    const refs = new Set(xobjects.match(/\d+ 0 R/g));
    expect(refs.size).toBe(2);
  });

  it('uses a custom image loader', async () => {
    const loadImage = vi.fn(async () => makePng(1, 1));
    const content = pageContent((await loadPdf(await exportPdf(single([image('logo.png')]), { loadImage }))).getPage(0));
    expect(loadImage).toHaveBeenCalledWith('logo.png');
    expect(imageCount(content)).toBe(1);
  });

  it('warns about unsupported or failing images and keeps going', async () => {
    const onWarning = vi.fn();
    const loadImage = async (src: string) => {
      if (src === 'boom') throw new Error('network down');
      if (src === 'gif') return new Uint8Array([0x47, 0x49, 0x46, 0x38]);
      return null;
    };
    const doc = single([image('boom'), image('gif', { y: 30 }), image('none', { y: 60 }), text('still here', { y: 90 })]);
    const pdf = await loadPdf(await exportPdf(doc, { loadImage, onWarning }));
    expect(onWarning).toHaveBeenCalledTimes(2);
    expect(onWarning.mock.calls[0]![0]).toMatch(/could not be loaded: network down/);
    expect(onWarning.mock.calls[1]![0]).toMatch(/not a PNG or JPEG/);
    expect(drawnTexts(pdf.getPage(0)).map((d) => d.text)).toEqual(['still here']);
  });

  it('skips images with an empty src without calling the loader', async () => {
    const loadImage = vi.fn(async () => null);
    await exportPdf(single([image('')]), { loadImage });
    expect(loadImage).not.toHaveBeenCalled();
  });
});

describe('exportPdf: custom fonts', () => {
  it('embeds registered fonts and keeps line breaks consistent with the layout', async () => {
    const fonts = [{ family: 'Lato', data: latoBytes() }];
    const measurer = await createFontMeasurer(fonts);
    const spec = { family: 'Lato', size: 10, bold: false, italic: false };
    const standard = createStandardFontMeasurer().measure('Hello world', { ...spec, family: 'Helvetica' });
    expect(measurer.measure('Hello world', spec)).not.toBeCloseTo(standard, 1);
    // Unregistered families fall back to the standard metrics.
    expect(measurer.measure('Hello world', { ...spec, family: 'Helvetica' })).toBeCloseTo(standard, 6);
    // Bold falls back to the regular face of the same family.
    expect(measurer.measure('Hello', { ...spec, bold: true })).toBeCloseTo(measurer.measure('Hello', spec), 6);

    const t = tpl({ body: [{ kind: 'band', ...band(100, [text('Hello world', { style: { fontFamily: 'Lato' } })]) }] });
    const doc = generateReport(t, {}, { measurer });
    const pdf = await loadPdf(await exportPdf(doc, { fonts }));
    const all = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString()).join('\n');
    expect(all).toMatch(/Lato/);
    // Custom fonts use glyph ids, so the text is not WinAnsi hex, but it is drawn.
    expect(pageContent(pdf.getPage(0))).toMatch(/Tj/);
  });
});

describe('exportPdf: full report', () => {
  it('exports the multi-page sample report', async () => {
    const orders = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      customer: ['A', 'B', 'C'][i % 3],
      date: '2026-01-01',
      total: i * 10 + 5,
      items: [{ sku: 'x', qty: 1 }],
    }));
    const doc = generateReport(invoiceTemplate(), { sales: { orders } });
    const bytes = await exportPdf(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await loadPdf(bytes);
    expect(pdf.getPageCount()).toBe(doc.pages.length);
    const lastTexts = drawnTexts(pdf.getPage(pdf.getPageCount() - 1)).map((d) => d.text);
    expect(lastTexts).toContain(`Page ${doc.pages.length} of ${doc.pages.length}`);
  });
});
