import { Encodings } from '@pdf-lib/standard-fonts';
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type {
  LayoutBand,
  LayoutDocument,
  LayoutImage,
  LayoutItem,
  LayoutLine,
  LayoutText,
  ResolvedBorder,
  ResolvedStyle,
} from '../layout/types';
import { standardFontName } from '../layout/text';
import { parseColor } from './color';
import { defaultImageLoader, fitImage, ImageCache, type ImageLoader } from './images';

type PdfLib = typeof import('pdf-lib');

/** A TrueType/OpenType font to embed, e.g. for non-Latin scripts. */
export interface FontRegistration {
  /** Family name as used in template styles, e.g. "Vazirmatn". */
  family: string;
  bold?: boolean;
  italic?: boolean;
  /** Raw .ttf/.otf bytes. */
  data: Uint8Array | ArrayBuffer;
}

export interface PdfExportOptions {
  /** Custom fonts; templates select them through `fontFamily`. */
  fonts?: FontRegistration[];
  /** Resolves image sources to bytes. Defaults to data URIs and fetch(). */
  loadImage?: ImageLoader;
  /** Called for skipped images and other non-fatal problems. */
  onWarning?: (message: string) => void;
  /** Document metadata. The title defaults to the report name. */
  title?: string;
  author?: string;
  subject?: string;
}

interface ResolvedFont {
  font: PDFFont;
  /** Standard fonts only encode WinAnsi; text must be sanitised. */
  standard: boolean;
}

class FontManager {
  private readonly cache = new Map<string, Promise<ResolvedFont>>();
  private fontkitRegistered = false;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: FontRegistration[],
  ) {}

  get(style: ResolvedStyle): Promise<ResolvedFont> {
    const bold = style.fontWeight === 'bold';
    const italic = style.fontStyle === 'italic';
    const key = `${style.fontFamily}|${bold}|${italic}`;
    let hit = this.cache.get(key);
    if (!hit) {
      hit = this.resolve(style.fontFamily, bold, italic);
      this.cache.set(key, hit);
    }
    return hit;
  }

  private findCustom(family: string, bold: boolean, italic: boolean): FontRegistration | undefined {
    const name = (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
    const sameFamily = this.fonts.filter((f) => f.family.toLowerCase() === name);
    return (
      sameFamily.find((f) => !!f.bold === bold && !!f.italic === italic) ??
      sameFamily.find((f) => !!f.bold === bold) ??
      sameFamily.find((f) => !f.bold && !f.italic) ??
      sameFamily[0]
    );
  }

  private async resolve(family: string, bold: boolean, italic: boolean): Promise<ResolvedFont> {
    const custom = this.findCustom(family, bold, italic);
    if (custom) {
      if (!this.fontkitRegistered) {
        type Fontkit = Parameters<PDFDocument['registerFontkit']>[0];
        const mod = (await import('@pdf-lib/fontkit')) as unknown as { default?: Fontkit } & Fontkit;
        this.pdf.registerFontkit(mod.default ?? mod);
        this.fontkitRegistered = true;
      }
      const bytes = custom.data instanceof Uint8Array ? custom.data : new Uint8Array(custom.data);
      return { font: await this.pdf.embedFont(bytes, { subset: true }), standard: false };
    }
    return { font: await this.pdf.embedFont(standardFontName(family, bold, italic)), standard: true };
  }
}

/** Replaces characters the standard fonts cannot encode. */
export function sanitizeForStandardFont(text: string): string {
  let out = '';
  for (const ch of text.replace(/\t/g, '    ')) {
    out += Encodings.WinAnsi.canEncodeUnicodeCodePoint(ch.codePointAt(0)!) ? ch : '?';
  }
  return out;
}

function dashArray(style: ResolvedBorder['style'], width: number): number[] | undefined {
  if (style === 'dashed') return [Math.max(2, width * 3), Math.max(2, width * 2)];
  if (style === 'dotted') return [Math.max(0.5, width), Math.max(1, width * 1.5)];
  return undefined;
}

class PdfRenderer {
  private readonly images: ImageCache;
  private readonly embedded = new Map<string, Promise<PDFImage | null>>();
  private readonly fonts: FontManager;
  private page!: PDFPage;

  constructor(
    private readonly lib: PdfLib,
    private readonly pdf: PDFDocument,
    private readonly doc: LayoutDocument,
    private readonly options: PdfExportOptions,
  ) {
    const warn = options.onWarning ?? (() => {});
    this.images = new ImageCache(options.loadImage ?? defaultImageLoader, warn);
    this.fonts = new FontManager(pdf, options.fonts ?? []);
  }

  /** Converts a top-down y coordinate to PDF's bottom-up coordinates. */
  private flipY(y: number): number {
    return this.doc.pageHeight - y;
  }

  private color(value: string | undefined) {
    const c = parseColor(value);
    if (!c || c.a === 0) return null;
    return { color: this.lib.rgb(c.r / 255, c.g / 255, c.b / 255), opacity: c.a };
  }

  async render(): Promise<void> {
    for (const page of this.doc.pages) {
      this.page = this.pdf.addPage([this.doc.pageWidth, this.doc.pageHeight]);
      for (const band of page.bands) await this.band(band);
    }
  }

  private async band(band: LayoutBand): Promise<void> {
    this.box(band.x, band.y, band.width, band.height, band.backgroundColor, band.border);
    for (const item of band.items) await this.item(item);
  }

  private async item(item: LayoutItem): Promise<void> {
    switch (item.kind) {
      case 'text':
        return this.text(item);
      case 'image':
        return this.image(item);
      case 'line':
        return this.line(item);
      case 'rectangle':
        this.box(item.x, item.y, item.width, item.height, item.style.backgroundColor, item.style.border, item.cornerRadius);
        return;
    }
  }

  /** Fills and strokes a box given in top-down coordinates. */
  private box(
    x: number,
    y: number,
    width: number,
    height: number,
    background: string | undefined,
    border: ResolvedBorder | undefined,
    radius = 0,
  ): void {
    const fill = this.color(background);
    const r = Math.min(radius, width / 2, height / 2);
    if (r > 0) {
      const stroke = border && border.sides.length === 4 ? this.color(border.color) : null;
      if (!fill && !stroke) return;
      const path =
        `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} ` +
        `A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
      this.page.drawSvgPath(path, {
        x,
        y: this.flipY(y),
        ...(fill ? { color: fill.color, opacity: fill.opacity } : {}),
        ...(stroke && border
          ? {
              borderColor: stroke.color,
              borderOpacity: stroke.opacity,
              borderWidth: border.width,
              ...(dashArray(border.style, border.width) ? { borderDashArray: dashArray(border.style, border.width)! } : {}),
            }
          : {}),
      });
      return;
    }
    if (fill) {
      this.page.drawRectangle({ x, y: this.flipY(y + height), width, height, color: fill.color, opacity: fill.opacity });
    }
    if (border) this.borderSides(x, y, width, height, border);
  }

  private borderSides(x: number, y: number, width: number, height: number, border: ResolvedBorder): void {
    const stroke = this.color(border.color);
    if (!stroke) return;
    const segments: Record<string, [number, number, number, number]> = {
      top: [x, y, x + width, y],
      right: [x + width, y, x + width, y + height],
      bottom: [x, y + height, x + width, y + height],
      left: [x, y, x, y + height],
    };
    const dash = dashArray(border.style, border.width);
    for (const side of border.sides) {
      const [x1, y1, x2, y2] = segments[side]!;
      this.page.drawLine({
        start: { x: x1, y: this.flipY(y1) },
        end: { x: x2, y: this.flipY(y2) },
        thickness: border.width,
        color: stroke.color,
        opacity: stroke.opacity,
        // Square caps close the corners of solid borders.
        lineCap: dash ? this.lib.LineCapStyle.Butt : this.lib.LineCapStyle.Projecting,
        ...(dash ? { dashArray: dash } : {}),
      });
    }
  }

  private line(item: LayoutLine): void {
    const stroke = this.color(item.color);
    if (!stroke || item.lineWidth <= 0) return;
    const dash = dashArray(item.lineStyle, item.lineWidth);
    this.page.drawLine({
      start: { x: item.x1, y: this.flipY(item.y1) },
      end: { x: item.x2, y: this.flipY(item.y2) },
      thickness: item.lineWidth,
      color: stroke.color,
      opacity: stroke.opacity,
      ...(dash ? { dashArray: dash } : {}),
    });
  }

  private clip(x: number, y: number, width: number, height: number): void {
    const { pushGraphicsState, rectangle, clip, endPath } = this.lib;
    this.page.pushOperators(pushGraphicsState(), rectangle(x, this.flipY(y + height), width, height), clip(), endPath());
  }

  private unclip(): void {
    this.page.pushOperators(this.lib.popGraphicsState());
  }

  private async text(item: LayoutText): Promise<void> {
    const { style } = item;
    this.box(item.x, item.y, item.width, item.height, style.backgroundColor, style.border);
    const fill = this.color(style.color);
    if (!fill || item.lines.every((l) => l === '')) return;

    const { font, standard } = await this.fonts.get(style);
    const size = style.fontSize;
    const lh = item.lineHeight;
    const pad = style.padding;
    const contentX = item.x + pad.left;
    const contentWidth = Math.max(0, item.width - pad.left - pad.right);
    const contentTop = item.y + pad.top;
    const available = item.height - pad.top - pad.bottom;
    const textHeight = item.lines.length * lh;
    const offset =
      style.verticalAlign === 'middle' ? (available - textHeight) / 2 : style.verticalAlign === 'bottom' ? available - textHeight : 0;
    // Center the font's ascent+descent box inside the line box, as CSS does.
    const full = font.heightAtSize(size);
    const ascent = font.heightAtSize(size, { descender: false });

    this.clip(item.x, item.y, item.width, item.height);
    try {
      item.lines.forEach((rawLine, i) => {
        const line = standard ? sanitizeForStandardFont(rawLine) : rawLine;
        if (line === '') return;
        const baseline = contentTop + offset + i * lh + (lh - full) / 2 + ascent;
        const y = this.flipY(baseline);
        const lineWidth = font.widthOfTextAtSize(line, size);
        const isLast = i === item.lines.length - 1;

        if (style.textAlign === 'justify' && !isLast && /\S\s+\S/.test(line)) {
          this.justified(line, contentX, y, contentWidth, font, size, fill);
          this.decoration(style, contentX, baseline, contentWidth, fill);
        } else {
          let x = contentX;
          if (style.textAlign === 'center') x += (contentWidth - lineWidth) / 2;
          else if (style.textAlign === 'right') x += contentWidth - lineWidth;
          this.page.drawText(line, { x, y, size, font, color: fill.color, opacity: fill.opacity });
          this.decoration(style, x, baseline, lineWidth, fill);
        }
      });
    } finally {
      this.unclip();
    }
  }

  private justified(
    line: string,
    x: number,
    y: number,
    width: number,
    font: PDFFont,
    size: number,
    fill: { color: ReturnType<PdfLib['rgb']>; opacity: number },
  ): void {
    const words = line.trim().split(/\s+/);
    const wordsWidth = words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, size), 0);
    const gap = (width - wordsWidth) / (words.length - 1);
    let cursor = x;
    for (const word of words) {
      this.page.drawText(word, { x: cursor, y, size, font, color: fill.color, opacity: fill.opacity });
      cursor += font.widthOfTextAtSize(word, size) + gap;
    }
  }

  private decoration(
    style: ResolvedStyle,
    x: number,
    baseline: number,
    width: number,
    fill: { color: ReturnType<PdfLib['rgb']>; opacity: number },
  ): void {
    if (style.textDecoration === 'none' || width <= 0) return;
    const size = style.fontSize;
    const yTop = style.textDecoration === 'underline' ? baseline + size * 0.12 : baseline - size * 0.3;
    this.page.drawLine({
      start: { x, y: this.flipY(yTop) },
      end: { x: x + width, y: this.flipY(yTop) },
      thickness: Math.max(0.5, size * 0.06),
      color: fill.color,
      opacity: fill.opacity,
    });
  }

  private embed(src: string): Promise<PDFImage | null> {
    let hit = this.embedded.get(src);
    if (!hit) {
      hit = this.images.get(src).then(async (img) => {
        if (!img) return null;
        try {
          return img.type === 'png' ? await this.pdf.embedPng(img.bytes) : await this.pdf.embedJpg(img.bytes);
        } catch (err) {
          this.options.onWarning?.(`Image could not be embedded: ${(err as Error).message}`);
          return null;
        }
      });
      this.embedded.set(src, hit);
    }
    return hit;
  }

  private async image(item: LayoutImage): Promise<void> {
    this.box(item.x, item.y, item.width, item.height, item.style.backgroundColor, undefined);
    if (item.src) {
      const image = await this.embed(item.src);
      if (image) {
        const target = fitImage(item, image.width, image.height, item.fit);
        this.clip(item.x, item.y, item.width, item.height);
        this.page.drawImage(image, { x: target.x, y: this.flipY(target.y + target.height), width: target.width, height: target.height });
        this.unclip();
      }
    }
    if (item.style.border) this.borderSides(item.x, item.y, item.width, item.height, item.style.border);
  }
}

/**
 * Renders a layout document to PDF bytes. Runs entirely in the browser (or
 * Node). pdf-lib is loaded on first use.
 */
export async function exportPdf(doc: LayoutDocument, options: PdfExportOptions = {}): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(options.title ?? doc.name);
  if (options.author) pdf.setAuthor(options.author);
  if (options.subject) pdf.setSubject(options.subject);
  pdf.setCreator('ariana-report');
  pdf.setProducer('ariana-report');
  pdf.setLanguage(doc.locale);
  await new PdfRenderer(lib, pdf, doc, options).render();
  return pdf.save();
}
