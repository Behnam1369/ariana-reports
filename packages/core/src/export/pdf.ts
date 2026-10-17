import { Encodings } from '@pdf-lib/standard-fonts';
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type {
  LayoutBand,
  LayoutDocument,
  LayoutImage,
  LayoutItem,
  LayoutLine,
  LayoutText,
  LayoutTextRun,
  ResolvedBorder,
  ResolvedStyle,
} from '../layout/types';
import { standardFontName } from '../layout/text';
import {
  bidiLevels,
  isBidiControl,
  mirrorChar,
  reorderSegments,
  resolveBaseDirection,
  scriptDirection,
  shapesRightToLeft,
  type BaseDirection,
} from '../layout/bidi';
import { FontSet, loadFontkit, type FontChoice, type LoadedFont } from './fonts';
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

type FontVariant = { family: string; bold: boolean; italic: boolean };

/** Embeds fonts on demand and picks a font per character (see `FontSet`). */
class FontManager {
  private readonly embedded = new Map<LoadedFont | string, Promise<PDFFont>>();
  private readonly missing = new Set<number>();
  private set?: Promise<FontSet>;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: FontRegistration[],
  ) {}

  fontSet(): Promise<FontSet> {
    if (!this.set) {
      this.set = (async () => {
        if (this.fonts.length === 0) return new FontSet(undefined, []);
        const fontkit = await loadFontkit();
        this.pdf.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
        return new FontSet(fontkit, this.fonts);
      })();
    }
    return this.set;
  }

  embed(choice: FontChoice, v: FontVariant): Promise<PDFFont> {
    const key = choice ?? standardFontName(v.family, v.bold, v.italic);
    let hit = this.embedded.get(key);
    if (!hit) {
      hit = choice ? this.pdf.embedFont(choice.bytes, { subset: true }) : this.pdf.embedFont(key as string);
      this.embedded.set(key, hit);
    }
    return hit;
  }

  /**
   * Line metrics of the primary font (the first candidate of the family), in
   * points: `full` is ascent + descent, `ascent` the part above the baseline.
   * Registered fonts are measured from their hhea metrics: pdf-lib's
   * `heightAtSize(size, { descender: false })` is wrong for embedded fonts
   * and placed text too high, so it was clipped at the top of its box.
   */
  async metrics(v: FontVariant, size: number): Promise<{ full: number; ascent: number }> {
    const set = await this.fontSet();
    const choice = set.candidates(v)[0] ?? null;
    if (choice) {
      const { ascent, descent, unitsPerEm } = choice.font;
      return { full: ((ascent - descent) / unitsPerEm) * size, ascent: (ascent / unitsPerEm) * size };
    }
    const font = await this.embed(null, v);
    return { full: font.heightAtSize(size), ascent: font.heightAtSize(size, { descender: false }) };
  }

  /** Assigns a font to every code point of `text`, recording characters no font has. */
  async assign(text: string, v: FontVariant): Promise<FontChoice[]> {
    return (await this.fontSet()).assign(text, v, (cp) => this.missing.add(cp));
  }

  /** A warning listing characters no font could draw, if any. */
  missingWarning(): string | null {
    if (this.missing.size === 0) return null;
    const list = [...this.missing]
      .slice(0, 10)
      .map((cp) => `"${String.fromCodePoint(cp)}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`)
      .join(', ');
    const more = this.missing.size > 10 ? ` and ${this.missing.size - 10} more` : '';
    return `No font can draw ${list}${more}. Register a font that covers these characters (pdf.fonts).`;
  }
}

/** Replaces characters the standard fonts cannot encode. Invisible format characters are dropped. */
export function sanitizeForStandardFont(text: string): string {
  let out = '';
  for (const ch of text.replace(/\t/g, '    ')) {
    if (Encodings.WinAnsi.canEncodeUnicodeCodePoint(ch.codePointAt(0)!)) out += ch;
    else if (!FORMAT_CHAR.test(ch)) out += '?';
  }
  return out;
}

const FORMAT_CHAR = /\p{Cf}/u;
const WHITESPACE = /\s/u;

/** One input run of a line: plain text has a single run. */
interface LineRun {
  text: string;
  bold: boolean;
  italic: boolean;
  run?: LayoutTextRun;
}

/** A piece of a line, ready to draw, in visual (left-to-right) order. */
interface Piece {
  /** The string handed to pdf-lib; fontkit may reverse it again while shaping. */
  text: string;
  font: PDFFont;
  width: number;
  run?: LayoutTextRun;
  space: boolean;
}

/**
 * Lays out one line: assigns fonts per character, resolves bidi levels on
 * the whole line, and returns the pieces in visual order. With
 * `splitSpaces`, whitespace becomes separate pieces (for justification).
 */
async function linePieces(fonts: FontManager, runs: LineRun[], family: string, base: BaseDirection, size: number, splitSpaces: boolean): Promise<Piece[]> {
  // `script` keeps characters of left-to-right and right-to-left scripts in
  // separate pieces, so fontkit's own reversal is predictable per piece.
  type Seg = { chars: string[]; level: number; runIndex: number; choice: FontChoice; space: boolean; script: BaseDirection | null };
  const all = runs.map((r) => r.text).join('');
  const levels = bidiLevels(all, base);
  const segs: Seg[] = [];
  let index = 0;
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!;
    const choices = await fonts.assign(run.text, { family, bold: run.bold, italic: run.italic });
    let k = 0;
    for (const ch of run.text) {
      const choice = choices[k++] ?? null;
      const level = levels[index++]!;
      if (isBidiControl(ch.codePointAt(0)!)) continue;
      const space = splitSpaces && WHITESPACE.test(ch);
      const script = scriptDirection(ch);
      const last = segs[segs.length - 1];
      if (
        last &&
        last.runIndex === r &&
        last.choice === choice &&
        last.level === level &&
        last.space === space &&
        (script === null || last.script === null || last.script === script)
      ) {
        last.chars.push(ch);
        last.script ??= script;
      } else {
        segs.push({ chars: [ch], level, runIndex: r, choice, space, script });
      }
    }
  }
  const pieces: Piece[] = [];
  for (const seg of reorderSegments(segs)) {
    const run = runs[seg.runIndex]!;
    const rtl = seg.level % 2 === 1;
    const visual = (rtl ? seg.chars.map(mirrorChar).reverse() : seg.chars).join('');
    let text: string;
    if (seg.choice === null) {
      text = sanitizeForStandardFont(visual);
    } else {
      // fontkit reverses strings in right-to-left scripts after shaping. Hand it
      // the string that comes out in visual order (logical order for Arabic letters).
      const reversed = Array.from(visual).reverse().join('');
      text = shapesRightToLeft(visual) ? reversed : visual;
    }
    const font = await fonts.embed(seg.choice, { family, bold: run.bold, italic: run.italic });
    const piece: Piece = { text, font, width: font.widthOfTextAtSize(text, size), space: seg.space };
    if (run.run) piece.run = run.run;
    pieces.push(piece);
  }
  return pieces;
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
    const missing = this.fonts.missingWarning();
    // Missing glyphs turn text into "?", so they are reported even without a handler.
    if (missing) (this.options.onWarning ?? ((m: string) => console.warn(`[ariana-reports] ${m}`)))(missing);
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
    const bold = style.fontWeight === 'bold';
    const italic = style.fontStyle === 'italic';
    // Plain text is one run per line; `allowHtml` text has styled runs.
    const plainFill = item.runs ? null : this.color(style.color);
    if (!item.runs && !plainFill) return;
    const lines: LineRun[][] = item.runs
      ? item.runs.map((runs) => runs.map((r) => ({ text: r.text, bold: r.bold, italic: r.italic, run: r })))
      : item.lines.map((line) => [{ text: line, bold, italic }]);
    if (lines.every((runs) => runs.every((r) => r.text === ''))) return;

    const size = style.fontSize;
    const lh = item.lineHeight;
    const pad = style.padding;
    const contentX = item.x + pad.left;
    const contentWidth = Math.max(0, item.width - pad.left - pad.right);
    const contentTop = item.y + pad.top;
    const available = item.height - pad.top - pad.bottom;
    const textHeight = lines.length * lh;
    const offset =
      style.verticalAlign === 'middle' ? (available - textHeight) / 2 : style.verticalAlign === 'bottom' ? available - textHeight : 0;
    const base = item.direction ?? resolveBaseDirection(item.text, style.direction);
    // Center the primary font's ascent+descent box inside the line box, as CSS does.
    const { full, ascent } = await this.fonts.metrics({ family: style.fontFamily, bold, italic }, size);

    // Lay out every line first; drawing below is synchronous.
    const prepared: { pieces: Piece[]; justify: boolean }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const runs = lines[i]!;
      const lineText = runs.map((r) => r.text).join('');
      const justify = style.textAlign === 'justify' && i < lines.length - 1 && /\S\s+\S/.test(lineText);
      prepared.push({ pieces: await linePieces(this.fonts, runs, style.fontFamily, base, size, justify), justify });
    }

    const drawPiece = (p: Piece, x: number, lineTop: number, baseline: number, width: number) => {
      const run = p.run;
      if (run) {
        const bg = this.color(run.backgroundColor);
        if (bg && width > 0) {
          this.page.drawRectangle({ x, y: this.flipY(lineTop + lh), width, height: lh, color: bg.color, opacity: bg.opacity });
        }
      }
      const fill = run ? this.color(run.color) : plainFill;
      if (!fill || p.text === '') return;
      if (p.text.trim() !== '') this.page.drawText(p.text, { x, y: this.flipY(baseline), size, font: p.font, color: fill.color, opacity: fill.opacity });
      if (run?.underline) this.decoration({ ...style, textDecoration: 'underline' }, x, baseline, width, fill);
      if (run?.strike) this.decoration({ ...style, textDecoration: 'line-through' }, x, baseline, width, fill);
    };

    this.clip(item.x, item.y, item.width, item.height);
    try {
      prepared.forEach(({ pieces, justify }, i) => {
        if (pieces.length === 0) return;
        const lineTop = contentTop + offset + i * lh;
        const baseline = lineTop + (lh - full) / 2 + ascent;
        if (justify) {
          // Inner spaces share the free width; spaces at either end are dropped.
          const tokens = pieces.slice();
          while (tokens.length && tokens[0]!.space) tokens.shift();
          while (tokens.length && tokens[tokens.length - 1]!.space) tokens.pop();
          const gaps = tokens.filter((t) => t.space).length;
          const wordsWidth = tokens.reduce((s, t) => s + (t.space ? 0 : t.width), 0);
          const gap = gaps > 0 ? (contentWidth - wordsWidth) / gaps : 0;
          let cursor = contentX;
          for (const t of tokens) {
            const w = t.space ? gap : t.width;
            drawPiece(t, cursor, lineTop, baseline, w);
            cursor += w;
          }
          if (plainFill) this.decoration(style, contentX, baseline, contentWidth, plainFill);
          return;
        }
        const total = pieces.reduce((s, p) => s + p.width, 0);
        // The last line of justified text starts at the start edge.
        const align = style.textAlign === 'justify' ? (base === 'rtl' ? 'right' : 'left') : style.textAlign;
        let x = contentX;
        if (align === 'center') x += (contentWidth - total) / 2;
        else if (align === 'right') x += contentWidth - total;
        const start = x;
        for (const p of pieces) {
          drawPiece(p, x, lineTop, baseline, p.width);
          x += p.width;
        }
        if (plainFill) this.decoration(style, start, baseline, total, plainFill);
      });
    } finally {
      this.unclip();
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
