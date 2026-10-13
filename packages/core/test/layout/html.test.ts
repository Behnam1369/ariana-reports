// @vitest-environment jsdom
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  exportExcel,
  exportPdf,
  generateReport,
  parseHtmlText,
  renderPage,
  resolveRuns,
  runsText,
  validateTemplate,
  wrapRuns,
  wrapText,
  type LayoutDocument,
  type LayoutText,
} from '../../src';
import type { ReportComponent } from '../../src/model/types';
import { drawnTexts, loadPdf } from '../export/helpers';
import { band, fixedMeasurer, text, tpl } from './helpers';

const base = { bold: false, italic: false, underline: false, strike: false, color: '#000000' };
const font = { family: 'Helvetica', size: 10, bold: false, italic: false };

const single = (components: ReportComponent[], data: unknown = {}): LayoutDocument =>
  generateReport(tpl({ body: [{ kind: 'band', ...band(100, components) }] }), data, { measurer: fixedMeasurer });
const firstText = (doc: LayoutDocument) => doc.pages[0]!.bands[0]!.items[0] as LayoutText;

describe('parseHtmlText', () => {
  it('turns whitelisted tags into styled runs', () => {
    expect(parseHtmlText('a <b>b <i>bi</i></b> <u>u</u><s>s</s>')).toEqual([
      { text: 'a ' },
      { text: 'b ', bold: true },
      { text: 'bi', bold: true, italic: true },
      { text: ' ' },
      { text: 'u', underline: true },
      { text: 's', strike: true },
    ]);
    expect(parseHtmlText('<strong>x</strong><em>y</em><del>z</del><ins>w</ins>')).toEqual([
      { text: 'x', bold: true },
      { text: 'y', italic: true },
      { text: 'z', strike: true },
      { text: 'w', underline: true },
    ]);
  });

  it('handles <br>, colors and inline styles', () => {
    expect(runsText(parseHtmlText('one<br>two<BR/>three<br />'))).toBe('one\ntwo\nthree\n');
    expect(parseHtmlText('<font color="red">r</font><font color=#00ff00>g</font>')).toEqual([
      { text: 'r', color: '#ff0000' },
      { text: 'g', color: '#00ff00' },
    ]);
    expect(parseHtmlText('<span style="color: rgb(0,0,255); background-color: #ff0; font-weight: 700; font-style: italic; text-decoration: underline line-through">s</span>')).toEqual([
      { text: 's', color: 'rgb(0,0,255)', backgroundColor: '#ff0', bold: true, italic: true, underline: true, strike: true },
    ]);
    // Inner styles can switch inherited formatting off.
    expect(parseHtmlText('<b>a<span style="font-weight: normal">b</span></b>')).toEqual([
      { text: 'a', bold: true },
      { text: 'b', bold: false },
    ]);
  });

  it('removes unknown tags and their attributes but keeps the text', () => {
    const runs = parseHtmlText('<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:x">link</a><div onclick="x">d</div>');
    expect(runsText(runs)).toBe('alert(1)linkd');
    expect(runs.every((r) => Object.keys(r).join() === 'text')).toBe(true);
  });

  it('ignores invalid colors and unbalanced tags', () => {
    expect(parseHtmlText('<font color="url(javascript:x)">a</font>')).toEqual([{ text: 'a' }]);
    expect(parseHtmlText('<span style="color: expression(alert(1))">a</span>')).toEqual([{ text: 'a' }]);
    expect(parseHtmlText('</b>a<b>b')).toEqual([{ text: 'a' }, { text: 'b', bold: true }]);
    expect(parseHtmlText('<b><i>x</b>y')).toEqual([{ text: 'x', bold: true, italic: true }, { text: 'y' }]);
  });

  it('keeps text that only looks like markup, drops comments and decodes entities', () => {
    expect(runsText(parseHtmlText('a < b and c<d'))).toBe('a < b and c<d');
    expect(runsText(parseHtmlText('x<!-- hidden -->y'))).toBe('xy');
    expect(runsText(parseHtmlText('&lt;b&gt; &amp; &quot;&#39;&#x41;&nbsp;&unknown;'))).toBe('<b> & "\'A\u00a0&unknown;');
    expect(decodeEntities('&#0;&#x110000;')).toBe('&#0;&#x110000;');
  });
});

describe('wrapRuns', () => {
  it('wraps like wrapText when every run has the same style', () => {
    const source = 'The quick brown fox jumps over the lazy dog\n\n  indented paragraph with averyveryverylongword';
    const runs = resolveRuns(parseHtmlText(source), base);
    const lines = wrapRuns(runs, 60, font, fixedMeasurer).map(runsText);
    expect(lines).toEqual(wrapText(source, 60, font, fixedMeasurer));
  });

  it('measures each run with its own font and splits runs at line breaks', () => {
    // Bold glyphs are twice as wide with this measurer.
    const measurer = { measure: (t: string, f: { size: number; bold: boolean }) => [...t].length * (f.bold ? 10 : 5) };
    const runs = resolveRuns(parseHtmlText('aa <b>bb cc</b> dd'), base);
    const lines = wrapRuns(runs, 40, font, measurer);
    // All normal, "aa bb cc" would fit in 40pt; the bold run makes it too wide.
    expect(wrapRuns(resolveRuns(parseHtmlText('aa bb cc dd'), base), 40, font, measurer).map(runsText)).toEqual(['aa bb cc', 'dd']);
    expect(lines.map(runsText)).toEqual(['aa bb', 'cc dd']);
    expect(lines[1]!.map((r) => [r.text, r.bold])).toEqual([['cc', true], [' dd', false]]);
    expect(wrapRuns(runs, 40, font, measurer, false).map(runsText)).toEqual(['aa bb cc dd']);
  });
});

describe('allowHtml in the layout engine', () => {
  it('lays out styled runs after interpolation and formatting', () => {
    const doc = single([text('<b>{{ params.name }}</b>: {{ 5 }}', { allowHtml: true, format: { type: 'number', decimals: 1 } })], {});
    const item = generateReport(
      tpl({ body: [{ kind: 'band', ...band(100, [text('<b>{{ params.name }}</b>: {{ params.n }}', { allowHtml: true })]) }] }),
      {},
      { measurer: fixedMeasurer, params: { name: 'Ada', n: 5 } },
    ).pages[0]!.bands[0]!.items[0] as LayoutText;
    expect(item.text).toBe('Ada: 5');
    expect(item.lines).toEqual(['Ada: 5']);
    expect(item.runs).toEqual([[expect.objectContaining({ text: 'Ada', bold: true }), expect.objectContaining({ text: ': 5', bold: false })]]);
    expect(item.richText).toHaveLength(2);
    expect(firstText(doc).runs).toBeDefined();
  });

  it('treats markup as text without allowHtml and grows to fit <br> lines', () => {
    expect(firstText(single([text('<b>x</b>')])).text).toBe('<b>x</b>');
    expect(firstText(single([text('<b>x</b>')])).runs).toBeUndefined();
    const grown = firstText(single([text('a<br>b<br>c', { allowHtml: true, canGrow: true, height: 5 })]));
    expect(grown.lines).toEqual(['a', 'b', 'c']);
    expect(grown.height).toBeCloseTo(3 * grown.lineHeight, 5);
  });

  it('inherits component style and lets markup override it', () => {
    const item = firstText(single([text('a<span style="color:#ff0000">b</span><u>c</u>', { allowHtml: true, style: { fontWeight: 'bold', textDecoration: 'line-through', color: '#333333' } })]));
    expect(item.runs![0]).toEqual([
      { text: 'a', bold: true, italic: false, underline: false, strike: true, color: '#333333' },
      { text: 'b', bold: true, italic: false, underline: false, strike: true, color: '#ff0000' },
      { text: 'c', bold: true, italic: false, underline: true, strike: true, color: '#333333' },
    ]);
  });

  it('validates the allowHtml flag', () => {
    const bad = tpl({ body: [{ kind: 'band', ...band(10, [text('x', { allowHtml: 'yes' as never })]) }] });
    expect(validateTemplate(bad).errors.some((e) => e.path.endsWith('allowHtml'))).toBe(true);
    const good = tpl({ body: [{ kind: 'band', ...band(10, [text('x', { allowHtml: true })]) }] });
    expect(validateTemplate(good).errors).toEqual([]);
  });
});

describe('allowHtml rendering', () => {
  it('renders runs as styled text spans in the viewer, never as HTML', () => {
    const doc = single([text('<b>bold</b> <img src=x onerror=alert(1)><i>&lt;script&gt;</i>', { allowHtml: true })]);
    const page = renderPage(doc, 0);
    const el = page.querySelector('.ar-text')!;
    expect(el.querySelector('img, script, b, i')).toBeNull();
    const spans = Array.from(el.querySelectorAll('span'));
    expect(spans.map((s) => s.textContent)).toEqual(['bold', ' ', '<script>']);
    expect(spans[0]!.style.fontWeight).toBe('bold');
    expect(spans[2]!.style.fontStyle).toBe('italic');
  });

  it('draws each run with its own font in the PDF', async () => {
    const doc = generateReport(tpl({ body: [{ kind: 'band', ...band(100, [text('plain <b>bold</b> <font color="red">red</font>', { allowHtml: true })]) }] }), {});
    const pdf = await loadPdf(await exportPdf(doc));
    const drawn = drawnTexts(pdf.getPage(0)).map((d) => d.text);
    expect(drawn).toEqual(['plain ', 'bold', 'red']);
    const all = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString()).join('\n');
    expect(all).toContain('/Helvetica-Bold');
  });

  it('justifies rich lines word by word in the PDF', async () => {
    const doc = generateReport(
      tpl({ body: [{ kind: 'band', ...band(100, [text('aa <b>bb</b> cc dd ee ff gg', { allowHtml: true, width: 40, height: 60, style: { textAlign: 'justify' } })]) }] }),
      {},
    );
    const drawn = drawnTexts((await loadPdf(await exportPdf(doc))).getPage(0)).map((d) => d.text);
    expect(drawn).toContain('bb');
    expect(drawn.every((t) => t.trim() !== '')).toBe(true);
  });

  it('writes Excel rich text', async () => {
    const doc = single([text('a <b>b</b>', { allowHtml: true })]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportExcel(doc)) as never);
    const value = wb.worksheets[0]!.getCell('A1').value as ExcelJS.CellRichTextValue;
    expect(value.richText.map((r) => [r.text, !!r.font?.bold])).toEqual([
      ['a ', false],
      ['b', true],
    ]);
  });
});
