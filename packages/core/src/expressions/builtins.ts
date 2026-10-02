import type { ValueFormat } from '../model/types';
import {
  DEFAULT_LOCALE,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatValue,
  toDate,
  toDisplayString,
  toNumber,
} from '../format/format';
import { currencyToWords, numberToWords } from '../format/words';
import { describeValue, isTrusted, markTrusted, readProperty, runtimeError } from './safety';

type Fn = (...args: unknown[]) => unknown;
type Selector = Fn | string | undefined;

function select(items: unknown, selector: Selector, name: string): unknown[] {
  if (items === null || items === undefined) return [];
  if (!Array.isArray(items)) throw runtimeError(`${name}() expects an array, got ${describeValue(items)}`);
  if (selector === undefined) return items;
  if (typeof selector === 'string') return items.map((item) => (item === null || item === undefined ? undefined : readProperty(item, selector)));
  if (isTrusted(selector)) return items.map((item, i) => selector(item, i));
  throw runtimeError(`${name}() selector must be a function or a field name`);
}

function numbers(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = v instanceof Date ? v.getTime() : toNumber(v);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Comparable values for min/max: numbers, dates and strings; nullish skipped. */
function extreme(values: unknown[], pick: (a: unknown, b: unknown) => boolean): unknown {
  let best: unknown = null;
  for (const v of values) {
    if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) continue;
    if (best === null || pick(v, best)) best = v;
  }
  return best;
}

function roundTo(value: unknown, decimals: unknown = 0): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  const d = Math.max(-15, Math.min(15, Math.trunc(Number(decimals) || 0)));
  // Round half away from zero, avoiding binary floating point artifacts (1.005 -> 1.01).
  const sign = n < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(n)}e${d}`);
  return sign * Number(`${Math.round(shifted)}e${-d}`);
}

function requireDate(value: unknown, name: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = toDate(value);
  if (!d) throw runtimeError(`${name}() expects a date, got ${describeValue(value)}`);
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  // Clamp to the last day of the target month (Jan 31 + 1 month = Feb 28/29).
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

const DATE_DIFF_UNITS = ['days', 'months', 'years', 'hours', 'minutes', 'seconds'] as const;

function dateDiff(a: Date, b: Date, unit: string): number {
  switch (unit) {
    case 'days':
      // Calendar days, unaffected by daylight saving transitions.
      return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
    case 'months': {
      // Complete months only, like spreadsheet DATEDIF: Jan 31 -> Feb 28 is 0 months.
      let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
      if (months > 0 && b.getDate() < a.getDate()) months--;
      if (months < 0 && b.getDate() > a.getDate()) months++;
      return months;
    }
    case 'years': {
      const months = dateDiff(a, b, 'months');
      return Math.trunc(months / 12);
    }
    case 'hours':
      return Math.trunc((b.getTime() - a.getTime()) / 3_600_000);
    case 'minutes':
      return Math.trunc((b.getTime() - a.getTime()) / 60_000);
    case 'seconds':
      return Math.trunc((b.getTime() - a.getTime()) / 1000);
    default:
      throw runtimeError(`dateDiff() unit must be one of: ${DATE_DIFF_UNITS.join(', ')}`);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function sameValueKey(v: unknown): unknown {
  return v instanceof Date ? `date:${v.getTime()}` : v;
}

function trustAll<T extends Record<string, unknown>>(obj: T): T {
  for (const v of Object.values(obj)) if (typeof v === 'function') markTrusted(v);
  return obj;
}

const SAFE_MATH = Object.freeze(
  trustAll({
    PI: Math.PI,
    E: Math.E,
    abs: (x: unknown) => Math.abs(x as number),
    ceil: (x: unknown) => Math.ceil(x as number),
    floor: (x: unknown) => Math.floor(x as number),
    round: (x: unknown) => Math.round(x as number),
    trunc: (x: unknown) => Math.trunc(x as number),
    sign: (x: unknown) => Math.sign(x as number),
    sqrt: (x: unknown) => Math.sqrt(x as number),
    cbrt: (x: unknown) => Math.cbrt(x as number),
    pow: (x: unknown, y: unknown) => Math.pow(x as number, y as number),
    exp: (x: unknown) => Math.exp(x as number),
    log: (x: unknown) => Math.log(x as number),
    log10: (x: unknown) => Math.log10(x as number),
    log2: (x: unknown) => Math.log2(x as number),
    min: (...xs: unknown[]) => Math.min(...(xs as number[])),
    max: (...xs: unknown[]) => Math.max(...(xs as number[])),
    hypot: (...xs: unknown[]) => Math.hypot(...(xs as number[])),
  }),
);

const cache = new Map<string, Readonly<Record<string, unknown>>>();

/** Built-in functions available to every expression, bound to a locale. */
export function getBuiltins(locale: string = DEFAULT_LOCALE): Readonly<Record<string, unknown>> {
  const cached = cache.get(locale);
  if (cached) return cached;

  const builtins = trustAll({
    Math: SAFE_MATH,

    // -- aggregates ----------------------------------------------------------
    sum: (items: unknown, selector?: Selector) => numbers(select(items, selector, 'sum')).reduce((a, b) => a + b, 0),
    avg: (items: unknown, selector?: Selector) => {
      const ns = numbers(select(items, selector, 'avg'));
      return ns.length === 0 ? null : ns.reduce((a, b) => a + b, 0) / ns.length;
    },
    min: (...args: unknown[]) =>
      Array.isArray(args[0]) || args[0] === null || args[0] === undefined
        ? extreme(select(args[0], args[1] as Selector, 'min'), (a: any, b: any) => a < b)
        : extreme(args, (a: any, b: any) => a < b),
    max: (...args: unknown[]) =>
      Array.isArray(args[0]) || args[0] === null || args[0] === undefined
        ? extreme(select(args[0], args[1] as Selector, 'max'), (a: any, b: any) => a > b)
        : extreme(args, (a: any, b: any) => a > b),
    count: (items: unknown, predicate?: Selector) => {
      if (predicate === undefined) return select(items, undefined, 'count').length;
      return select(items, predicate, 'count').filter(Boolean).length;
    },
    first: (items: unknown, selector?: Selector) => {
      const values = select(items, selector, 'first');
      return values.length ? values[0] : null;
    },
    last: (items: unknown, selector?: Selector) => {
      const values = select(items, selector, 'last');
      return values.length ? values[values.length - 1] : null;
    },
    distinct: (items: unknown, selector?: Selector) => {
      const seen = new Set<unknown>();
      const out: unknown[] = [];
      for (const v of select(items, selector, 'distinct')) {
        const key = sameValueKey(v);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(v);
        }
      }
      return out;
    },

    // -- math ----------------------------------------------------------------
    round: (value: unknown, decimals?: unknown) => roundTo(value, decimals),
    floor: (value: unknown) => {
      const n = toNumber(value);
      return n === null ? null : Math.floor(n);
    },
    ceil: (value: unknown) => {
      const n = toNumber(value);
      return n === null ? null : Math.ceil(n);
    },
    abs: (value: unknown) => {
      const n = toNumber(value);
      return n === null ? null : Math.abs(n);
    },

    // -- text ----------------------------------------------------------------
    upper: (s: unknown) => toDisplayString(s).toUpperCase(),
    lower: (s: unknown) => toDisplayString(s).toLowerCase(),
    trim: (s: unknown) => toDisplayString(s).trim(),
    len: (v: unknown) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      return toDisplayString(v).length;
    },
    left: (s: unknown, n: unknown) => toDisplayString(s).slice(0, Math.max(0, Math.trunc(Number(n) || 0))),
    right: (s: unknown, n: unknown) => {
      const str = toDisplayString(s);
      const count = Math.max(0, Math.trunc(Number(n) || 0));
      return count === 0 ? '' : str.slice(-count);
    },

    // -- conversion and logic ------------------------------------------------
    string: (v: unknown) => toDisplayString(v),
    number: (v: unknown) => toNumber(v),
    isNull: (v: unknown) => v === null || v === undefined,
    isEmpty: (v: unknown) => {
      if (v === null || v === undefined || v === '') return true;
      if (Array.isArray(v)) return v.length === 0;
      if (isPlainObject(v)) return Object.keys(v).length === 0;
      return false;
    },
    coalesce: (...values: unknown[]) => values.find((v) => v !== null && v !== undefined) ?? null,
    iif: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),

    // -- dates ---------------------------------------------------------------
    now: () => new Date(),
    today: () => startOfDay(new Date()),
    date: (...args: unknown[]) => {
      if (args.length >= 2) {
        const [y, m, d = 1, hh = 0, mm = 0, ss = 0] = args.map((a) => Number(a));
        const result = new Date(y!, m! - 1, d, hh, mm, ss);
        return Number.isNaN(result.getTime()) ? null : result;
      }
      return toDate(args[0]);
    },
    year: (v: unknown) => requireDate(v, 'year')?.getFullYear() ?? null,
    month: (v: unknown) => {
      const d = requireDate(v, 'month');
      return d ? d.getMonth() + 1 : null;
    },
    day: (v: unknown) => requireDate(v, 'day')?.getDate() ?? null,
    addDays: (v: unknown, n: unknown) => {
      const d = requireDate(v, 'addDays');
      if (!d) return null;
      const result = new Date(d.getTime());
      result.setDate(result.getDate() + Math.trunc(Number(n) || 0));
      return result;
    },
    addMonths: (v: unknown, n: unknown) => {
      const d = requireDate(v, 'addMonths');
      return d ? addMonths(d, Math.trunc(Number(n) || 0)) : null;
    },
    dateDiff: (a: unknown, b: unknown, unit: unknown = 'days') => {
      const da = requireDate(a, 'dateDiff');
      const db = requireDate(b, 'dateDiff');
      if (!da || !db) return null;
      return dateDiff(da, db, String(unit));
    },

    // -- formatting ----------------------------------------------------------
    format: (v: unknown, fmt: unknown) => {
      if (typeof fmt === 'string') {
        const d = toDate(v);
        return d ? formatDate(d, fmt, locale) : toDisplayString(v);
      }
      if (fmt === undefined || fmt === null) return toDisplayString(v);
      if (!isPlainObject(fmt)) throw runtimeError('format() expects a date pattern or a format object');
      return formatValue(v, fmt as unknown as ValueFormat, locale);
    },
    formatNumber: (v: unknown, decimals?: unknown, thousandsSeparator: unknown = true) => {
      const n = toNumber(v);
      if (n === null) return toDisplayString(v);
      return formatNumber(
        n,
        { decimals: decimals === undefined ? undefined : Number(decimals), thousandsSeparator: Boolean(thousandsSeparator) },
        locale,
      );
    },
    formatCurrency: (v: unknown, currency: unknown, decimals?: unknown) => {
      const n = toNumber(v);
      if (n === null) return toDisplayString(v);
      if (typeof currency !== 'string') throw runtimeError('formatCurrency() expects a currency code');
      return formatCurrency(n, currency, decimals === undefined ? undefined : Number(decimals), locale);
    },
    formatPercent: (v: unknown, decimals: unknown = 0) => {
      const n = toNumber(v);
      return n === null ? toDisplayString(v) : formatPercent(n, Number(decimals), locale);
    },
    formatDate: (v: unknown, pattern: unknown = 'yyyy-MM-dd') => {
      const d = toDate(v);
      return d ? formatDate(d, String(pattern), locale) : toDisplayString(v);
    },
    toWords: (v: unknown) => {
      const n = toNumber(v);
      return n === null ? '' : numberToWords(n);
    },
    toCurrencyWords: (v: unknown, currencyName: unknown = '', centsName: unknown = 'Cents') => {
      const n = toNumber(v);
      if (n === null) return '';
      return currencyToWords(n, toDisplayString(currencyName), toDisplayString(centsName));
    },
  });

  const frozen = Object.freeze(builtins);
  if (cache.size > 50) cache.clear();
  cache.set(locale, frozen);
  return frozen;
}

/** Names of all built-in functions, for editor autocompletion. */
export const BUILTIN_NAMES: readonly string[] = Object.freeze(Object.keys(getBuiltins()));
