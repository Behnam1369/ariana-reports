import { describe, expect, it } from 'vitest';
import { BUILTIN_NAMES, evaluateExpression as ev, getBuiltins } from '../../src/expressions';

const rows = [
  { name: 'a', total: 10, qty: 1, date: '2026-01-05' },
  { name: 'b', total: 25.5, qty: null, date: '2026-03-01' },
  { name: 'a', total: 4.5, qty: 3, date: '2025-12-31' },
];

describe('aggregates', () => {
  it('sum', () => {
    expect(ev('sum(rows, r => r.total)', { rows })).toBe(40);
    expect(ev('sum(rows, "total")', { rows })).toBe(40);
    expect(ev('sum([1, "2", null, "x", 3])')).toBe(6);
    expect(ev('sum([])')).toBe(0);
    expect(ev('sum(missing)', { missing: null })).toBe(0);
  });

  it('avg skips non-numeric values and returns null when empty', () => {
    expect(ev('avg(rows, "qty")', { rows })).toBe(2);
    expect(ev('avg([])')).toBeNull();
  });

  it('min / max over arrays and as variadic', () => {
    expect(ev('min(rows, r => r.total)', { rows })).toBe(4.5);
    expect(ev('max(rows, "total")', { rows })).toBe(25.5);
    expect(ev('min(3, 1, 2)')).toBe(1);
    expect(ev('max(3, 1, 2)')).toBe(3);
    expect(ev('max(["b", "c", "a"])')).toBe('c');
    expect(ev('min([])')).toBeNull();
    expect(ev('max(rows, "qty")', { rows })).toBe(3);
  });

  it('count with and without a predicate', () => {
    expect(ev('count(rows)', { rows })).toBe(3);
    expect(ev('count(rows, r => r.total > 5)', { rows })).toBe(2);
  });

  it('first / last / distinct', () => {
    expect(ev('first(rows, "name")', { rows })).toBe('a');
    expect(ev('last(rows).total', { rows })).toBe(4.5);
    expect(ev('first([])')).toBeNull();
    expect(ev('distinct(rows, "name")', { rows })).toEqual(['a', 'b']);
    expect(ev('distinct([1, 1, "1"])')).toEqual([1, '1']);
    expect(ev('len(distinct([d1, d2]))', { d1: new Date(2026, 0, 1), d2: new Date(2026, 0, 1) })).toBe(1);
  });

  it('rejects non-array inputs and bad selectors', () => {
    expect(() => ev('sum(5)')).toThrow(/sum\(\) expects an array, got number/);
    expect(() => ev('sum(rows, 5)', { rows })).toThrow(/selector/);
  });
});

describe('math', () => {
  it.each([
    ['round(2.5)', 3],
    ['round(-2.5)', -3],
    ['round(1.005, 2)', 1.01],
    ['round(1234.5678, -2)', 1200],
    ['round("3.7")', 4],
    ['round("x")', null],
    ['floor(2.7)', 2],
    ['ceil(2.1)', 3],
    ['abs(-4)', 4],
    ['Math.max(1, 5, 3)', 5],
    ['Math.sqrt(16)', 4],
    ['Math.PI > 3.14', true],
  ])('%s', (source, expected) => {
    expect(ev(source)).toBe(expected);
  });
});

describe('text and conversion', () => {
  it.each([
    ['upper("abc")', 'ABC'],
    ['lower("ABC")', 'abc'],
    ['trim("  x ")', 'x'],
    ['len("abcd")', 4],
    ['len([1, 2])', 2],
    ['len(null)', 0],
    ['len(12345)', 5],
    ['left("abcdef", 2)', 'ab'],
    ['right("abcdef", 2)', 'ef'],
    ['right("abc", 0)', ''],
    ['string(12)', '12'],
    ['string(null)', ''],
    ['number("12.5")', 12.5],
    ['number("x")', null],
    ['isNull(null)', true],
    ['isNull(0)', false],
    ['isEmpty("")', true],
    ['isEmpty([])', true],
    ['isEmpty({})', true],
    ['isEmpty(0)', false],
    ['coalesce(null, undefined, 0, 1)', 0],
    ['coalesce(null)', null],
    ['iif(1 > 2, "yes", "no")', 'no'],
  ])('%s', (source, expected) => {
    expect(ev(source)).toEqual(expected);
  });
});

describe('dates', () => {
  it('date() parses strings and builds dates from parts', () => {
    const d = ev('date("2026-03-15")') as Date;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 15, 0]);
    const built = ev('date(2026, 3, 15, 10, 30)') as Date;
    expect([built.getMonth(), built.getHours(), built.getMinutes()]).toEqual([2, 10, 30]);
    expect(ev('date("not a date")')).toBeNull();
  });

  it('year / month / day', () => {
    expect(ev('[year(d), month(d), day(d)]', { d: '2026-03-15' })).toEqual([2026, 3, 15]);
    expect(ev('year(null)')).toBeNull();
    expect(() => ev('year("nope")')).toThrow(/year\(\) expects a date/);
  });

  it('addDays / addMonths', () => {
    expect(ev('formatDate(addDays("2026-02-27", 2))')).toBe('2026-03-01');
    expect(ev('formatDate(addMonths("2026-01-31", 1))')).toBe('2026-02-28');
    expect(ev('formatDate(addMonths("2024-01-31", 1))')).toBe('2024-02-29');
    expect(ev('formatDate(addMonths("2026-03-15", -3))')).toBe('2025-12-15');
  });

  it('dateDiff in several units', () => {
    expect(ev('dateDiff("2026-01-01", "2026-03-01")')).toBe(59);
    expect(ev('dateDiff("2026-03-01", "2026-01-01", "days")')).toBe(-59);
    expect(ev('dateDiff("2026-01-31", "2026-02-28", "months")')).toBe(0);
    expect(ev('dateDiff("2026-01-15", "2026-03-15", "months")')).toBe(2);
    expect(ev('dateDiff("2026-03-15", "2026-01-16", "months")')).toBe(-1);
    expect(ev('dateDiff("2020-06-01", "2026-05-31", "years")')).toBe(5);
    expect(ev('dateDiff(a, b, "hours")', { a: new Date(2026, 0, 1, 0), b: new Date(2026, 0, 1, 5, 59) })).toBe(5);
    expect(ev('dateDiff(a, b, "minutes")', { a: new Date(2026, 0, 1, 0), b: new Date(2026, 0, 1, 1, 1) })).toBe(61);
    expect(ev('dateDiff(a, b, "seconds")', { a: new Date(2026, 0, 1), b: new Date(2026, 0, 1, 0, 0, 30) })).toBe(30);
    expect(ev('dateDiff(null, "2026-01-01")')).toBeNull();
    expect(() => ev('dateDiff("2026-01-01", "2026-01-02", "weeks")')).toThrow(/unit must be one of/);
  });

  it('now() and today()', () => {
    const before = Date.now();
    const now = (ev('now()') as Date).getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    const today = ev('today()') as Date;
    expect([today.getHours(), today.getMinutes(), today.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('formatting built-ins', () => {
  it('format() with a pattern or a format object', () => {
    expect(ev('format("2026-03-05", "dd/MM/yyyy")')).toBe('05/03/2026');
    expect(ev('format(1234.5, { type: "currency", currency: "USD" })')).toBe('$1,234.50');
    expect(ev('format(0.256, { type: "percent", decimals: 1 })')).toBe('25.6%');
    expect(ev('format(5)')).toBe('5');
    expect(ev('format("text", "yyyy")')).toBe('text');
    expect(() => ev('format(1, 5)')).toThrow(/format\(\) expects/);
  });

  it('formatNumber / formatCurrency / formatPercent / formatDate', () => {
    expect(ev('formatNumber(1234567.891, 2)')).toBe('1,234,567.89');
    expect(ev('formatNumber(1234567, 0, false)')).toBe('1234567');
    expect(ev('formatNumber("abc", 2)')).toBe('abc');
    expect(ev('formatCurrency(9.5, "EUR")')).toBe('€9.50');
    expect(ev('formatCurrency(9.5, "USD", 0)')).toBe('$10');
    expect(() => ev('formatCurrency(1, 5)')).toThrow(/currency code/);
    expect(ev('formatPercent(0.5)')).toBe('50%');
    expect(ev('formatDate("2026-03-05")')).toBe('2026-03-05');
  });

  it('uses the locale option', () => {
    expect(ev('formatNumber(1234.5, 1)', {}, { locale: 'de-DE' })).toBe('1.234,5');
    expect(ev('format("2026-03-05", "MMMM")', {}, { locale: 'fr-FR' })).toBe('mars');
  });
});

describe('builtin registry', () => {
  it('exposes names for autocompletion', () => {
    expect(BUILTIN_NAMES).toEqual(expect.arrayContaining(['sum', 'avg', 'formatDate', 'Math', 'iif']));
  });

  it('is frozen and cached per locale', () => {
    expect(Object.isFrozen(getBuiltins('en-US'))).toBe(true);
    expect(getBuiltins('en-US')).toBe(getBuiltins('en-US'));
    expect(getBuiltins('de-DE')).not.toBe(getBuiltins('en-US'));
  });
});
