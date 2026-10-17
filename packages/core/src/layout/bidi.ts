/**
 * A compact implementation of the Unicode Bidirectional Algorithm (UAX #9)
 * for single lines of text. It covers what reports need: strong letters,
 * European and Arabic numbers with their separators, neutrals, implicit
 * levels, line-level reordering and mirroring of paired punctuation.
 * Explicit embeddings and isolates (U+202A..U+202E, U+2066..U+2069) are
 * ignored; LRM, RLM and ALM act as strong characters.
 */

/** Base (paragraph) direction of a text. */
export type BaseDirection = 'ltr' | 'rtl';

type BidiType = 'L' | 'R' | 'AL' | 'EN' | 'ES' | 'ET' | 'AN' | 'CS' | 'NSM' | 'BN' | 'B' | 'S' | 'WS' | 'ON';

const R_SCRIPTS =
  /[\p{Script=Hebrew}\p{Script=Cypriot}\p{Script=Kharoshthi}\p{Script=Phoenician}\p{Script=Nko}\p{Script=Lydian}\p{Script=Avestan}\p{Script=Imperial_Aramaic}\p{Script=Inscriptional_Pahlavi}\p{Script=Inscriptional_Parthian}\p{Script=Old_South_Arabian}\p{Script=Old_Turkic}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Meroitic_Cursive}\p{Script=Meroitic_Hieroglyphs}\p{Script=Manichaean}\p{Script=Mende_Kikakui}\p{Script=Nabataean}\p{Script=Old_North_Arabian}\p{Script=Palmyrene}\p{Script=Psalter_Pahlavi}]/u;
const AL_SCRIPTS = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u;
const MARK = /[\p{Mn}\p{Me}]/u;
const STRONG_LTR = /[\p{L}\p{Mc}\p{N}]/u;
const FORMAT = /\p{Cf}/u;

function between(cp: number, lo: number, hi: number): boolean {
  return cp >= lo && cp <= hi;
}

/** Bidi controls that only steer the algorithm and are not drawn. */
export function isBidiControl(cp: number): boolean {
  return cp === 0x200e || cp === 0x200f || cp === 0x061c || between(cp, 0x202a, 0x202e) || between(cp, 0x2066, 0x2069);
}

function bidiType(ch: string): BidiType {
  const cp = ch.codePointAt(0)!;
  if (cp === 0x200e) return 'L';
  if (cp === 0x200f) return 'R';
  if (cp === 0x061c) return 'AL';
  if (between(cp, 0x30, 0x39) || cp === 0xb2 || cp === 0xb3 || cp === 0xb9 || between(cp, 0x6f0, 0x6f9)) return 'EN';
  if (between(cp, 0x2070, 0x2079) || between(cp, 0x2080, 0x2089) || between(cp, 0xff10, 0xff19)) return 'EN';
  if (between(cp, 0x660, 0x669) || between(cp, 0x600, 0x605) || cp === 0x66b || cp === 0x66c || cp === 0x6dd || cp === 0x8e2) return 'AN';
  if (cp === 0x2b || cp === 0x2d || cp === 0x2212 || cp === 0x207a || cp === 0x207b || cp === 0x208a || cp === 0x208b || cp === 0xfb29 || cp === 0xfe62 || cp === 0xfe63 || cp === 0xff0b || cp === 0xff0d) return 'ES';
  if (between(cp, 0x23, 0x25) || between(cp, 0xa2, 0xa5) || cp === 0xb0 || cp === 0xb1 || cp === 0x66a || between(cp, 0x2030, 0x2034) || between(cp, 0x20a0, 0x20cf) || cp === 0x212e || cp === 0xfe5f || cp === 0xfe69 || cp === 0xfe6a || between(cp, 0xff03, 0xff05)) return 'ET';
  if (cp === 0x2c || cp === 0x2e || cp === 0x2f || cp === 0x3a || cp === 0xa0 || cp === 0x60c || cp === 0x202f || cp === 0x2044 || cp === 0xfe50 || cp === 0xfe52 || cp === 0xfe55 || cp === 0xff0c || cp === 0xff0e || cp === 0xff0f || cp === 0xff1a) return 'CS';
  if (cp === 0x0a || cp === 0x0d || between(cp, 0x1c, 0x1e) || cp === 0x85 || cp === 0x2029) return 'B';
  if (cp === 0x09 || cp === 0x0b || cp === 0x1f) return 'S';
  if (cp === 0x20 || cp === 0x0c || cp === 0x1680 || between(cp, 0x2000, 0x200a) || cp === 0x2028 || cp === 0x205f || cp === 0x3000) return 'WS';
  if (MARK.test(ch)) return 'NSM';
  if (isBidiControl(cp) || FORMAT.test(ch) || cp === 0xad) return 'BN';
  if (AL_SCRIPTS.test(ch)) return STRONG_LTR.test(ch) ? 'AL' : 'ON';
  if (R_SCRIPTS.test(ch)) return STRONG_LTR.test(ch) ? 'R' : 'ON';
  if (STRONG_LTR.test(ch)) return 'L';
  return 'ON';
}

/** Direction of the first strong character (rules P2 and P3), or null when there is none. */
export function detectDirection(text: string): BaseDirection | null {
  for (const ch of text) {
    const t = bidiType(ch);
    if (t === 'L') return 'ltr';
    if (t === 'R' || t === 'AL') return 'rtl';
  }
  return null;
}

/** Resolves a style direction to a base direction; `auto` follows the first strong character. */
export function resolveBaseDirection(text: string, direction: 'ltr' | 'rtl' | 'auto' = 'auto'): BaseDirection {
  if (direction !== 'auto') return direction;
  return detectDirection(text) ?? 'ltr';
}

const SCRIPT_SPECIFIC = /[^\p{Script=Common}\p{Script=Inherited}\p{Script=Unknown}]/u;

/**
 * True when fontkit (used by pdf-lib for embedded fonts) lays the string out
 * right-to-left: it reverses the glyphs when the first character with a
 * specific script belongs to a right-to-left script. Persian and Arabic
 * digits count, since their script is Arabic.
 */
export function shapesRightToLeft(text: string): boolean {
  for (const ch of text) {
    const d = scriptDirection(ch);
    if (d) return d === 'rtl';
  }
  return false;
}

/** Writing direction of a character's script, or null for common characters (spaces, punctuation, ASCII digits). */
export function scriptDirection(ch: string): BaseDirection | null {
  if (!SCRIPT_SPECIFIC.test(ch)) return null;
  return R_SCRIPTS.test(ch) || AL_SCRIPTS.test(ch) ? 'rtl' : 'ltr';
}

/** True when the text contains characters of a right-to-left script. */
export function hasRtlCharacters(text: string): boolean {
  for (const ch of text) {
    const t = bidiType(ch);
    if (t === 'R' || t === 'AL' || t === 'AN') return true;
  }
  return false;
}

const isNeutral = (t: BidiType) => t === 'ON' || t === 'WS' || t === 'S' || t === 'B';

/**
 * Embedding levels of one line, one entry per code point (as produced by
 * `Array.from(text)`). Even levels are left-to-right, odd levels right-to-left.
 */
export function bidiLevels(text: string, base: BaseDirection): number[] {
  const chars = Array.from(text);
  const n = chars.length;
  const p = base === 'rtl' ? 1 : 0;
  const sos: BidiType = p ? 'R' : 'L';
  const types = chars.map(bidiType);
  const original = types.slice();

  // W1: marks (and retained boundary neutrals) take the type of the previous character.
  for (let i = 0; i < n; i++) {
    if (types[i] === 'NSM' || types[i] === 'BN') types[i] = i === 0 ? sos : types[i - 1]!;
  }
  // W2, W3: European numbers after Arabic letters become Arabic numbers; AL becomes R.
  let lastStrong: BidiType = sos;
  for (let i = 0; i < n; i++) {
    const t = types[i]!;
    if (t === 'EN' && lastStrong === 'AL') types[i] = 'AN';
    if (t === 'L' || t === 'R' || t === 'AL') lastStrong = t;
  }
  for (let i = 0; i < n; i++) if (types[i] === 'AL') types[i] = 'R';
  // W4: a single separator between two numbers of the same kind joins them.
  for (let i = 1; i < n - 1; i++) {
    const t = types[i];
    const a = types[i - 1];
    const b = types[i + 1];
    if (t === 'ES' && a === 'EN' && b === 'EN') types[i] = 'EN';
    else if (t === 'CS' && a === b && (a === 'EN' || a === 'AN')) types[i] = a!;
  }
  // W5: terminators next to European numbers become European numbers.
  for (let i = 0; i < n; i++) {
    if (types[i] !== 'ET') continue;
    let j = i;
    while (j < n && types[j] === 'ET') j++;
    if ((i > 0 && types[i - 1] === 'EN') || (j < n && types[j] === 'EN')) for (let k = i; k < j; k++) types[k] = 'EN';
    i = j - 1;
  }
  // W6: remaining separators and terminators are neutral.
  for (let i = 0; i < n; i++) if (types[i] === 'ES' || types[i] === 'ET' || types[i] === 'CS') types[i] = 'ON';
  // W7: European numbers in a left-to-right context are L.
  lastStrong = sos;
  for (let i = 0; i < n; i++) {
    const t = types[i]!;
    if (t === 'EN' && lastStrong === 'L') types[i] = 'L';
    if (t === 'L' || t === 'R') lastStrong = t;
  }
  // N1, N2: neutrals between characters of the same direction take it; others take the base direction.
  const dirOf = (t: BidiType): 'L' | 'R' => (t === 'L' ? 'L' : 'R');
  for (let i = 0; i < n; i++) {
    if (!isNeutral(types[i]!)) continue;
    let j = i;
    while (j < n && isNeutral(types[j]!)) j++;
    const before = i === 0 ? sos : dirOf(types[i - 1]!);
    const after = j === n ? sos : dirOf(types[j]!);
    const resolved: BidiType = before === after ? before : sos;
    for (let k = i; k < j; k++) types[k] = resolved;
    i = j - 1;
  }
  // I1, I2: implicit levels.
  const levels = types.map((t) => {
    if (p === 0) return t === 'R' ? 1 : t === 'AN' || t === 'EN' ? 2 : 0;
    return t === 'L' || t === 'EN' || t === 'AN' ? 2 : 1;
  });
  // L1: trailing whitespace and segment separators return to the base level.
  for (let i = n - 1; i >= 0; i--) {
    const t = original[i];
    if (t === 'WS' || t === 'S' || t === 'B' || t === 'BN') levels[i] = p;
    else break;
  }
  for (let i = 0; i < n; i++) {
    if (original[i] !== 'S' && original[i] !== 'B') continue;
    levels[i] = p;
    for (let k = i - 1; k >= 0 && (original[k] === 'WS' || original[k] === 'BN'); k--) levels[k] = p;
  }
  return levels;
}

/**
 * Reorders logical segments of uniform level into visual (left-to-right)
 * order (rule L2). The content of odd-level segments still has to be
 * reversed by the caller.
 */
export function reorderSegments<T extends { level: number }>(segments: readonly T[]): T[] {
  const out = segments.slice();
  if (out.length < 2) return out;
  let max = 0;
  let minOdd = Infinity;
  for (const s of out) {
    max = Math.max(max, s.level);
    if (s.level % 2 === 1) minOdd = Math.min(minOdd, s.level);
  }
  for (let level = max; level >= minOdd; level--) {
    for (let i = 0; i < out.length; i++) {
      if (out[i]!.level < level) continue;
      let j = i;
      while (j < out.length && out[j]!.level >= level) j++;
      const reversed = out.slice(i, j).reverse();
      out.splice(i, j - i, ...reversed);
      i = j;
    }
  }
  return out;
}

const MIRRORS: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
  '‹': '›',
  '›': '‹',
  '⁅': '⁆',
  '⁆': '⁅',
  '≤': '≥',
  '≥': '≤',
  '〈': '〉',
  '〉': '〈',
};

/** The mirrored form of a character drawn right-to-left (rule L4), e.g. "(" -> ")". */
export function mirrorChar(ch: string): string {
  return MIRRORS[ch] ?? ch;
}

/** A piece of one line in visual order. `text` is in visual (left-to-right) order with mirrored brackets. */
export interface VisualRun {
  text: string;
  level: number;
}

/**
 * Reorders one line of text for display and returns runs of uniform level in
 * visual order, each with its characters already in visual order. Bidi
 * controls are removed.
 */
export function visualRuns(text: string, base: BaseDirection): VisualRun[] {
  const chars = Array.from(text);
  const levels = bidiLevels(text, base);
  const logical: { chars: string[]; level: number }[] = [];
  chars.forEach((ch, i) => {
    if (isBidiControl(ch.codePointAt(0)!)) return;
    const level = levels[i]!;
    const last = logical[logical.length - 1];
    if (last && last.level === level) last.chars.push(ch);
    else logical.push({ chars: [ch], level });
  });
  return reorderSegments(logical).map((s) => ({
    level: s.level,
    text: s.level % 2 ? s.chars.map(mirrorChar).reverse().join('') : s.chars.join(''),
  }));
}

/** Reorders a line into the string a left-to-right renderer should draw. */
export function toVisualOrder(text: string, base: BaseDirection): string {
  return visualRuns(text, base)
    .map((r) => r.text)
    .join('');
}
