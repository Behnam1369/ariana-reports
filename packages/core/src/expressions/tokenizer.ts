import { ExpressionError } from './errors';

export type Token =
  | { type: 'num'; value: number; start: number }
  | { type: 'str'; value: string; start: number }
  | { type: 'ident'; value: string; start: number }
  | { type: 'punc'; value: string; start: number }
  | { type: 'template'; quasis: string[]; expressions: Token[][]; start: number }
  | { type: 'eof'; start: number };

// Longest first so that e.g. "===" wins over "==".
const PUNCTUATORS = [
  '===',
  '!==',
  '**',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '=>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '?',
  ':',
  '.',
  ',',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
];

const ID_START = /[\p{ID_Start}$_]/u;
const ID_CONTINUE = /[\p{ID_Continue}$_\u200c\u200d]/u;
const DIGIT = /[0-9]/;
const NUMBER = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;

export function tokenize(source: string): Token[] {
  const { tokens } = tokenizeFrom(source, 0, false);
  return tokens;
}

/**
 * Tokenizes from `start`. When `inTemplate` is true, stops at the `}` that
 * closes a `${ ... }` substitution and returns its index as `end`.
 */
function tokenizeFrom(source: string, start: number, inTemplate: boolean): { tokens: Token[]; end: number } {
  const tokens: Token[] = [];
  let i = start;
  let braceDepth = 0;

  const fail = (message: string, pos: number): never => {
    throw new ExpressionError(message, source, pos);
  };

  while (i < source.length) {
    const ch = source[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(source[i + 1] ?? ''))) {
      const m = NUMBER.exec(source.slice(i));
      if (!m) fail('Invalid number', i);
      const text = m![0];
      const next = source[i + text.length];
      if (next !== undefined && (ID_START.test(next) || DIGIT.test(next))) fail('Invalid number', i);
      tokens.push({ type: 'num', value: Number(text), start: i });
      i += text.length;
      continue;
    }

    if (ID_START.test(ch)) {
      let j = i + 1;
      while (j < source.length && ID_CONTINUE.test(source[j]!)) j++;
      tokens.push({ type: 'ident', value: source.slice(i, j), start: i });
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const { value, end } = readString(source, i, ch, fail);
      tokens.push({ type: 'str', value, start: i });
      i = end;
      continue;
    }

    if (ch === '`') {
      const tokenStart = i;
      const quasis: string[] = [];
      const expressions: Token[][] = [];
      let cooked = '';
      i++;
      for (;;) {
        if (i >= source.length) fail('Unterminated template literal', tokenStart);
        const c = source[i]!;
        if (c === '`') {
          i++;
          break;
        }
        if (c === '\\') {
          const { value, end } = readEscape(source, i, fail);
          cooked += value;
          i = end;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          quasis.push(cooked);
          cooked = '';
          const inner = tokenizeFrom(source, i + 2, true);
          if (inner.tokens.length === 1) fail('Empty template substitution', i);
          expressions.push(inner.tokens);
          i = inner.end + 1;
          continue;
        }
        cooked += c;
        i++;
      }
      quasis.push(cooked);
      tokens.push({ type: 'template', quasis, expressions, start: tokenStart });
      continue;
    }

    if (inTemplate) {
      if (ch === '{') braceDepth++;
      if (ch === '}') {
        if (braceDepth === 0) {
          tokens.push({ type: 'eof', start: i });
          return { tokens, end: i };
        }
        braceDepth--;
      }
    }

    // "?." followed by a digit is a conditional operator and a number (a?.5:1).
    const punc = PUNCTUATORS.find(
      (p) => source.startsWith(p, i) && !(p === '?.' && DIGIT.test(source[i + 2] ?? '')),
    );
    if (punc) {
      tokens.push({ type: 'punc', value: punc, start: i });
      i += punc.length;
      continue;
    }

    if (ch === '=') fail('Assignment is not allowed in expressions', i);
    if (ch === ';') fail('Statements are not allowed in expressions', i);
    fail(`Unexpected character "${ch}"`, i);
  }

  if (inTemplate) fail('Unterminated template substitution', start);
  tokens.push({ type: 'eof', start: i });
  return { tokens, end: i };
}

type Fail = (message: string, pos: number) => never;

function readString(source: string, start: number, quote: string, fail: Fail): { value: string; end: number } {
  let i = start + 1;
  let value = '';
  while (i < source.length) {
    const c = source[i]!;
    if (c === quote) return { value, end: i + 1 };
    if (c === '\n' || c === '\r') break;
    if (c === '\\') {
      const esc = readEscape(source, i, fail);
      value += esc.value;
      i = esc.end;
      continue;
    }
    value += c;
    i++;
  }
  return fail('Unterminated string', start);
}

function readEscape(source: string, start: number, fail: Fail): { value: string; end: number } {
  const c = source[start + 1];
  const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
  if (c === undefined) return fail('Invalid escape sequence', start);
  if (c in simple && !(c === '0' && DIGIT.test(source[start + 2] ?? ''))) return { value: simple[c]!, end: start + 2 };
  if (c === 'x') {
    const hex = source.slice(start + 2, start + 4);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) fail('Invalid hexadecimal escape', start);
    return { value: String.fromCharCode(parseInt(hex, 16)), end: start + 4 };
  }
  if (c === 'u') {
    if (source[start + 2] === '{') {
      const close = source.indexOf('}', start + 3);
      const hex = close === -1 ? '' : source.slice(start + 3, close);
      const cp = /^[0-9a-fA-F]{1,6}$/.test(hex) ? parseInt(hex, 16) : NaN;
      if (Number.isNaN(cp) || cp > 0x10ffff) fail('Invalid Unicode escape', start);
      return { value: String.fromCodePoint(cp), end: close + 1 };
    }
    const hex = source.slice(start + 2, start + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid Unicode escape', start);
    return { value: String.fromCharCode(parseInt(hex, 16)), end: start + 6 };
  }
  if (c === '\r' && source[start + 2] === '\n') return { value: '', end: start + 3 };
  if (c === '\n' || c === '\r') return { value: '', end: start + 2 };
  return { value: c, end: start + 2 };
}
