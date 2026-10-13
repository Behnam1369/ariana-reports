import type { ValueFormat } from '../model/types';

export const DEFAULT_LOCALE = 'en-US';

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts a value to a Date. Accepts Date objects, epoch milliseconds and
 * date strings. Date-only ISO strings ("2026-03-01") are read as local
 * midnight, not UTC, so they do not shift by a day in western time zones.
 * Returns null when the value is not a valid date.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Date(value);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return null;
    const m = ISO_DATE_ONLY.exec(s);
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const date = new Date(y, mo - 1, d);
      // Reject impossible dates such as 2026-02-31.
      if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
      return date;
    }
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  return null;
}

/** Converts a value to a finite number, or returns null. Numeric strings are accepted. */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

// Intl formatters are relatively expensive to create; cache them.
const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numberFormatCache.get(key);
  if (!f) {
    if (numberFormatCache.size > 500) numberFormatCache.clear();
    f = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, f);
  }
  return f;
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dateFormatCache.get(key);
  if (!f) {
    if (dateFormatCache.size > 500) dateFormatCache.clear();
    f = new Intl.DateTimeFormat(locale, options);
    dateFormatCache.set(key, f);
  }
  return f;
}

function clampDecimals(decimals: number | undefined): number | undefined {
  if (decimals === undefined) return undefined;
  return Math.min(20, Math.max(0, Math.trunc(decimals)));
}

export interface NumberFormatOptions {
  decimals?: number;
  /** Defaults to true. */
  thousandsSeparator?: boolean;
  prefix?: string;
  suffix?: string;
}

export function formatNumber(value: number, options: NumberFormatOptions = {}, locale = DEFAULT_LOCALE): string {
  const decimals = clampDecimals(options.decimals);
  const f = numberFormatter(locale, {
    useGrouping: options.thousandsSeparator !== false,
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 10,
  });
  return `${options.prefix ?? ''}${f.format(value)}${options.suffix ?? ''}`;
}

export function formatCurrency(value: number, currency: string, decimals?: number, locale = DEFAULT_LOCALE): string {
  const d = clampDecimals(decimals);
  const options: Intl.NumberFormatOptions = { style: 'currency', currency };
  if (d !== undefined) {
    options.minimumFractionDigits = d;
    options.maximumFractionDigits = d;
  }
  return numberFormatter(locale, options).format(value);
}

/** Formats a ratio as a percentage: 0.25 -> "25%". */
export function formatPercent(value: number, decimals = 0, locale = DEFAULT_LOCALE): string {
  const d = clampDecimals(decimals) ?? 0;
  return numberFormatter(locale, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

const DATE_TOKEN = /'(?:[^']|'')*'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|SSS|a/g;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Digits of the locale's default numbering system ("۰۱۲۳۴۵۶۷۸۹" for fa-IR), or null for Latin digits. */
function localDigits(locale: string): string | null {
  let sample: string;
  try {
    sample = numberFormatter(locale, { useGrouping: false }).format(9876543210);
  } catch {
    return null;
  }
  if (sample === '9876543210') return null;
  const digits = [...sample].reverse();
  return digits.length === 10 ? digits.join('') : null;
}

/** Year, month (1-12) and day of a date in a calendar. Gregorian dates use the local date components. */
function calendarFields(value: Date, locale: string, calendar: string | undefined): { year: number; month: number; day: number } {
  if (!calendar || calendar === 'gregory') return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  const parts = dateFormatter(locale, { calendar, numberingSystem: 'latn', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(value);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // "relatedYear" is how Intl reports the year of calendars with cyclic year names.
  const year = Number.isFinite(get('year')) ? get('year') : get('relatedYear');
  return { year, month: get('month'), day: get('day') };
}

/**
 * Formats a date with a pattern. Supported tokens:
 * yyyy yy MMMM MMM MM M dd d EEEE EEE HH H hh h mm m ss s SSS a.
 * Text in single quotes is literal; '' is a literal quote.
 *
 * Month and weekday names follow `locale`. Numbers use the locale's digits
 * (Persian digits for fa-IR). `calendar` selects the calendar of the year,
 * month and day tokens; the default is Gregorian, whatever the locale's own
 * default calendar is.
 */
export function formatDate(value: Date, pattern: string, locale = DEFAULT_LOCALE, calendar?: string): string {
  const cal = calendar && calendar !== 'gregory' ? calendar : 'gregory';
  const fields = calendarFields(value, locale, cal);
  const digits = localDigits(locale);
  const num = (n: number, width = 1): string => {
    const text = pad(n, width);
    return digits ? text.replace(/\d/g, (d) => digits[Number(d)]!) : text;
  };
  const named = (options: Intl.DateTimeFormatOptions) => dateFormatter(locale, { calendar: cal, ...options }).format(value);
  return pattern.replace(DATE_TOKEN, (token) => {
    switch (token) {
      case 'yyyy':
        return num(fields.year, 4);
      case 'yy':
        return num(fields.year % 100, 2);
      case 'MMMM':
        return named({ month: 'long' });
      case 'MMM':
        return named({ month: 'short' });
      case 'MM':
        return num(fields.month, 2);
      case 'M':
        return num(fields.month);
      case 'dd':
        return num(fields.day, 2);
      case 'd':
        return num(fields.day);
      case 'EEEE':
        return dateFormatter(locale, { weekday: 'long' }).format(value);
      case 'EEE':
        return dateFormatter(locale, { weekday: 'short' }).format(value);
      case 'HH':
        return num(value.getHours(), 2);
      case 'H':
        return num(value.getHours());
      case 'hh':
        return num(value.getHours() % 12 || 12, 2);
      case 'h':
        return num(value.getHours() % 12 || 12);
      case 'mm':
        return num(value.getMinutes(), 2);
      case 'm':
        return num(value.getMinutes());
      case 'ss':
        return num(value.getSeconds(), 2);
      case 's':
        return num(value.getSeconds());
      case 'SSS':
        return num(value.getMilliseconds(), 3);
      case 'a': {
        const part = dateFormatter(locale, { hour: 'numeric', hour12: true })
          .formatToParts(value)
          .find((p) => p.type === 'dayPeriod');
        return part?.value ?? (value.getHours() < 12 ? 'AM' : 'PM');
      }
      default:
        // Quoted literal.
        return token.slice(1, -1).replace(/''/g, "'");
    }
  });
}

/** Default conversion of an arbitrary value to display text. */
export function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isNaN(value) ? '' : String(value);
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const hasTime =
      value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0 || value.getMilliseconds() !== 0;
    return formatDate(value, hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  if (Array.isArray(value)) return value.map(toDisplayString).join(', ');
  if (typeof value === 'function') return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/**
 * Formats a value with a template `ValueFormat`. Values that cannot be
 * converted (e.g. text with a number format) fall back to `toDisplayString`.
 */
export function formatValue(value: unknown, format: ValueFormat | undefined, locale = DEFAULT_LOCALE): string {
  if (value === null || value === undefined || value === '') return '';
  if (!format) return toDisplayString(value);
  if (format.type === 'date') {
    const d = toDate(value);
    return d ? formatDate(d, format.pattern, locale, format.calendar) : toDisplayString(value);
  }
  const n = typeof value === 'boolean' ? null : toNumber(value);
  if (n === null) return toDisplayString(value);
  switch (format.type) {
    case 'number':
      return formatNumber(n, format, locale);
    case 'currency':
      return formatCurrency(n, format.currency, format.decimals, locale);
    case 'percent':
      return formatPercent(n, format.decimals, locale);
    default:
      return toDisplayString(value);
  }
}
