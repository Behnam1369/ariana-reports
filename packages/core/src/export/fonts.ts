import { Encodings } from '@pdf-lib/standard-fonts';
import { isBidiControl } from '../layout/bidi';
import { createStandardFontMeasurer, type FontSpec, type TextMeasurer } from '../layout/text';
import type { FontRegistration } from './pdf';

/** The parts of a fontkit font this module uses. */
interface FontkitFont {
  unitsPerEm: number;
  /** hhea ascent and descent (descent is negative), in font units. */
  ascent: number;
  descent: number;
  layout(text: string): { advanceWidth: number };
  hasGlyphForCodePoint(codePoint: number): boolean;
}

interface Fontkit {
  create(bytes: Uint8Array): FontkitFont;
}

export async function loadFontkit(): Promise<Fontkit> {
  const mod = (await import('@pdf-lib/fontkit')) as unknown as { default?: Fontkit } & Fontkit;
  return mod.default ?? mod;
}

export function familyKey(family: string): string {
  return (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
}

function familyKeys(family: string): string[] {
  return family
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter((f) => f !== '');
}

/**
 * Returns the bytes of a registered font. WOFF2 files are rejected with a
 * clear message: fontkit cannot subset them, and the export would fail later
 * with an unrelated error.
 */
export function fontBytes(font: FontRegistration): Uint8Array {
  const bytes = font.data instanceof Uint8Array ? font.data : new Uint8Array(font.data);
  // "wOF2" signature.
  if (bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32) {
    throw new Error(`Font "${font.family}" is a WOFF2 file, which is not supported. Register the .ttf, .otf or .woff file instead.`);
  }
  return bytes;
}

/** A registered font, parsed. */
export interface LoadedFont {
  registration: FontRegistration;
  family: string;
  bold: boolean;
  italic: boolean;
  bytes: Uint8Array;
  font: FontkitFont;
}

/** `null` stands for the PDF standard font of the requested family. */
export type FontChoice = LoadedFont | null;

const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const JOINERS = new Set([0x200c, 0x200d, 0x034f]);

function standardCovers(cp: number): boolean {
  return cp === 0x09 || Encodings.WinAnsi.canEncodeUnicodeCodePoint(cp);
}

/**
 * Picks a font for every character, so that text the requested font cannot
 * draw falls back to another registered font that can, e.g. Persian text in
 * a Roboto component is drawn with a registered Vazirmatn. The order is:
 * the families listed in `fontFamily` (unregistered names mean the standard
 * font), then the standard font, then every other registered font.
 * The PDF writer and the text measurer share this logic, so line breaks
 * match the PDF.
 */
export class FontSet {
  readonly fonts: LoadedFont[];
  private readonly candidateCache = new Map<string, FontChoice[]>();

  /** `fontkit` is only needed when there are registrations. */
  constructor(fontkit: Fontkit | undefined, registrations: FontRegistration[]) {
    this.fonts = registrations.map((r) => {
      const bytes = fontBytes(r);
      if (!fontkit) throw new Error('fontkit is required to load registered fonts');
      return { registration: r, family: familyKey(r.family), bold: !!r.bold, italic: !!r.italic, bytes, font: fontkit.create(bytes) };
    });
  }

  static async create(registrations: FontRegistration[]): Promise<FontSet> {
    return new FontSet(registrations.length ? await loadFontkit() : undefined, registrations);
  }

  /** The registered face of a family closest to the requested variant. */
  pick(family: string, bold: boolean, italic: boolean): LoadedFont | undefined {
    const same = this.fonts.filter((f) => f.family === family);
    return (
      same.find((f) => f.bold === bold && f.italic === italic) ??
      same.find((f) => f.bold === bold) ??
      same.find((f) => !f.bold && !f.italic) ??
      same[0]
    );
  }

  /**
   * Every face of a family, closest variant first. A family may be split
   * into several files by script (as Fontsource and Google Fonts ship them,
   * e.g. "arabic" and "latin" subsets); all of them are candidates.
   */
  private faces(family: string, bold: boolean, italic: boolean): LoadedFont[] {
    const score = (f: LoadedFont) => (f.bold === bold ? 0 : 2) + (f.italic === italic ? 0 : 1);
    return this.fonts.filter((f) => f.family === family).sort((a, b) => score(a) - score(b));
  }

  /** Candidate fonts in fallback order. The first one is the primary font. */
  candidates(spec: Pick<FontSpec, 'family' | 'bold' | 'italic'>): FontChoice[] {
    const key = `${spec.family}|${spec.bold}|${spec.italic}`;
    let out = this.candidateCache.get(key);
    if (out) return out;
    out = [];
    const add = (c: FontChoice) => {
      if (!out!.includes(c)) out!.push(c);
    };
    for (const family of familyKeys(spec.family)) {
      const faces = this.faces(family, spec.bold, spec.italic);
      if (faces.length) faces.forEach(add);
      else add(null);
    }
    add(null);
    for (const family of new Set(this.fonts.map((f) => f.family))) this.faces(family, spec.bold, spec.italic).forEach(add);
    this.candidateCache.set(key, out);
    return out;
  }

  covers(choice: FontChoice, cp: number): boolean {
    return choice === null ? standardCovers(cp) : choice.font.hasGlyphForCodePoint(cp);
  }

  /**
   * Assigns a font to each code point of `text` (as split by `Array.from`).
   * Punctuation, spaces and marks stay with the font of the previous
   * character when it has them, so words and shaping runs are not split.
   * `onMissing` is called for characters no font can draw.
   */
  assign(text: string, spec: Pick<FontSpec, 'family' | 'bold' | 'italic'>, onMissing?: (cp: number) => void): FontChoice[] {
    const candidates = this.candidates(spec);
    const out: FontChoice[] = [];
    let prev: FontChoice | undefined;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      let choice: FontChoice | undefined;
      if (prev !== undefined && (isBidiControl(cp) || (prev !== null && (JOINERS.has(cp) || MARK.test(ch))))) {
        choice = prev;
      } else if (prev !== undefined && !LETTER.test(ch) && this.covers(prev, cp)) {
        choice = prev;
      } else {
        choice = candidates.find((c) => this.covers(c, cp));
        if (choice === undefined) {
          if (!isBidiControl(cp) && !JOINERS.has(cp)) onMissing?.(cp);
          // Draw with the primary font: a registered font shows its "missing glyph"; standard fonts show "?".
          choice = candidates[0] ?? null;
        }
      }
      out.push(choice);
      prev = choice;
    }
    return out;
  }
}

/** Splits text into runs of the same font, dropping bidi controls (they are not drawn). */
export function fontRuns(text: string, choices: FontChoice[]): { text: string; font: FontChoice }[] {
  const runs: { text: string; font: FontChoice }[] = [];
  let i = 0;
  for (const ch of text) {
    const font = choices[i++] ?? null;
    if (isBidiControl(ch.codePointAt(0)!)) continue;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font });
  }
  return runs;
}

/**
 * Builds a text measurer that uses the real metrics of registered fonts and
 * falls back to standard font metrics for other families. Characters the
 * requested font lacks are measured with the font the PDF uses for them.
 * Pass the same fonts to `generateReport` (via this measurer) and to
 * `exportPdf` so line breaks in the PDF match the layout.
 */
export async function createFontMeasurer(fonts: FontRegistration[], fallback?: TextMeasurer): Promise<TextMeasurer> {
  const set = await FontSet.create(fonts);
  const base = fallback ?? createStandardFontMeasurer();
  return {
    measure(text, spec) {
      if (set.fonts.length === 0) return base.measure(text, spec);
      let total = 0;
      for (const run of fontRuns(text, set.assign(text, spec))) {
        total += run.font ? (run.font.font.layout(run.text).advanceWidth / run.font.font.unitsPerEm) * spec.size : base.measure(run.text, spec);
      }
      return total;
    },
  };
}
