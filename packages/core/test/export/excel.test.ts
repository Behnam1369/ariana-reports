import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import {
  cellValue,
  clusterEdges,
  datePatternToExcel,
  excelNumberFormat,
  exportExcel,
  generateReport,
  imageSize,
  pointsToColumnWidth,
  sanitizeSheetName,
  toExcelDate,
  type LayoutDocument,
  type LayoutText,
} from '../../src';
import type { ReportComponent, ReportTemplate } from '../../src/model/types';
import { invoiceTemplate } from '../fixtures/invoice';
import { band, region, text, tpl } from '../layout/helpers';
import { dataUri, makeJpeg, makePng } from './helpers';

async function load(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as never);
  return wb;
}

const ws = (wb: ExcelJS.Workbook, i = 0) => wb.worksheets[i]!;

/** Non-empty cell values of a sheet, row by row. */
function values(sheet: ExcelJS.Worksheet): unknown[][] {
  const out: unknown[][] = [];
  sheet.eachRow((row) => {
    const vals: unknown[] = [];
    row.eachCell((cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '' && !cell.isMerged) vals.push(cell.value);
      else if (cell.isMerged && cell.master === cell && cell.value !== null) vals.push(cell.value);
    });
    if (vals.length) out.push(vals);
  });
  return out;
}

const textItem = (value: unknown, extra: Partial<LayoutText> = {}): LayoutText => ({
  kind: 'text',
  componentId: 'c',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style: {} as never,
  text: String(value),
  lines: [String(value)],
  lineHeight: 12,
  value,
  ...extra,
});

describe('helpers', () => {
  it('clusterEdges merges close coordinates', () => {
    expect(clusterEdges([10, 10.5, 50, 49.2, 100, Number.NaN], 1.5)).toEqual([10, 49.2, 100]);
    expect(clusterEdges([], 1)).toEqual([]);
  });

  it('pointsToColumnWidth follows the Excel pixel formula', () => {
    expect(pointsToColumnWidth(48)).toBeCloseTo(8.43, 1); // 64 px = default column
    expect(pointsToColumnWidth(0)).toBe(0.5);
  });

  it.each([
    ['yyyy-MM-dd', 'yyyy-mm-dd'],
    ['dd/MM/yy HH:mm:ss', 'dd/mm/yy hh:mm:ss'],
    ['EEEE, MMMM d', 'dddd, mmmm d'],
    ['EEE MMM', 'ddd mmm'],
    ['h:mm a', 'h:mm AM/PM'],
    ["'Week of' d", '"Week of" d'],
    ['HH:mm:ss.SSS', 'hh:mm:ss.000'],
    ['M/d/yyyy H:m:s', 'm/d/yyyy h:m:s'],
  ])('datePatternToExcel(%s) = %s', (pattern, expected) => {
    expect(datePatternToExcel(pattern)).toBe(expected);
  });

  it('maps value formats to Excel number formats', () => {
    expect(excelNumberFormat(undefined)).toBeUndefined();
    expect(excelNumberFormat({ type: 'number', decimals: 2 })).toBe('#,##0.00');
    expect(excelNumberFormat({ type: 'number', decimals: 0, thousandsSeparator: false })).toBe('0');
    expect(excelNumberFormat({ type: 'number' })).toBe('#,##0.##########');
    expect(excelNumberFormat({ type: 'number', thousandsSeparator: false })).toBe('General');
    expect(excelNumberFormat({ type: 'number', decimals: 1, prefix: '~', suffix: ' kg' })).toBe('"~"#,##0.0" kg"');
    expect(excelNumberFormat({ type: 'currency', currency: 'USD' })).toBe('[$$]#,##0.00');
    expect(excelNumberFormat({ type: 'currency', currency: 'EUR', decimals: 0 })).toBe('[$€]#,##0');
    expect(excelNumberFormat({ type: 'currency', currency: 'JPY' })).toBe('[$¥]#,##0');
    expect(excelNumberFormat({ type: 'percent', decimals: 1 })).toBe('0.0%');
    expect(excelNumberFormat({ type: 'date', pattern: 'dd.MM.yyyy' })).toBe('dd.mm.yyyy');
  });

  it('toExcelDate keeps the local wall-clock time', () => {
    const d = toExcelDate(new Date(2026, 2, 5, 14, 30));
    expect(d.toISOString()).toBe('2026-03-05T14:30:00.000Z');
  });

  it('sanitizeSheetName removes invalid characters, truncates and de-duplicates', () => {
    const used = new Set<string>();
    expect(sanitizeSheetName('Sales [Q1]: a/b', used)).toBe('Sales  Q1   a b');
    expect(sanitizeSheetName('x'.repeat(40), used)).toHaveLength(31);
    expect(sanitizeSheetName('Report', used)).toBe('Report');
    expect(sanitizeSheetName('report', used)).toBe('report (2)');
    expect(sanitizeSheetName("''", used)).toBe('Report (3)');
  });

  it('imageSize reads PNG and JPEG dimensions', () => {
    expect(imageSize(makePng(7, 3), 'png')).toEqual({ width: 7, height: 3 });
    expect(imageSize(makeJpeg(640, 480), 'jpeg')).toEqual({ width: 640, height: 480 });
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]), 'jpeg')).toBeNull();
    expect(imageSize(new Uint8Array(4), 'png')).toBeNull();
  });
});

describe('cellValue', () => {
  it('keeps numbers numeric with their format', () => {
    expect(cellValue(textItem(12.5, { format: { type: 'currency', currency: 'USD' } }), 'en-US')).toEqual({
      value: 12.5,
      numFmt: '[$$]#,##0.00',
    });
    expect(cellValue(textItem(3), 'en-US')).toEqual({ value: 3 });
  });

  it('turns numeric strings into numbers when a format is set', () => {
    expect(cellValue(textItem('42.5', { format: { type: 'number', decimals: 1 } }), 'en-US')).toEqual({ value: 42.5, numFmt: '#,##0.0' });
    expect(cellValue(textItem('42.5'), 'en-US')).toEqual({ value: '42.5' });
  });

  it('turns dates and ISO strings with date formats into dates', () => {
    const r = cellValue(textItem('2026-03-05', { format: { type: 'date', pattern: 'dd/MM/yyyy' } }), 'en-US');
    expect(r.numFmt).toBe('dd/mm/yyyy');
    expect((r.value as Date).toISOString()).toBe('2026-03-05T00:00:00.000Z');
    const d = cellValue(textItem(new Date(2026, 0, 2)), 'en-US');
    expect(d.numFmt).toBe('yyyy-mm-dd');
    expect(cellValue(textItem('nope', { format: { type: 'date', pattern: 'yyyy' } }), 'en-US')).toEqual({ value: 'nope' });
  });

  it('keeps booleans and falls back to text', () => {
    expect(cellValue(textItem(true), 'en-US')).toEqual({ value: true });
    expect(cellValue(textItem({ a: 1 }, { text: '{"a":1}' }), 'en-US')).toEqual({ value: '{"a":1}' });
    expect(cellValue(textItem(Number.NaN, { text: '' }), 'en-US')).toEqual({ value: '' });
    expect(cellValue(textItem('#ERROR', { error: true }), 'en-US')).toEqual({ value: '#ERROR' });
  });
});

describe('exportExcel: grid', () => {
  const tableTemplate = (): ReportTemplate =>
    tpl({
      pageHeader: band(10, [text('Page {{ page.number }}')]),
      pageFooter: band(10, [text('Footer')]),
      body: [
        region({
          repeatHeaderOnEachPage: true,
          header: band(15, [
            text('Name', { x: 0, width: 100, height: 15, style: { fontWeight: 'bold', backgroundColor: '#eeeeee' } }),
            text('Amount', { x: 100, width: 80, height: 15, style: { textAlign: 'right' } }),
          ]),
          detail: band(20, [
            text('{{ row.name }}', { x: 0, width: 100, height: 20 }),
            text('{{ row.amount }}', { x: 100, width: 80, height: 20, format: { type: 'number', decimals: 2 }, style: { textAlign: 'right' } }),
          ]),
          footer: band(20, [text('{{ sum(rows, "amount") }}', { x: 100, width: 80, height: 20, format: { type: 'currency', currency: 'USD' } })]),
        }),
      ],
    });
  const data = { items: Array.from({ length: 25 }, (_, i) => ({ name: `Item ${i + 1}`, amount: (i + 1) * 1.5 })) };

  it('flows all pages into one sheet without page bands or repeated headers', async () => {
    const doc = generateReport(tableTemplate(), data);
    expect(doc.pages.length).toBeGreaterThan(1);
    const wb = await load(await exportExcel(doc));
    expect(wb.worksheets).toHaveLength(1);
    expect(ws(wb).name).toBe('Test');
    const rows = values(ws(wb));
    expect(rows[0]).toEqual(['Name', 'Amount']);
    expect(rows).toHaveLength(1 + 25 + 1);
    expect(rows[1]).toEqual(['Item 1', 1.5]);
    expect(rows[25]).toEqual(['Item 25', 37.5]);
    expect(rows[26]).toEqual([487.5]);
    expect(rows.flat()).not.toContain('Footer');
  });

  it('builds columns from item edges and sizes rows from band heights', async () => {
    const wb = await load(await exportExcel(generateReport(tableTemplate(), data)));
    const sheet = ws(wb);
    expect(sheet.columns).toHaveLength(2);
    expect(sheet.getColumn(1).width).toBeCloseTo(pointsToColumnWidth(100), 2);
    expect(sheet.getColumn(2).width).toBeCloseTo(pointsToColumnWidth(80), 2);
    expect(sheet.getRow(1).height).toBe(15);
    expect(sheet.getRow(2).height).toBe(20);
  });

  it('writes typed values, number formats and styles', async () => {
    const wb = await load(await exportExcel(generateReport(tableTemplate(), data)));
    const sheet = ws(wb);
    const header = sheet.getCell(1, 1);
    expect(header.font).toMatchObject({ bold: true, size: 10, name: 'Helvetica' });
    expect(header.fill).toMatchObject({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } });
    expect(sheet.getCell(1, 2).alignment).toMatchObject({ horizontal: 'right', vertical: 'top' });
    const amount = sheet.getCell(2, 2);
    expect(amount.value).toBe(1.5);
    expect(amount.numFmt).toBe('#,##0.00');
    expect(sheet.getCell(27, 2).numFmt).toBe('[$$]#,##0.00');
    expect(sheet.views[0]).toMatchObject({ showGridLines: false });
  });

  it('sets the reading order of right-to-left and explicitly left-to-right text', async () => {
    const t = tpl({
      body: [
        {
          kind: 'band',
          ...band(30, [
            text('سلام', { x: 0, width: 60, height: 10 }),
            text('Hello', { x: 60, width: 60, height: 10 }),
            text('سلام', { x: 120, width: 60, height: 10, style: { direction: 'ltr' } }),
          ]),
        },
      ],
    });
    const sheet = ws(await load(await exportExcel(generateReport(t, {}))));
    expect(sheet.getCell(1, 1).alignment).toMatchObject({ readingOrder: 'rtl', horizontal: 'right' });
    expect(sheet.getCell(1, 2).alignment.readingOrder).toBeUndefined();
    expect(sheet.getCell(1, 3).alignment).toMatchObject({ readingOrder: 'ltr', horizontal: 'left' });
  });

  it('can keep page bands', async () => {
    const wb = await load(await exportExcel(generateReport(tableTemplate(), data), { includePageBands: true }));
    const flat = values(ws(wb)).flat();
    expect(flat).toContain('Page 1');
    expect(flat).toContain('Footer');
  });

  it('writes one sheet per page with every band in perPage mode', async () => {
    const doc = generateReport(tableTemplate(), data);
    const wb = await load(await exportExcel(doc, { sheets: 'perPage' }));
    expect(wb.worksheets.map((s) => s.name)).toEqual(doc.pages.map((p) => `Page ${p.number}`));
    const second = values(ws(wb, 1));
    expect(second[0]).toEqual(['Page 2']);
    expect(second[1]).toEqual(['Name', 'Amount']);
    expect(second.at(-1)).toEqual(['Footer']);
  });

  it('merges cells for items that span several columns or rows', async () => {
    const t = tpl({
      body: [
        {
          kind: 'band',
          ...band(40, [
            text('Wide', { x: 0, y: 0, width: 180, height: 20 }),
            text('A', { x: 0, y: 20, width: 90, height: 20 }),
            text('B', { x: 90, y: 20, width: 90, height: 20 }),
          ]),
        },
      ],
    });
    const sheet = ws(await load(await exportExcel(generateReport(t, {}))));
    expect(sheet.getCell('A1').value).toBe('Wide');
    expect(sheet.getCell('B1').isMerged).toBe(true);
    expect(sheet.getCell('B1').master.address).toBe('A1');
    expect(sheet.getCell('A2').value).toBe('A');
    expect(sheet.getCell('B2').value).toBe('B');
  });

  it('enables wrapping for multi-line text', async () => {
    const t = tpl({ body: [{ kind: 'band', ...band(50, [text('a very long piece of text that wraps', { width: 40, canGrow: true })]) }] });
    const sheet = ws(await load(await exportExcel(generateReport(t, {}))));
    expect(sheet.getCell('A1').alignment).toMatchObject({ wrapText: true });
  });

  it('shrinks overlapping items to free columns and warns when none are left', async () => {
    const onWarning = vi.fn();
    const t = tpl({
      body: [
        {
          kind: 'band',
          ...band(20, [
            text('first', { x: 0, width: 100, height: 20 }),
            text('second', { x: 50, width: 130, height: 20 }),
            text('third', { x: 0, width: 50, height: 20 }),
          ]),
        },
      ],
    });
    const sheet = ws(await load(await exportExcel(generateReport(t, {}), { onWarning })));
    expect(sheet.getCell('A1').value).toBe('first');
    expect(sheet.getCell('B1').isMerged).toBe(true);
    expect(sheet.getCell('C1').value).toBe('second');
    expect(onWarning).toHaveBeenCalledWith(expect.stringMatching(/"third" overlaps/));
  });

  it('turns lines, rectangles and band styles into borders and fills', async () => {
    const t = tpl({
      body: [
        {
          kind: 'band',
          ...band(20, [text('x', { x: 0, width: 90, height: 20 }), text('y', { x: 90, width: 90, height: 20 })], {
            style: { backgroundColor: '#ffff00', border: { width: 2, color: '#ff0000', style: 'solid', sides: ['top'] } },
          }),
        },
        {
          kind: 'band',
          ...band(20, [
            { id: 'r', type: 'rectangle', x: 0, y: 0, width: 90, height: 20, style: { backgroundColor: '#00ff00', border: { width: 1, color: '#000', style: 'dashed' } } },
            { id: 'l', type: 'line', orientation: 'horizontal', x: 0, y: 20, width: 180, height: 0, style: { border: { width: 0.25, color: '#0000ff', style: 'solid' } } },
          ]),
        },
      ],
    });
    const sheet = ws(await load(await exportExcel(generateReport(t, {}))));
    expect(sheet.getCell('A1').fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
    expect(sheet.getCell('B1').fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
    expect(sheet.getCell('A1').border.top).toMatchObject({ style: 'medium', color: { argb: 'FFFF0000' } });
    expect(sheet.getCell('A2').fill).toMatchObject({ fgColor: { argb: 'FF00FF00' } });
    expect(sheet.getCell('A2').border).toMatchObject({ top: { style: 'dashed' }, left: { style: 'dashed' }, right: { style: 'dashed' } });
    expect(sheet.getCell('A2').border.bottom).toMatchObject({ style: 'hair', color: { argb: 'FF0000FF' } });
    expect(sheet.getCell('B2').border.bottom).toMatchObject({ style: 'hair' });
  });

  it('applies page setup from the layout', async () => {
    const t = tpl({ unit: 'mm', page: { size: 'A4', orientation: 'landscape', margins: { top: 25.4, right: 12.7, bottom: 25.4, left: 12.7 } } });
    const sheet = ws(await load(await exportExcel(generateReport(t, {}))));
    expect(sheet.pageSetup).toMatchObject({ orientation: 'landscape', paperSize: 9, fitToPage: true });
    expect(sheet.pageSetup.margins!.top).toBeCloseTo(1, 5);
    expect(sheet.pageSetup.margins!.left).toBeCloseTo(0.5, 5);
  });

  it('uses a custom sheet name and workbook creator', async () => {
    const wb = await load(await exportExcel(generateReport(tpl(), {}), { sheetName: 'Data', creator: 'Me' }));
    expect(ws(wb).name).toBe('Data');
    expect(wb.creator).toBe('Me');
  });

  it('exports an empty report', async () => {
    const wb = await load(await exportExcel(generateReport(tpl(), {})));
    expect(wb.worksheets).toHaveLength(1);
  });
});

describe('exportExcel: images', () => {
  const image = (src: string, extra: Partial<Extract<ReportComponent, { type: 'image' }>> = {}): ReportComponent => ({
    id: `img${Math.random()}`,
    type: 'image',
    x: 0,
    y: 0,
    width: 60,
    height: 30,
    src,
    ...extra,
  });

  it('embeds PNG and JPEG images anchored to their position', async () => {
    const t = tpl({
      body: [
        {
          kind: 'band',
          ...band(40, [image(dataUri(makePng(2, 1), 'image/png')), image(dataUri(makeJpeg(4, 4), 'image/jpeg'), { x: 90 })]),
        },
      ],
    });
    const wb = await load(await exportExcel(generateReport(t, {})));
    const imgs = ws(wb).getImages();
    expect(imgs).toHaveLength(2);
    expect(imgs[0]!.range.tl.nativeCol).toBe(0);
    expect(imgs[1]!.range.tl.col).toBeGreaterThan(0);
  });

  it('skips images that cannot be loaded and warns', async () => {
    const onWarning = vi.fn();
    const t = tpl({ body: [{ kind: 'band', ...band(40, [image('x.png')]) }] });
    const wb = await load(
      await exportExcel(generateReport(t, {}), {
        onWarning,
        loadImage: async () => {
          throw new Error('nope');
        },
      }),
    );
    expect(ws(wb).getImages()).toHaveLength(0);
    expect(onWarning).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded: nope/));
  });
});

describe('exportExcel: full report', () => {
  it('exports the grouped sample report', async () => {
    const orders = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      customer: ['A', 'B'][i % 2],
      date: '2026-01-01',
      total: 100 + i,
      items: [{ sku: `S${i}`, qty: 2 }],
    }));
    const doc: LayoutDocument = generateReport(invoiceTemplate(), { sales: { orders } }, { params: { title: 'Orders' } });
    const sheet = ws(await load(await exportExcel(doc)));
    const flat = values(sheet).flat();
    expect(flat[0]).toBe('Orders');
    expect(flat).toContain('A');
    expect(flat).toContain('B');
    expect(flat).toContain('S0 x 2');
    const totals = flat.filter((v): v is number => typeof v === 'number');
    // Every order total, both customer totals and the grand total are numeric cells.
    const grand = orders.reduce((s, o) => s + o.total, 0);
    expect(totals).toContain(grand);
    expect(totals.filter((v) => v >= 100 && v < 140)).toHaveLength(40);
  });
});
