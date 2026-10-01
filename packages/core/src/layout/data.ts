import { toDate } from '../format/format';

/** Reads a dot path ("sales.orders") from a value using own properties only. */
export function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Normalises a data source value to an array of rows. */
export function toRows(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function rank(v: unknown): number {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number' || typeof v === 'bigint') return 2;
  if (v instanceof Date) return 3;
  if (typeof v === 'string') return 4;
  return 5;
}

const collators = new Map<string, Intl.Collator>();

function collator(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { numeric: true, sensitivity: 'variant' });
    collators.set(locale, c);
  }
  return c;
}

/**
 * Total order used for sorting and grouping: nullish values first, then
 * booleans, numbers, dates and strings (locale-aware), then everything else.
 */
export function compareValues(a: unknown, b: unknown, locale = 'en-US'): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 0:
      return 0;
    case 1:
      return Number(a) - Number(b);
    case 2:
      return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
    case 3:
      return (a as Date).getTime() - (b as Date).getTime();
    case 4:
      return collator(locale).compare(a as string, b as string);
    default:
      return 0;
  }
}

/** Equality used to detect group boundaries. Dates compare by time. */
export function sameGroupKey(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}

/**
 * Converts ISO date strings to Dates for comparison purposes, so that
 * "2026-01-05" and "2026-01-05T00:00" sort together.
 */
export function sortKey(v: unknown): unknown {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = toDate(v);
    if (d) return d;
  }
  return v;
}
