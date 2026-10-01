import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateExpression as ev,
  ExpressionError,
  MAX_ARRAY_LENGTH,
  MAX_STRING_LENGTH,
} from '../../src/expressions';

/**
 * Sandbox escape attempts. Every one of these must throw an ExpressionError
 * (or return a harmless value) and must never reach a real Function
 * constructor, global object or prototype.
 */
describe('sandbox: prototype and constructor access', () => {
  const scope = { row: { name: 'x' }, list: [1, 2], text: 'abc', n: 5, d: new Date() };

  it.each([
    'row.constructor',
    'row["constructor"]',
    'row.__proto__',
    'row["__pro" + "to__"]',
    'list.constructor',
    'text.constructor',
    'n.constructor',
    'd.constructor',
    '(x => x).constructor',
    'row.prototype',
    'row.__defineGetter__',
    'row.__lookupGetter__',
    'constructor',
    '__proto__',
  ])('blocks %s', (source) => {
    expect(() => ev(source, scope)).toThrow(/not allowed/);
  });

  it.each([
    'text.constructor("return this")()',
    'list.map.constructor("return process")()',
    '"".sub.call.call',
    '[].map["constructor"]',
    'row.constructor.constructor("return globalThis")()',
    '(() => 1).constructor("return globalThis")()',
    'Math.constructor',
    'Math.round.constructor',
  ])('cannot reach a Function constructor via %s', (source) => {
    expect(() => ev(source, scope)).toThrow(ExpressionError);
  });

  it('does not see inherited Object.prototype members', () => {
    expect(ev('row.hasOwnProperty', scope)).toBeUndefined();
    expect(ev('row.toString', scope)).toBeUndefined();
    expect(ev('row.valueOf', scope)).toBeUndefined();
    expect(() => ev('row.toString()', scope)).toThrow(/not an allowed method/);
    expect(() => ev('row.hasOwnProperty("name")', scope)).toThrow(/not an allowed method/);
  });

  it('does not expose array or string prototype methods as values', () => {
    expect(ev('list.map', scope)).toBeUndefined();
    expect(ev('text.toUpperCase', scope)).toBeUndefined();
  });

  it('cannot call apply/call/bind on lambdas', () => {
    expect(() => ev('(x => x).call(null, 1)')).toThrow(/not an allowed method/);
    expect(() => ev('(x => x).bind(null)')).toThrow(/not an allowed method/);
  });

  it('cannot pollute Object.prototype via object literals', () => {
    expect(() => ev('{ __proto__: { polluted: 1 } }')).toThrow(/__proto__/);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('cannot reassign anything', () => {
    expect(() => ev('row.name = "y"', scope)).toThrow(/Assignment/);
    expect(scope.row.name).toBe('x');
  });
});

describe('sandbox: functions in data', () => {
  const evil = () => 'host code ran';

  it('refuses to call functions stored in data', () => {
    expect(() => ev('row.fn()', { row: { fn: evil } })).toThrow(/function from the data/);
    expect(() => ev('row["fn"]()', { row: { fn: evil } })).toThrow(/function from the data/);
  });

  it('refuses to read functions stored in data', () => {
    expect(() => ev('row.fn', { row: { fn: evil } })).toThrow(/function from the data/);
    expect(() => ev('list[0]', { list: [evil] })).toThrow(/function from the data/);
  });

  it('refuses to smuggle data functions into callbacks', () => {
    expect(() => ev('[1].map(row.fn)', { row: { fn: evil } })).toThrow(ExpressionError);
  });

  it('refuses top-level scope functions', () => {
    expect(() => ev('fn()', { fn: evil })).toThrow(/register it with the "functions" option/);
  });

  it('refuses to call non-functions', () => {
    expect(() => ev('row.name()', { row: { name: 'x' } })).toThrow(/not an allowed method on string|not an allowed method/);
    expect(() => ev('(1)()')).toThrow(/not a function/);
    expect(() => ev('x()', { x: 5 })).toThrow(/"x" is not a function/);
  });
});

describe('sandbox: resource limits', () => {
  it('stops infinite recursion via the call depth limit', () => {
    expect(() => ev('(f => f(f))(f => f(f))')).toThrow(/maximum call depth/);
  });

  it('honours a custom maxDepth', () => {
    expect(() => ev('(f => f(f, 0))((f, n) => n > 5 ? n : f(f, n + 1))', {}, { maxDepth: 3 })).toThrow(/maximum call depth of 3/);
    expect(ev('(f => f(f, 0))((f, n) => n > 5 ? n : f(f, n + 1))', {}, { maxDepth: 10 })).toBe(6);
  });

  it('stops runaway work via the step limit', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    expect(() => ev('rows.map(a => rows.map(b => a * b))', { rows }, { maxSteps: 10_000 })).toThrow(/evaluation steps/);
  });

  it('resets the step budget for every evaluation', () => {
    for (let i = 0; i < 3; i++) expect(ev('1 + 1', {}, { maxSteps: 10 })).toBe(2);
  });

  it('caps string growth', () => {
    expect(() => ev(`"a".repeat(${MAX_STRING_LENGTH + 1})`)).toThrow(/String result exceeds/);
    expect(() => ev(`"a".padStart(${MAX_STRING_LENGTH + 1})`)).toThrow(/length exceeds/);
    expect(() => ev('s + s', { s: 'x'.repeat(MAX_STRING_LENGTH / 2 + 1) })).toThrow(/String result exceeds/);
    expect(() => ev('`${s}${s}`', { s: 'x'.repeat(MAX_STRING_LENGTH / 2 + 1) })).toThrow(/String result exceeds/);
    expect(() => ev('s.replaceAll("x", "yy")', { s: 'x'.repeat(MAX_STRING_LENGTH / 2 + 1) })).toThrow(/String result exceeds/);
    expect(() => ev('a.join(s)', { a: [1, 2, 3], s: 'x'.repeat(MAX_STRING_LENGTH / 2 + 1) })).toThrow(/String result exceeds/);
  });

  it('caps array growth', () => {
    const big = new Array(MAX_ARRAY_LENGTH / 2 + 1).fill(0);
    expect(() => ev('a.concat(a)', { a: big })).toThrow(/Array result exceeds/);
    expect(() => ev('a.flatMap(x => [x, x])', { a: big }, { maxSteps: 100_000_000 })).toThrow(/Array result exceeds/);
    expect(() => ev('[a, a].flat()', { a: big })).toThrow(/Array result exceeds/);
  });

  it('rejects negative repeat counts', () => {
    expect(() => ev('"a".repeat(-1)')).toThrow(/non-negative/);
  });
});

describe('sandbox: no side effects on globals', () => {
  afterEach(() => {
    delete (globalThis as any).__leak;
  });

  it('cannot create or read globals', () => {
    (globalThis as any).__leak = 'secret';
    expect(() => ev('__leak')).toThrow(/is not defined/);
  });

  it('frozen built-ins cannot be mutated through results', () => {
    const math = ev('Math') as Record<string, unknown>;
    expect(Object.isFrozen(math)).toBe(true);
  });
});
