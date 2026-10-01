import { Encodings, Font, FontNames } from '@pdf-lib/standard-fonts';

export interface FontSpec {
  family: string;
  /** Size in points. */
  size: number;
  bold: boolean;
  italic: boolean;
}

/** Measures the advance width of a single line of text, in points. */
export interface TextMeasurer {
  measure(text: string, font: FontSpec): number;
}

export type StandardFontFamily = 'Helvetica' | 'Times' | 'Courier';

const SERIF = /^(times|times new roman|serif|georgia|cambria|garamond)$/i;
const MONO = /^(courier|courier new|monospace|consolas|menlo|monaco|lucida console)$/i;

/** Maps a CSS-like font family to the closest PDF standard font family. */
export function standardFamily(family: string): StandardFontFamily {
  const first = (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
  if (SERIF.test(first)) return 'Times';
  if (MONO.test(first)) return 'Courier';
  return 'Helvetica';
}

/** Returns the PDF standard font name for a family and variant. */
export function standardFontName(family: string, bold: boolean, italic: boolean): FontNames {
  switch (standardFamily(family)) {
    case 'Times':
      if (bold && italic) return FontNames.TimesRomanBoldItalic;
      if (bold) return FontNames.TimesRomanBold;
      if (italic) return FontNames.TimesRomanItalic;
      return FontNames.TimesRoman;
    case 'Courier':
      if (bold && italic) return FontNames.CourierBoldOblique;
      if (bold) return FontNames.CourierBold;
      if (italic) return FontNames.CourierOblique;
      return FontNames.Courier;
    default:
      if (bold && italic) return FontNames.HelveticaBoldOblique;
      if (bold) return FontNames.HelveticaBold;
      if (italic) return FontNames.HelveticaOblique;
      return FontNames.Helvetica;
  }
}

const fontCache = new Map<FontNames, Font>();

export function loadStandardFont(name: FontNames): Font {
  let font = fontCache.get(name);
  if (!font) {
    font = Font.load(name);
    fontCache.set(name, font);
  }
  return font;
}

/** Width used for characters the standard fonts cannot encode (in 1/1000 em). */
const FALLBACK_GLYPH_WIDTH = 556;

/**
 * Measures text with the AFM metrics of the 14 PDF standard fonts, including
 * kerning. This is the same computation pdf-lib uses, so line breaks in the
 * viewer and in exported PDFs match.
 */
export function createStandardFontMeasurer(): TextMeasurer {
  return {
    measure(text, spec) {
      const font = loadStandardFont(standardFontName(spec.family, spec.bold, spec.italic));
      let total = 0;
      let previous: string | undefined;
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (Encodings.WinAnsi.canEncodeUnicodeCodePoint(cp)) {
          const glyph = Encodings.WinAnsi.encodeUnicodeCodePoint(cp).name;
          if (previous) total += font.getXAxisKerningForPair(previous, glyph) || 0;
          total += font.getWidthOfGlyph(glyph) || 0;
          previous = glyph;
        } else {
          total += FALLBACK_GLYPH_WIDTH;
          previous = undefined;
        }
      }
      return (total * spec.size) / 1000;
    },
  };
}

/** Line height as a multiple of the font size. */
export const LINE_HEIGHT_FACTOR = 1.2;

/**
 * Wraps text into lines that fit `maxWidth` points. Honours explicit line
 * breaks, breaks at spaces, and splits words that are longer than a line.
 * With `wordWrap` false only explicit line breaks are used.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  font: FontSpec,
  measurer: TextMeasurer,
  wordWrap = true,
): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  if (!wordWrap) return paragraphs;
  const lines: string[] = [];
  const width = (s: string) => measurer.measure(s, font);

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    // Tokens are words with their leading whitespace, so inner spacing is preserved.
    const tokens = paragraph.match(/\s*\S+/g) ?? [];
    let line = '';
    const startLine = (token: string, isParagraphStart: boolean) => {
      // Leading spaces are kept only as paragraph indentation.
      const word = isParagraphStart ? token : token.trimStart();
      if (width(word) <= maxWidth) {
        line = word;
        return;
      }
      // A word wider than the line is split by characters.
      const pieces = splitWord(word, maxWidth, width);
      lines.push(...pieces.slice(0, -1));
      line = pieces[pieces.length - 1] ?? '';
    };
    tokens.forEach((token, i) => {
      if (i === 0) {
        startLine(token, true);
      } else if (width(line + token) <= maxWidth) {
        line += token;
      } else {
        lines.push(line);
        startLine(token, false);
      }
    });
    lines.push(line);
  }
  return lines;
}

function splitWord(word: string, maxWidth: number, width: (s: string) => number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const ch of word) {
    if (current !== '' && width(current + ch) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  pieces.push(current);
  return pieces;
}
