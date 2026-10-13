import { parseColor } from '../export/color';
import type { FontSpec, TextMeasurer } from './text';

/**
 * Lightweight markup for text components with `allowHtml: true`.
 *
 * Only a whitelist of formatting tags is understood; every other tag is
 * removed and its content kept as plain text. The result is a list of styled
 * runs, never HTML: renderers create text nodes, so markup in templates or
 * data cannot inject scripts, links, images or event handlers.
 *
 * Supported:
 *  - `<b>`, `<strong>`                 bold
 *  - `<i>`, `<em>`                     italic
 *  - `<u>`, `<ins>`                    underline
 *  - `<s>`, `<strike>`, `<del>`        line-through
 *  - `<br>`                            line break
 *  - `<font color="…">`                text color
 *  - `<span style="…">`                color, background-color, font-weight,
 *                                      font-style, text-decoration
 *  - entities: `&amp; &lt; &gt; &quot; &apos; &nbsp;` and numeric `&#…;`
 */

/** A run of text as written in the markup; unset flags inherit the component style. */
export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  backgroundColor?: string;
}

/** A run with every property resolved against the component style. Used in layout documents. */
export interface LayoutTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  backgroundColor?: string;
}

/** Tags understood by the markup parser. */
export const HTML_TAGS = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'br', 'font', 'span'] as const;

type RunStyle = Omit<TextRun, 'text'>;

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  brown: '#a52a2a',
  pink: '#ffc0cb',
};

/** Returns a template color (hex/rgb/rgba/transparent) for a markup color, or undefined when invalid. */
function markupColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  const named = NAMED_COLORS[v];
  if (named) return named;
  return parseColor(v) ? v : undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Reject control characters and invalid code points.
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return m;
      return String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    attrs[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function parseInlineStyle(css: string, into: RunStyle): void {
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim().toLowerCase();
    switch (prop) {
      case 'color': {
        const c = markupColor(value);
        if (c) into.color = c;
        break;
      }
      case 'background-color':
      case 'background': {
        const c = markupColor(value);
        if (c) into.backgroundColor = c;
        break;
      }
      case 'font-weight':
        into.bold = value === 'bold' || value === 'bolder' || (Number(value) >= 600);
        break;
      case 'font-style':
        into.italic = value === 'italic' || value === 'oblique';
        break;
      case 'text-decoration':
      case 'text-decoration-line':
        into.underline = value.includes('underline');
        into.strike = value.includes('line-through');
        break;
      default:
        break;
    }
  }
}

function tagStyle(tag: string, attrs: string): RunStyle | null {
  switch (tag) {
    case 'b':
    case 'strong':
      return { bold: true };
    case 'i':
    case 'em':
      return { italic: true };
    case 'u':
    case 'ins':
      return { underline: true };
    case 's':
    case 'strike':
    case 'del':
      return { strike: true };
    case 'font': {
      const color = markupColor(parseAttributes(attrs).color);
      return color ? { color } : {};
    }
    case 'span': {
      const style: RunStyle = {};
      const css = parseAttributes(attrs).style;
      if (css) parseInlineStyle(css, style);
      return style;
    }
    default:
      return null;
  }
}

const sameStyle = (a: RunStyle, b: RunStyle) =>
  a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.color === b.color && a.backgroundColor === b.backgroundColor;

/**
 * Parses whitelisted formatting markup into styled runs. Unknown tags are
 * dropped (their text is kept), comments are removed, entities decoded.
 */
export function parseHtmlText(source: string): TextRun[] {
  const runs: TextRun[] = [];
  const stack: { tag: string; style: RunStyle }[] = [];
  const current = (): RunStyle => stack[stack.length - 1]?.style ?? {};
  const push = (text: string) => {
    if (text === '') return;
    const style = current();
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, style)) last.text += text;
    else runs.push({ ...style, text });
  };

  const re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-z][a-z0-9]*)\b([^<>]*)>/gi;
  let index = 0;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    push(decodeEntities(source.slice(index, m.index)));
    index = m.index + m[0].length;
    if (m[2] === undefined) continue; // comment
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      push('\n');
      continue;
    }
    if (closing) {
      // Close the innermost open tag with this name (and anything opened inside it).
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const style = tagStyle(tag, m[3] ?? '');
    if (style === null) continue; // unknown tag: removed
    if (/\/\s*$/.test(m[3] ?? '')) continue; // self-closing formatting tag has no content
    stack.push({ tag, style: { ...current(), ...style } });
  }
  push(decodeEntities(source.slice(index)));
  return runs;
}

/** Plain text of runs (tags removed). */
export function runsText(runs: readonly { text: string }[]): string {
  return runs.map((r) => r.text).join('');
}

/** Base style that runs inherit from. */
export interface RunBase {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
}

export function resolveRuns(runs: TextRun[], base: RunBase): LayoutTextRun[] {
  return runs.map((r) => {
    const out: LayoutTextRun = {
      text: r.text,
      bold: r.bold ?? base.bold,
      italic: r.italic ?? base.italic,
      underline: r.underline ?? base.underline,
      strike: r.strike ?? base.strike,
      color: r.color ?? base.color,
    };
    if (r.backgroundColor) out.backgroundColor = r.backgroundColor;
    return out;
  });
}

const isSpace = (ch: string) => /\s/.test(ch);

/**
 * Wraps styled runs into lines that fit `maxWidth` points, with the same
 * rules as `wrapText` (explicit breaks, breaks at spaces, long words split
 * by character). Each run is measured with its own bold/italic font.
 */
export function wrapRuns(runs: LayoutTextRun[], maxWidth: number, font: FontSpec, measurer: TextMeasurer, wordWrap = true): LayoutTextRun[][] {
  // Style segments over the text with normalized line breaks.
  const segs: { start: number; end: number; run: LayoutTextRun }[] = [];
  let pos = 0;
  for (const run of runs) {
    const t = run.text.replace(/\r\n?/g, '\n');
    if (t === '') continue;
    segs.push({ start: pos, end: pos + t.length, run: { ...run, text: t } });
    pos += t.length;
  }
  const text = segs.map((s) => s.run.text).join('');
  const fontOf = (r: LayoutTextRun): FontSpec => ({ ...font, bold: r.bold, italic: r.italic });
  const width = (a: number, b: number) => {
    let w = 0;
    for (const s of segs) {
      if (s.end <= a || s.start >= b) continue;
      w += measurer.measure(text.slice(Math.max(a, s.start), Math.min(b, s.end)), fontOf(s.run));
    }
    return w;
  };
  const slice = (a: number, b: number): LayoutTextRun[] => {
    const out: LayoutTextRun[] = [];
    for (const s of segs) {
      if (s.end <= a || s.start >= b) continue;
      out.push({ ...s.run, text: text.slice(Math.max(a, s.start), Math.min(b, s.end)) });
    }
    return out;
  };

  const ranges: [number, number][] = [];
  let paraStart = 0;
  const paragraphs: [number, number][] = [];
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      paragraphs.push([paraStart, i]);
      paraStart = i + 1;
    }
  }

  for (const [ps, pe] of paragraphs) {
    if (!wordWrap || ps === pe) {
      ranges.push([ps, pe]);
      continue;
    }
    const paragraph = text.slice(ps, pe);
    const tokens: [number, number][] = [];
    const re = /\s*\S+/g;
    for (let m = re.exec(paragraph); m; m = re.exec(paragraph)) tokens.push([ps + m.index, ps + m.index + m[0].length]);
    if (tokens.length === 0) {
      ranges.push([ps, ps]);
      continue;
    }
    let line: [number, number] = [ps, ps];
    const startLine = (start: number, end: number, isParagraphStart: boolean) => {
      let s = start;
      if (!isParagraphStart) while (s < end && isSpace(text[s]!)) s++;
      if (width(s, end) <= maxWidth) {
        line = [s, end];
        return;
      }
      // A word wider than the line is split by characters.
      let pieceStart = s;
      for (let i = s; i < end; ) {
        const step = text.codePointAt(i)! > 0xffff ? 2 : 1;
        if (i > pieceStart && width(pieceStart, i + step) > maxWidth) {
          ranges.push([pieceStart, i]);
          pieceStart = i;
        }
        i += step;
      }
      line = [pieceStart, end];
    };
    tokens.forEach(([a, b], i) => {
      if (i === 0) startLine(a, b, true);
      else if (width(line[0], b) <= maxWidth) line = [line[0], b];
      else {
        ranges.push(line);
        startLine(a, b, false);
      }
    });
    ranges.push(line);
  }
  return ranges.map(([a, b]) => slice(a, b));
}
