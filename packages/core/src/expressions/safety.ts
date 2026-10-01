import { ExpressionError } from './errors';

/** Upper bound on the length of strings produced by expressions. */
export const MAX_STRING_LENGTH = 1_000_000;
/** Upper bound on the length of arrays produced by expressions. */
export const MAX_ARRAY_LENGTH = 1_000_000;

/** Property names that are never readable, on any value. */
export const DENIED_PROPERTIES: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * Functions that expressions may call: sandbox lambdas, built-ins and
 * functions registered by the host. Everything else (including functions
 * found inside data) is rejected.
 */
const trusted = new WeakSet<Function>();

export function markTrusted<T extends Function>(fn: T): T {
  trusted.add(fn);
  return fn;
}

export function isTrusted(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function' && trusted.has(value);
}

/** Raised for runtime failures. Carries no position. */
export function runtimeError(message: string): ExpressionError {
  return new ExpressionError(message, '');
}

export function checkStringLength(s: string): string {
  if (s.length > MAX_STRING_LENGTH) throw runtimeError(`String result exceeds ${MAX_STRING_LENGTH} characters`);
  return s;
}

export function checkArrayLength<T>(a: T[]): T[] {
  if (a.length > MAX_ARRAY_LENGTH) throw runtimeError(`Array result exceeds ${MAX_ARRAY_LENGTH} elements`);
  return a;
}

export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value;
}

/**
 * Reads a property in the sandbox. Only own properties of objects, array
 * indices/length and string indices/length are visible. Never walks the
 * prototype chain and never returns untrusted functions.
 */
export function readProperty(target: unknown, rawKey: unknown): unknown {
  const key = propertyKey(rawKey);
  if (target === null || target === undefined) {
    throw runtimeError(`Cannot read property "${key}" of ${target === null ? 'null' : 'undefined'}`);
  }
  if (DENIED_PROPERTIES.has(key)) throw runtimeError(`Access to "${key}" is not allowed`);

  if (typeof target === 'string') {
    if (key === 'length') return target.length;
    return isIndex(key) ? target[Number(key)] : undefined;
  }
  if (Array.isArray(target)) {
    if (key === 'length') return target.length;
    return isIndex(key) ? guardValue(target[Number(key)], key) : undefined;
  }
  if (typeof target === 'object' || typeof target === 'function') {
    if (target instanceof Date) return undefined;
    if (!Object.hasOwn(target, key)) return undefined;
    return guardValue((target as Record<string, unknown>)[key], key);
  }
  // numbers, booleans, bigints and symbols expose no properties
  return undefined;
}

function guardValue(value: unknown, key: string): unknown {
  if (typeof value === 'function' && !isTrusted(value)) {
    throw runtimeError(`"${key}" is a function from the data and cannot be used`);
  }
  return value;
}

export function propertyKey(rawKey: unknown): string {
  if (typeof rawKey === 'string') return rawKey;
  if (typeof rawKey === 'number') return String(rawKey);
  if (typeof rawKey === 'boolean' || rawKey === null || rawKey === undefined) return String(rawKey);
  throw runtimeError(`Invalid property key of type ${describeValue(rawKey)}`);
}

function isIndex(key: string): boolean {
  return /^(0|[1-9]\d*)$/.test(key);
}
