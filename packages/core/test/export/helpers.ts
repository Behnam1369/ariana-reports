import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, type PDFPage } from 'pdf-lib';

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Builds a valid RGB PNG of the given size filled with one color. */
export function makePng(width: number, height: number, rgb: [number, number, number] = [255, 0, 0]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) raw.set(rgb, row + 1 + x * 3);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

/** Builds a minimal JPEG header (SOI, APP0, SOF0, EOI) with the given size. Enough for embedding. */
export function makeJpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

export function dataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

export const latoBytes = (): Uint8Array =>
  new Uint8Array(readFileSync(new URL('../fixtures/fonts/Lato-Regular.ttf', import.meta.url)));

/** Decoded content stream operators of a page, as text. */
export function pageContent(page: PDFPage): string {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => page.doc.context.lookup(ref)) : [contents];
  return streams
    .map((s) => {
      if (s instanceof PDFRawStream) return new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());
      return s ? String(s) : '';
    })
    .join('\n');
}

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  size: number;
}

/**
 * Extracts text drawn with standard fonts (hex strings in WinAnsi) together
 * with its text matrix position. pdf-lib emits: `/F 10 Tf ... 1 0 0 1 x y Tm <hex> Tj`.
 */
export function drawnTexts(page: PDFPage): DrawnText[] {
  const content = pageContent(page);
  const out: DrawnText[] = [];
  const re = /\/(\S+) ([\d.]+) Tf[\s\S]*?([-\d.]+) ([-\d.]+) Tm\s*<([0-9A-Fa-f]*)> Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const hex = m[5]!;
    let text = '';
    for (let i = 0; i < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    out.push({ font: m[1]!, size: Number(m[2]), x: Number(m[3]), y: Number(m[4]), text });
  }
  return out;
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false });
}
