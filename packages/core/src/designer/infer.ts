import type { FieldDefinition, FieldType } from '../model/types';
import { toDate } from '../format/format';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function typeOf(value: unknown): FieldType {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return ISO_DATE.test(value) && toDate(value) ? 'date' : 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

function merge(a: FieldType, b: FieldType): FieldType {
  if (a === b || b === 'unknown') return a;
  if (a === 'unknown') return b;
  // Dates written as plain strings in some rows stay strings.
  if ((a === 'date' && b === 'string') || (a === 'string' && b === 'date')) return 'string';
  return 'unknown';
}

/**
 * Infers a field schema from sample rows. Looks at up to `sampleSize` rows,
 * merges field types across rows and recurses into objects and arrays of
 * objects (up to `maxDepth` levels).
 */
export function inferFields(rows: unknown, sampleSize = 100, maxDepth = 4): FieldDefinition[] {
  const list = Array.isArray(rows) ? rows : rows === null || rows === undefined ? [] : [rows];
  return inferFromObjects(list.slice(0, sampleSize), maxDepth);
}

function inferFromObjects(values: unknown[], depth: number): FieldDefinition[] {
  const order: string[] = [];
  const samples = new Map<string, unknown[]>();
  for (const v of values) {
    if (typeof v !== 'object' || v === null || Array.isArray(v) || v instanceof Date) continue;
    for (const [key, value] of Object.entries(v)) {
      if (!samples.has(key)) {
        samples.set(key, []);
        order.push(key);
      }
      samples.get(key)!.push(value);
    }
  }
  return order.map((name) => {
    const vals = samples.get(name)!;
    const type = vals.map(typeOf).reduce(merge, 'unknown' as FieldType);
    const field: FieldDefinition = { name, type };
    if (depth > 1) {
      if (type === 'object') {
        const nested = inferFromObjects(vals, depth - 1);
        if (nested.length) field.fields = nested;
      } else if (type === 'array') {
        const nested = inferFromObjects(vals.flatMap((v) => (Array.isArray(v) ? v.slice(0, 50) : [])), depth - 1);
        if (nested.length) field.fields = nested;
      }
    }
    return field;
  });
}

/** True for identifiers that can be written as `a.b`; other names need `a["b"]`. */
export function isIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/** Builds an expression that reads `path` (list of field names) from `root`. */
export function fieldExpression(root: string, path: string[]): string {
  return path.reduce((expr, key) => (isIdentifier(key) ? `${expr}.${key}` : `${expr}[${JSON.stringify(key)}]`), root);
}
