import {
  checkArrayLength,
  checkStringLength,
  describeValue,
  isTrusted,
  MAX_STRING_LENGTH,
  runtimeError,
} from './safety';

/** A method implementation: receives the target and the evaluated arguments. */
export type Method = (target: never, args: unknown[]) => unknown;

type Fn = (...args: unknown[]) => unknown;

function fnArg(args: unknown[], index: number, method: string): Fn {
  const fn = args[index];
  if (!isTrusted(fn)) throw runtimeError(`${method}() expects a function argument`);
  return fn;
}

function strArg(args: unknown[], index: number, method: string, fallback?: string): string {
  const v = args[index];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'string') throw runtimeError(`${method}() expects a string argument`);
  return v;
}

function intArg(args: unknown[], index: number, fallback?: number): number | undefined {
  const v = args[index];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : Math.trunc(n);
}

function lengthArg(args: unknown[], index: number, method: string): number {
  const n = intArg(args, index, 0)!;
  if (n > MAX_STRING_LENGTH) throw runtimeError(`${method}() length exceeds ${MAX_STRING_LENGTH}`);
  return n;
}

function joinArray(target: unknown[], separator: string): string {
  let out = '';
  for (let i = 0; i < target.length; i++) {
    const v = target[i];
    const piece = (i > 0 ? separator : '') + (v === null || v === undefined ? '' : String(v));
    if (out.length + piece.length > MAX_STRING_LENGTH) checkStringLength(out + piece);
    out += piece;
  }
  return out;
}

function safeReplace(target: string, args: unknown[], all: boolean, method: string): string {
  const pattern = strArg(args, 0, method);
  const replacement = args[1];
  if (typeof replacement === 'string') {
    const occurrences = pattern === '' ? target.length + 1 : target.split(pattern).length - 1;
    const replaced = all ? occurrences : Math.min(occurrences, 1);
    const estimate = target.length + replaced * (replacement.length - pattern.length);
    if (estimate > MAX_STRING_LENGTH) throw runtimeError(`String result exceeds ${MAX_STRING_LENGTH} characters`);
    // Use a function replacer so "$&"-style patterns in the replacement are literal.
    const literal = () => replacement;
    return all ? target.replaceAll(pattern, literal) : target.replace(pattern, literal);
  }
  const fn = fnArg(args, 1, method);
  const replacer = (match: string) => String(fn(match));
  return checkStringLength(all ? target.replaceAll(pattern, replacer) : target.replace(pattern, replacer));
}

const STRING_METHODS: Record<string, (s: string, args: unknown[]) => unknown> = {
  toUpperCase: (s) => s.toUpperCase(),
  toLowerCase: (s) => s.toLowerCase(),
  trim: (s) => s.trim(),
  trimStart: (s) => s.trimStart(),
  trimEnd: (s) => s.trimEnd(),
  slice: (s, a) => s.slice(intArg(a, 0), intArg(a, 1)),
  substring: (s, a) => s.substring(intArg(a, 0, 0)!, intArg(a, 1)),
  charAt: (s, a) => s.charAt(intArg(a, 0, 0)!),
  at: (s, a) => s.at(intArg(a, 0, 0)!),
  indexOf: (s, a) => s.indexOf(strArg(a, 0, 'indexOf'), intArg(a, 1)),
  lastIndexOf: (s, a) => s.lastIndexOf(strArg(a, 0, 'lastIndexOf'), intArg(a, 1)),
  includes: (s, a) => s.includes(strArg(a, 0, 'includes'), intArg(a, 1)),
  startsWith: (s, a) => s.startsWith(strArg(a, 0, 'startsWith'), intArg(a, 1)),
  endsWith: (s, a) => s.endsWith(strArg(a, 0, 'endsWith'), intArg(a, 1)),
  split: (s, a) => (a[0] === undefined ? [s] : s.split(strArg(a, 0, 'split'), intArg(a, 1))),
  replace: (s, a) => safeReplace(s, a, false, 'replace'),
  replaceAll: (s, a) => safeReplace(s, a, true, 'replaceAll'),
  padStart: (s, a) => s.padStart(lengthArg(a, 0, 'padStart'), strArg(a, 1, 'padStart', ' ')),
  padEnd: (s, a) => s.padEnd(lengthArg(a, 0, 'padEnd'), strArg(a, 1, 'padEnd', ' ')),
  repeat: (s, a) => {
    const n = intArg(a, 0, 0)!;
    if (n < 0) throw runtimeError('repeat() count must be non-negative');
    if (s.length * n > MAX_STRING_LENGTH) throw runtimeError(`String result exceeds ${MAX_STRING_LENGTH} characters`);
    return s.repeat(n);
  },
  concat: (s, a) => checkStringLength(s.concat(...a.map((v) => String(v)))),
  localeCompare: (s, a) => s.localeCompare(strArg(a, 0, 'localeCompare'), a[1] === undefined ? undefined : strArg(a, 1, 'localeCompare')),
  toString: (s: string) => s,
};

const NUMBER_METHODS: Record<string, (n: number, args: unknown[]) => unknown> = {
  toFixed: (n, a) => n.toFixed(intArg(a, 0, 0)),
  toPrecision: (n, a) => (a[0] === undefined ? n.toPrecision() : n.toPrecision(intArg(a, 0))),
  toString: (n: number, a: unknown[]) => n.toString(intArg(a, 0, 10)),
};

const BOOLEAN_METHODS: Record<string, (b: boolean, args: unknown[]) => unknown> = {
  toString: (b: boolean) => String(b),
};

function sortCopy(arr: unknown[], args: unknown[], method: string): unknown[] {
  const copy = arr.slice();
  if (args[0] === undefined) return copy.sort();
  const fn = fnArg(args, 0, method);
  return copy.sort((x, y) => Number(fn(x, y)) || 0);
}

const ARRAY_METHODS: Record<string, (arr: unknown[], args: unknown[]) => unknown> = {
  map: (arr, a) => {
    const fn = fnArg(a, 0, 'map');
    return arr.map((v, i) => fn(v, i));
  },
  filter: (arr, a) => {
    const fn = fnArg(a, 0, 'filter');
    return arr.filter((v, i) => fn(v, i));
  },
  find: (arr, a) => {
    const fn = fnArg(a, 0, 'find');
    return arr.find((v, i) => fn(v, i));
  },
  findIndex: (arr, a) => {
    const fn = fnArg(a, 0, 'findIndex');
    return arr.findIndex((v, i) => fn(v, i));
  },
  findLast: (arr, a) => {
    const fn = fnArg(a, 0, 'findLast');
    return arr.findLast((v, i) => fn(v, i));
  },
  findLastIndex: (arr, a) => {
    const fn = fnArg(a, 0, 'findLastIndex');
    return arr.findLastIndex((v, i) => fn(v, i));
  },
  some: (arr, a) => {
    const fn = fnArg(a, 0, 'some');
    return arr.some((v, i) => fn(v, i));
  },
  every: (arr, a) => {
    const fn = fnArg(a, 0, 'every');
    return arr.every((v, i) => fn(v, i));
  },
  reduce: (arr, a) => {
    const fn = fnArg(a, 0, 'reduce');
    if (a.length < 2) {
      if (arr.length === 0) throw runtimeError('reduce() of an empty array needs an initial value');
      return arr.reduce((acc, v, i) => fn(acc, v, i));
    }
    return arr.reduce((acc, v, i) => fn(acc, v, i), a[1]);
  },
  flatMap: (arr, a) => {
    const fn = fnArg(a, 0, 'flatMap');
    return checkArrayLength(arr.flatMap((v, i) => fn(v, i)));
  },
  includes: (arr, a) => arr.includes(a[0]),
  indexOf: (arr, a) => arr.indexOf(a[0]),
  lastIndexOf: (arr, a) => arr.lastIndexOf(a[0]),
  join: (arr, a) => joinArray(arr, a[0] === undefined ? ',' : String(a[0])),
  slice: (arr, a) => arr.slice(intArg(a, 0), intArg(a, 1)),
  at: (arr, a) => arr.at(intArg(a, 0, 0)!),
  concat: (arr, a) => {
    let size = arr.length;
    for (const v of a) size += Array.isArray(v) ? v.length : 1;
    if (size > 1_000_000) checkArrayLength({ length: size } as unknown[]);
    return arr.concat(...a);
  },
  flat: (arr, a) => checkArrayLength(arr.flat(Math.min(intArg(a, 0, 1)!, 10))),
  // Never mutate data: reverse/sort return new arrays.
  reverse: (arr) => arr.slice().reverse(),
  toReversed: (arr) => arr.slice().reverse(),
  sort: (arr, a) => sortCopy(arr, a, 'sort'),
  toSorted: (arr, a) => sortCopy(arr, a, 'toSorted'),
};

function localeArg(args: unknown[]): string | undefined {
  const v = args[0];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw runtimeError('locale must be a string');
  return v;
}

const DATE_METHODS: Record<string, (d: Date, args: unknown[]) => unknown> = {
  getFullYear: (d) => d.getFullYear(),
  getMonth: (d) => d.getMonth(),
  getDate: (d) => d.getDate(),
  getDay: (d) => d.getDay(),
  getHours: (d) => d.getHours(),
  getMinutes: (d) => d.getMinutes(),
  getSeconds: (d) => d.getSeconds(),
  getMilliseconds: (d) => d.getMilliseconds(),
  getTime: (d) => d.getTime(),
  valueOf: (d: Date) => d.getTime(),
  toISOString: (d) => d.toISOString(),
  toLocaleDateString: (d, a) => d.toLocaleDateString(localeArg(a)),
  toLocaleTimeString: (d, a) => d.toLocaleTimeString(localeArg(a)),
  toLocaleString: (d: Date, a: unknown[]) => d.toLocaleString(localeArg(a)),
};

function lookup<T>(table: Record<string, T>, name: string): T | undefined {
  return Object.hasOwn(table, name) ? table[name] : undefined;
}

/**
 * Resolves an allowed method for a target value, or undefined when the value
 * has no such method. The caller handles own trusted function properties.
 */
export function resolveMethod(target: unknown, name: string): ((args: unknown[]) => unknown) | undefined {
  if (typeof target === 'string') {
    const m = lookup(STRING_METHODS, name);
    return m && ((args) => m(target, args));
  }
  if (typeof target === 'number') {
    const m = lookup(NUMBER_METHODS, name);
    return m && ((args) => m(target, args));
  }
  if (typeof target === 'boolean') {
    const m = lookup(BOOLEAN_METHODS, name);
    return m && ((args) => m(target, args));
  }
  if (Array.isArray(target)) {
    const m = lookup(ARRAY_METHODS, name);
    return m && ((args) => m(target, args));
  }
  if (target instanceof Date) {
    const m = lookup(DATE_METHODS, name);
    return m && ((args) => m(target, args));
  }
  return undefined;
}

export function describeMethodTarget(target: unknown): string {
  return describeValue(target);
}
