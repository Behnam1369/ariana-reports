import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatValue,
  toDate,
  toDisplayString,
  toNumber,
} from '../../src/format';

describe('toDate', () => {
  it('reads date-only ISO strings as local midnight', () => {
    const d = toDate('2026-03-01')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0]);
  });

  it('rejects impossible calendar dates', () => {
    expect(toDate('2026-02-31')).toBeNull();
  });

  it('parses full ISO timestamps', () => {
    expect(toDate('2026-03-01T12:00:00Z')!.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('accepts Dates and epoch milliseconds', () => {
    const d = new Date(2026, 0, 1);
    expect(toDate(d)).toBe(d);
    expect(toDate(0)!.getTime()).toBe(0);
  });

  it('returns null for invalid input', () => {
    for (const v of ['', '  ', 'nope', null, undefined, {}, Number.NaN, new Date('x'), true]) {
      expect(toDate(v), String(v)).toBeNull();
    }
  });
});

describe('toNumber', () => {
  it.each([
    [5, 5],
    ['5.5', 5.5],
    [' 7 ', 7],
    [true, 1],
    [false, 0],
    ['', null],
    ['abc', null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [null, null],
    [{}, null],
  ])('%j -> %j', (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });
});

describe('number formatting', () => {
  it('formatNumber with decimals, grouping, prefix and suffix', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(1234.5, { decimals: 2 })).toBe('1,234.50');
    expect(formatNumber(1234.5, { decimals: 0, thousandsSeparator: false })).toBe('1235');
    expect(formatNumber(5, { prefix: '~', suffix: ' kg' })).toBe('~5 kg');
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1234.5, { decimals: 1 }, 'de-DE')).toBe('1.234,5');
  });

  it('formatCurrency', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatCurrency(1234.5, 'JPY')).toBe('¥1,235');
    expect(formatCurrency(-3, 'USD', 0)).toBe('-$3');
  });

  it('formatPercent', () => {
    expect(formatPercent(0.1234)).toBe('12%');
    expect(formatPercent(0.1234, 2)).toBe('12.34%');
  });
});

describe('formatDate', () => {
  const d = new Date(2026, 2, 5, 14, 7, 9, 42); // Thursday, March 5 2026

  it.each([
    ['yyyy-MM-dd', '2026-03-05'],
    ['yy/M/d', '26/3/5'],
    ['dd.MM.yyyy HH:mm:ss.SSS', '05.03.2026 14:07:09.042'],
    ['h:mm a', '2:07 PM'],
    ['hh:m', '02:7'],
    ['H:s', '14:9'],
    ['EEEE, MMMM d', 'Thursday, March 5'],
    ['EEE MMM', 'Thu Mar'],
    ["'Year' yyyy", 'Year 2026'],
    ["'It''s' d", "It's 5"],
  ])('%s', (pattern, expected) => {
    expect(formatDate(d, pattern)).toBe(expected);
  });

  it('shows 12 for midnight and noon in 12-hour formats', () => {
    expect(formatDate(new Date(2026, 0, 1, 0, 0), 'h a')).toBe('12 AM');
    expect(formatDate(new Date(2026, 0, 1, 12, 0), 'h a')).toBe('12 PM');
  });

  it('localizes month and weekday names', () => {
    expect(formatDate(d, 'EEEE d MMMM', 'fr-FR')).toBe('jeudi 5 mars');
  });
});

describe('toDisplayString', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['x', 'x'],
    [12.5, '12.5'],
    [Number.NaN, ''],
    [true, 'true'],
    [[1, null, 'a'], '1, , a'],
    [{ a: 1 }, '{"a":1}'],
    [() => 1, ''],
  ])('%j -> %j', (input, expected) => {
    expect(toDisplayString(input)).toBe(expected);
  });

  it('formats bigints', () => {
    expect(toDisplayString(10n)).toBe('10');
  });

  it('formats dates with or without time', () => {
    expect(toDisplayString(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(toDisplayString(new Date(2026, 2, 5, 9, 30))).toBe('2026-03-05 09:30:00');
    expect(toDisplayString(new Date('x'))).toBe('');
  });

  it('falls back to String() for values JSON cannot serialize', () => {
    const cyclic: any = {};
    cyclic.self = cyclic;
    expect(toDisplayString(cyclic)).toBe('[object Object]');
  });
});

describe('formatValue', () => {
  it('returns empty text for empty values', () => {
    expect(formatValue(null, { type: 'number' })).toBe('');
    expect(formatValue('', { type: 'currency', currency: 'USD' })).toBe('');
  });

  it('applies each format type', () => {
    expect(formatValue(1234.5, { type: 'number', decimals: 2 })).toBe('1,234.50');
    expect(formatValue('1234.5', { type: 'currency', currency: 'USD' })).toBe('$1,234.50');
    expect(formatValue(0.5, { type: 'percent' })).toBe('50%');
    expect(formatValue('2026-03-05', { type: 'date', pattern: 'dd/MM/yyyy' })).toBe('05/03/2026');
  });

  it('falls back to display text when the value does not fit the format', () => {
    expect(formatValue('abc', { type: 'number', decimals: 2 })).toBe('abc');
    expect(formatValue(true, { type: 'number' })).toBe('true');
    expect(formatValue('not a date', { type: 'date', pattern: 'yyyy' })).toBe('not a date');
  });

  it('uses display text without a format', () => {
    expect(formatValue(5, undefined)).toBe('5');
  });

  it('respects the locale', () => {
    expect(formatValue(1234.5, { type: 'currency', currency: 'EUR' }, 'de-DE')).toBe('1.234,50\u00a0€');
  });
});

describe('calendars and locale digits', () => {
  const date = new Date(2026, 9, 13, 14, 5); // 13 October 2026

  it('always writes Gregorian month names unless a calendar is given, whatever the locale default', () => {
    expect(formatDate(date, 'd MMMM yyyy', 'en-US')).toBe('13 October 2026');
    // fa-IR defaults to the Persian calendar for names; the Gregorian pattern must stay Gregorian.
    expect(formatDate(date, 'd MMMM yyyy', 'fa-IR')).toBe('۱۳ اکتبر ۲۰۲۶');
  });

  it('formats Persian (Jalali) dates', () => {
    expect(formatDate(date, 'yyyy/MM/dd', 'fa-IR', 'persian')).toBe('۱۴۰۵/۰۷/۲۱');
    expect(formatDate(date, 'd MMMM yyyy', 'fa-IR', 'persian')).toBe('۲۱ مهر ۱۴۰۵');
    expect(formatDate(date, 'yyyy-MM-dd', 'en-US', 'persian')).toBe('1405-07-21');
    expect(formatDate(new Date(2026, 2, 21), 'yyyy/M/d', 'en-US', 'persian')).toBe('1405/1/1');
  });

  it('uses the locale digits for numeric tokens, including time', () => {
    expect(formatDate(date, 'HH:mm', 'fa-IR')).toBe('۱۴:۰۵');
    expect(formatDate(date, 'HH:mm', 'en-US')).toBe('14:05');
    expect(formatDate(date, 'yyyy-MM-dd', 'ar-EG')).toBe('٢٠٢٦-١٠-١٣');
  });

  it('applies the calendar of a value format and of the formatDate() expression function', () => {
    expect(formatValue('2026-10-13', { type: 'date', pattern: 'yyyy/MM/dd', calendar: 'persian' }, 'en-US')).toBe('1405/07/21');
    expect(formatValue('2026-10-13', { type: 'date', pattern: 'yyyy/MM/dd' }, 'en-US')).toBe('2026/10/13');
  });
});

describe('calendar in templates and exports', () => {
  it('validates the calendar of a date format', async () => {
    const { validateTemplate } = await import('../../src');
    const t = (calendar: unknown) => ({
      schemaVersion: 1, name: 'x', unit: 'mm', page: { size: 'A4', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 } },
      dataSources: [], body: [{ kind: 'band', id: 'b', height: 5, components: [{ id: 't', type: 'text', x: 0, y: 0, width: 10, height: 5, text: '{{ today() }}', format: { type: 'date', pattern: 'yyyy', calendar } }] }],
    });
    expect(validateTemplate(t('persian')).errors).toEqual([]);
    expect(validateTemplate(t('martian')).errors.map((e) => e.path)).toContain('body[0].components[0].format.calendar');
  });

  it('exports non-Gregorian dates to Excel as the text shown in the report', async () => {
    const { cellValue } = await import('../../src/export/excel');
    const item = { kind: 'text', text: '1405/07/21', value: new Date(2026, 9, 13), format: { type: 'date', pattern: 'yyyy/MM/dd', calendar: 'persian' } } as never;
    expect(cellValue(item, 'fa-IR')).toEqual({ value: '1405/07/21' });
  });
});
