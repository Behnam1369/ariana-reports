import type { Borders, Cell, Fill, Font, Worksheet } from 'exceljs';
import { toDate, toNumber } from '../format/format';
import type { LayoutBand, LayoutDocument, LayoutItem, LayoutText, ResolvedBorder } from '../layout/types';
import type { ValueFormat } from '../model/types';
import { parseColor, toArgb } from './color';
import { defaultImageLoader, fitImage, ImageCache, type ImageLoader } from './images';

export interface ExcelExportOptions {
  /**
   * "single" (default): one sheet with all pages flowed together; page headers,
   * page footers and repeated headers are left out so data stays contiguous.
   * "perPage": one sheet per page with every band, closer to the printed look.
   */
  sheets?: 'single' | 'perPage';
  /** Keep page header/footer bands in single-sheet mode. Defaults to false. */
  includePageBands?: boolean;
  /** Sheet name in single-sheet mode. Defaults to the report name. */
  sheetName?: string;
  /** Show Excel grid lines. Defaults to false. */
  gridLines?: boolean;
  /** Resolves image sources to bytes. Defaults to data URIs and fetch(). */
  loadImage?: ImageLoader;
  onWarning?: (message: string) => void;
  /** Workbook metadata. */
  creator?: string;
}

/** Points per Excel column width unit is not linear; this follows Excel's pixel formula. */
export function pointsToColumnWidth(points: number): number {
  const px = (points * 96) / 72;
  return Math.max(0.5, Math.round(((px - 5) / 7) * 100) / 100);
}

/** Clusters sorted coordinates that are closer than `tolerance`. */
export function clusterEdges(values: number[], tolerance: number): number[] {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1]! > tolerance) out.push(v);
  }
  return out;
}

function nearestIndex(edges: number[], value: number): number {
  let best = 0;
  for (let i = 1; i < edges.length; i++) {
    if (Math.abs(edges[i]! - value) < Math.abs(edges[best]! - value)) best = i;
  }
  return best;
}

/** Converts a date pattern ("dd/MM/yyyy HH:mm") to an Excel number format. */
export function datePatternToExcel(pattern: string): string {
  const tokens = /'(?:[^']|'')*'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|SSS|a/g;
  return pattern.replace(tokens, (t) => {
    switch (t) {
      case 'yyyy':
        return 'yyyy';
      case 'yy':
        return 'yy';
      case 'MMMM':
        return 'mmmm';
      case 'MMM':
        return 'mmm';
      case 'MM':
        return 'mm';
      case 'M':
        return 'm';
      case 'dd':
        return 'dd';
      case 'd':
        return 'd';
      case 'EEEE':
        return 'dddd';
      case 'EEE':
        return 'ddd';
      // Excel decides 12/24-hour display from the presence of AM/PM.
      case 'HH':
      case 'hh':
        return 'hh';
      case 'H':
      case 'h':
        return 'h';
      case 'mm':
        return 'mm';
      case 'm':
        return 'm';
      case 'ss':
        return 'ss';
      case 's':
        return 's';
      case 'SSS':
        return '000';
      case 'a':
        return 'AM/PM';
      default:
        return `"${t.slice(1, -1).replace(/''/g, "'").replace(/"/g, '')}"`;
    }
  });
}

function currencySymbol(currency: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

function currencyDecimals(currency: string, locale: string): number {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function decimalsPart(decimals: number): string {
  return decimals > 0 ? `.${'0'.repeat(Math.min(decimals, 20))}` : '';
}

function quoteLiteral(text: string): string {
  return text ? `"${text.replace(/"/g, '')}"` : '';
}

/** Maps a template value format to an Excel number format. */
export function excelNumberFormat(format: ValueFormat | undefined, locale = 'en-US'): string | undefined {
  if (!format) return undefined;
  switch (format.type) {
    case 'number': {
      const base = (format.thousandsSeparator === false ? '0' : '#,##0') + decimalsPart(format.decimals ?? 0);
      const body = format.decimals === undefined ? (format.thousandsSeparator === false ? 'General' : '#,##0.##########') : base;
      return `${quoteLiteral(format.prefix ?? '')}${body}${quoteLiteral(format.suffix ?? '')}`;
    }
    case 'currency': {
      const decimals = format.decimals ?? currencyDecimals(format.currency, locale);
      const symbol = currencySymbol(format.currency, locale);
      return `[$${symbol}]#,##0${decimalsPart(decimals)}`;
    }
    case 'percent':
      return `0${decimalsPart(format.decimals ?? 0)}%`;
    case 'date':
      return datePatternToExcel(format.pattern);
  }
}

/**
 * Excel stores dates without a time zone and exceljs converts JS Dates from
 * UTC. Re-express the local wall-clock time as UTC so the cell shows the same
 * date and time the report shows.
 */
export function toExcelDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()),
  );
}

export type CellValue = string | number | boolean | Date;

/** Chooses a typed cell value and number format for a text item. */
export function cellValue(item: LayoutText, locale: string): { value: CellValue; numFmt?: string } {
  if (item.error) return { value: item.text };
  const v = item.value;
  const format = item.format;
  const numFmt = excelNumberFormat(format, locale);

  if (format?.type === 'date' || v instanceof Date) {
    const d = toDate(v);
    if (d && (v instanceof Date || typeof v === 'string' || typeof v === 'number')) {
      return { value: toExcelDate(d), numFmt: numFmt ?? 'yyyy-mm-dd' };
    }
    return { value: item.text };
  }
  if (typeof v === 'boolean') return { value: v };
  if (typeof v === 'number' && Number.isFinite(v)) return numFmt ? { value: v, numFmt } : { value: v };
  if (format && typeof v === 'string') {
    const n = toNumber(v);
    if (n !== null) return { value: n, numFmt: numFmt! };
  }
  return { value: item.text };
}

const BORDER_STYLE: Record<ResolvedBorder['style'], (w: number) => 'hair' | 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'mediumDashed'> = {
  solid: (w) => (w < 0.5 ? 'hair' : w <= 1 ? 'thin' : w <= 2 ? 'medium' : 'thick'),
  dashed: (w) => (w <= 1 ? 'dashed' : 'mediumDashed'),
  dotted: () => 'dotted',
};

function argb(color: string | undefined): string | undefined {
  const c = parseColor(color);
  return c && c.a > 0 ? toArgb(c) : undefined;
}

function solidFill(color: string | undefined): Fill | undefined {
  const a = argb(color);
  return a ? { type: 'pattern', pattern: 'solid', fgColor: { argb: a } } : undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Report';
  base = base.slice(0, 31);
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const PAPER_SIZES: [number, number, number][] = [
  // [Excel paperSize id, width pt, height pt] in portrait
  [9, 595.28, 841.89], // A4
  [8, 841.89, 1190.55], // A3
  [11, 419.53, 595.28], // A5
  [1, 612, 792], // Letter
  [5, 612, 1008], // Legal
];

function paperSize(doc: LayoutDocument): number | undefined {
  const w = Math.min(doc.pageWidth, doc.pageHeight);
  const h = Math.max(doc.pageWidth, doc.pageHeight);
  return PAPER_SIZES.find(([, pw, ph]) => Math.abs(pw - w) < 2 && Math.abs(ph - h) < 2)?.[0];
}

type Workbook = import('exceljs').Workbook;

class SheetWriter {
  private readonly occupied = new Set<string>();
  private rowCursor = 1;
  private readonly colEdges: number[];

  constructor(
    private readonly workbook: Workbook,
    private readonly ws: Worksheet,
    private readonly bands: LayoutBand[],
    private readonly doc: LayoutDocument,
    private readonly images: ImageCache,
    private readonly warn: (message: string) => void,
  ) {
    const xs: number[] = [];
    for (const band of bands) {
      xs.push(band.x, band.x + band.width);
      for (const item of band.items) {
        if (item.kind === 'line') xs.push(item.x1, item.x2);
        else xs.push(item.x, item.x + item.width);
      }
    }
    if (xs.length === 0) xs.push(doc.margins.left, doc.pageWidth - doc.margins.right);
    this.colEdges = clusterEdges(xs, 1.5);
    if (this.colEdges.length === 1) this.colEdges.push(this.colEdges[0]! + 50);
  }

  async write(): Promise<void> {
    this.ws.columns = this.colEdges.slice(0, -1).map((edge, i) => ({ width: pointsToColumnWidth(this.colEdges[i + 1]! - edge) }));
    for (const band of this.bands) await this.band(band);
  }

  private colRange(x1: number, x2: number): [number, number] {
    const c1 = nearestIndex(this.colEdges, x1);
    let c2 = nearestIndex(this.colEdges, x2);
    if (c2 <= c1) c2 = Math.min(c1 + 1, this.colEdges.length - 1);
    // 1-based start, exclusive end.
    return [c1 + 1, Math.max(c1 + 2, c2 + 1)];
  }

  private async band(band: LayoutBand): Promise<void> {
    if (band.height <= 0 && band.items.length === 0) return;
    const ys = [0, band.height];
    for (const item of band.items) {
      if (item.kind === 'line') ys.push(item.y1 - band.y, item.y2 - band.y);
      else ys.push(item.y - band.y, Math.min(band.height, item.y - band.y + item.height));
    }
    const rowEdges = clusterEdges(
      ys.map((y) => Math.min(Math.max(y, 0), band.height)),
      1,
    );
    if (rowEdges.length === 1) rowEdges.push(rowEdges[0]! + Math.max(band.height, 1));
    const firstRow = this.rowCursor;
    const rowCount = rowEdges.length - 1;
    for (let i = 0; i < rowCount; i++) {
      const row = this.ws.getRow(firstRow + i);
      row.height = Math.min(409, Math.max(0.75, rowEdges[i + 1]! - rowEdges[i]!));
    }
    const rowRange = (y1: number, y2: number): [number, number] => {
      const r1 = nearestIndex(rowEdges, y1 - band.y);
      let r2 = nearestIndex(rowEdges, y2 - band.y);
      if (r2 <= r1) r2 = Math.min(r1 + 1, rowEdges.length - 1);
      return [firstRow + r1, firstRow + Math.max(r1 + 1, r2)];
    };

    const [bc1, bc2] = this.colRange(band.x, band.x + band.width);
    const bandRows: [number, number] = [firstRow, firstRow + rowCount];
    const bandFill = solidFill(band.backgroundColor);
    if (bandFill) this.fillRange(bandRows, [bc1, bc2], bandFill);

    for (const item of band.items) {
      if (item.kind === 'rectangle') {
        const rows = rowRange(item.y, item.y + item.height);
        const cols = this.colRange(item.x, item.x + item.width);
        const fill = solidFill(item.style.backgroundColor);
        if (fill) this.fillRange(rows, cols, fill);
        if (item.style.border) this.borderRange(rows, cols, item.style.border);
      }
    }
    for (const item of band.items) {
      if (item.kind === 'text') this.text(item, rowRange(item.y, item.y + item.height), this.colRange(item.x, item.x + item.width));
      else if (item.kind === 'line') this.line(item, rowEdges, firstRow, band);
      else if (item.kind === 'image') await this.image(item, rowEdges, firstRow, band);
    }
    if (band.border) this.borderRange(bandRows, [bc1, bc2], band.border);
    this.rowCursor += rowCount;
  }

  private cells(rows: [number, number], cols: [number, number]): Cell[] {
    const out: Cell[] = [];
    for (let r = rows[0]; r < rows[1]; r++) {
      for (let c = cols[0]; c < cols[1]; c++) out.push(this.ws.getCell(r, c));
    }
    return out;
  }

  private fillRange(rows: [number, number], cols: [number, number], fill: Fill): void {
    for (const cell of this.cells(rows, cols)) cell.fill = fill;
  }

  private borderRange(rows: [number, number], cols: [number, number], border: ResolvedBorder): void {
    const color = argb(border.color);
    if (!color) return;
    const edge = { style: BORDER_STYLE[border.style](border.width), color: { argb: color } };
    for (let r = rows[0]; r < rows[1]; r++) {
      for (let c = cols[0]; c < cols[1]; c++) {
        const cell = this.ws.getCell(r, c);
        const b: Partial<Borders> = { ...(cell.border ?? {}) };
        if (border.sides.includes('top') && r === rows[0]) b.top = edge;
        if (border.sides.includes('bottom') && r === rows[1] - 1) b.bottom = edge;
        if (border.sides.includes('left') && c === cols[0]) b.left = edge;
        if (border.sides.includes('right') && c === cols[1] - 1) b.right = edge;
        cell.border = b;
      }
    }
  }

  private text(item: LayoutText, rows: [number, number], cols: [number, number]): void {
    let [r1, r2] = rows;
    let [c1, c2] = cols;
    const free = (ra: number, rb: number, ca: number, cb: number) => {
      for (let r = ra; r < rb; r++) for (let c = ca; c < cb; c++) if (this.occupied.has(`${r},${c}`)) return false;
      return true;
    };
    if (!free(r1, r2, c1, c2)) {
      // Overlapping text: shrink to the first run of free columns in its range, or skip.
      let start = c1;
      while (start < c2 && !free(r1, r2, start, start + 1)) start++;
      if (start === c2) {
        this.warn(`Text "${item.text.slice(0, 30)}" overlaps another cell and was skipped`);
        return;
      }
      let end = start + 1;
      while (end < c2 && free(r1, r2, end, end + 1)) end++;
      c1 = start;
      c2 = end;
    }
    for (let r = r1; r < r2; r++) for (let c = c1; c < c2; c++) this.occupied.add(`${r},${c}`);
    if (r2 - r1 > 1 || c2 - c1 > 1) this.ws.mergeCells(r1, c1, r2 - 1, c2 - 1);

    const cell = this.ws.getCell(r1, c1);
    const { value, numFmt } = cellValue(item, this.doc.locale);
    cell.value = value;
    if (numFmt) cell.numFmt = numFmt;

    const s = item.style;
    const font: Partial<Font> = {
      name: (s.fontFamily.split(',')[0] ?? s.fontFamily).trim().replace(/^["']|["']$/g, ''),
      size: s.fontSize,
      bold: s.fontWeight === 'bold',
      italic: s.fontStyle === 'italic',
    };
    if (s.textDecoration === 'underline') font.underline = true;
    if (s.textDecoration === 'line-through') font.strike = true;
    const color = argb(s.color);
    if (color) font.color = { argb: color };
    cell.font = font;
    cell.alignment = {
      horizontal: s.textAlign === 'justify' ? 'justify' : s.textAlign,
      vertical: s.verticalAlign,
      wrapText: item.lines.length > 1 || item.text.includes('\n'),
    };
    const fill = solidFill(s.backgroundColor);
    if (fill) this.fillRange([r1, r2], [c1, c2], fill);
    if (s.border) this.borderRange([r1, r2], [c1, c2], s.border);
  }

  /** Lines become cell borders: horizontal lines on the nearest row edge, vertical on the nearest column edge. */
  private line(item: Extract<LayoutItem, { kind: 'line' }>, rowEdges: number[], firstRow: number, band: LayoutBand): void {
    const border: ResolvedBorder = { width: item.lineWidth, color: item.color, style: item.lineStyle, sides: [] };
    if (item.y1 === item.y2) {
      const cols = this.colRange(Math.min(item.x1, item.x2), Math.max(item.x1, item.x2));
      const idx = nearestIndex(rowEdges, item.y1 - band.y);
      const lastRow = rowEdges.length - 2;
      if (idx <= lastRow) this.borderRange([firstRow + idx, firstRow + idx + 1], cols, { ...border, sides: ['top'] });
      else this.borderRange([firstRow + lastRow, firstRow + lastRow + 1], cols, { ...border, sides: ['bottom'] });
    } else {
      const ci = nearestIndex(this.colEdges, item.x1);
      const rows: [number, number] = [firstRow, firstRow + rowEdges.length - 1];
      const lastCol = this.colEdges.length - 2;
      if (ci <= lastCol) this.borderRange(rows, [ci + 1, ci + 2], { ...border, sides: ['left'] });
      else this.borderRange(rows, [lastCol + 1, lastCol + 2], { ...border, sides: ['right'] });
    }
  }

  private fractional(edges: number[], value: number): number {
    for (let i = 0; i < edges.length - 1; i++) {
      if (value <= edges[i + 1]! || i === edges.length - 2) {
        const span = edges[i + 1]! - edges[i]!;
        return i + (span > 0 ? Math.min(1, Math.max(0, (value - edges[i]!) / span)) : 0);
      }
    }
    return 0;
  }

  private async image(
    item: Extract<LayoutItem, { kind: 'image' }>,
    rowEdges: number[],
    firstRow: number,
    band: LayoutBand,
  ): Promise<void> {
    if (!item.src) return;
    const img = await this.images.get(item.src);
    if (!img) return;
    const size = imageSize(img.bytes, img.type);
    const box = fitImage(item, size?.width ?? 0, size?.height ?? 0, item.fit === 'cover' ? 'contain' : item.fit);
    const id = this.workbook.addImage({ base64: bytesToBase64(img.bytes), extension: img.type });
    const col = this.fractional(this.colEdges, box.x);
    const row = firstRow - 1 + this.fractional(rowEdges, box.y - band.y);
    this.ws.addImage(id, {
      tl: { col, row } as never,
      ext: { width: (box.width * 96) / 72, height: (box.height * 96) / 72 },
      editAs: 'oneCell',
    });
  }
}

/** Reads the pixel size of a PNG or JPEG. */
export function imageSize(bytes: Uint8Array, type: 'png' | 'jpeg'): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'png') {
    if (bytes.length < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = view.getUint16(offset + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

async function loadExcelJs(): Promise<typeof import('exceljs')> {
  const mod = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs');
  return mod.default ?? mod;
}

function configureSheet(ws: Worksheet, doc: LayoutDocument, gridLines: boolean): void {
  ws.views = [{ showGridLines: gridLines }];
  const size = paperSize(doc);
  ws.pageSetup = {
    orientation: doc.pageWidth > doc.pageHeight ? 'landscape' : 'portrait',
    ...(size !== undefined ? { paperSize: size as never } : {}),
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      top: doc.margins.top / 72,
      bottom: doc.margins.bottom / 72,
      left: doc.margins.left / 72,
      right: doc.margins.right / 72,
      header: 0.3,
      footer: 0.3,
    },
  };
}

/** Renders a layout document to .xlsx bytes. exceljs is loaded on first use. */
export async function exportExcel(doc: LayoutDocument, options: ExcelExportOptions = {}): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.creator ?? 'ariana-report';
  workbook.title = doc.name;
  const warn = options.onWarning ?? (() => {});
  const images = new ImageCache(options.loadImage ?? defaultImageLoader, warn);
  const used = new Set<string>();
  const gridLines = options.gridLines ?? false;

  const sheets: { name: string; bands: LayoutBand[] }[] =
    options.sheets === 'perPage'
      ? doc.pages.map((p) => ({ name: `Page ${p.number}`, bands: p.bands }))
      : [
          {
            name: options.sheetName ?? doc.name,
            bands: doc.pages.flatMap((p) =>
              p.bands.filter(
                (b) =>
                  !b.repeated && (options.includePageBands || (b.role !== 'pageHeader' && b.role !== 'pageFooter')),
              ),
            ),
          },
        ];

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sanitizeSheetName(sheet.name, used));
    configureSheet(ws, doc, gridLines);
    const writer = new SheetWriter(workbook, ws, sheet.bands, doc, images, warn);
    await writer.write();
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
