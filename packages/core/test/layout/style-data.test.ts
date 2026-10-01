import { describe, expect, it } from 'vitest';
import {
  compareValues,
  DEFAULT_STYLE,
  mergeStyles,
  readPath,
  resolveBorder,
  resolvePadding,
  resolveStyle,
  toRows,
} from '../../src/layout';
import { sameGroupKey, sortKey } from '../../src/layout/data';

describe('mergeStyles', () => {
  it('lets later layers win and ignores undefined values', () => {
    expect(
      mergeStyles({ fontSize: 10, color: '#000' }, undefined, { fontSize: 12, color: undefined }, { fontWeight: 'bold' }),
    ).toEqual({ fontSize: 12, color: '#000', fontWeight: 'bold' });
  });
});

describe('resolveStyle', () => {
  it('fills in defaults', () => {
    expect(resolveStyle({}, 'pt')).toEqual({
      ...DEFAULT_STYLE,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  });

  it('converts padding to points', () => {
    expect(resolvePadding(1, 'in')).toEqual({ top: 72, right: 72, bottom: 72, left: 72 });
    const p = resolvePadding({ top: 1, right: 2, bottom: 3, left: 4 }, 'pt');
    expect(p).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    expect(resolveStyle({ padding: 25.4 }, 'mm').padding.top).toBeCloseTo(72, 10);
  });

  it('drops transparent backgrounds', () => {
    expect(resolveStyle({ backgroundColor: 'transparent' }, 'pt').backgroundColor).toBeUndefined();
    expect(resolveStyle({ backgroundColor: '#fff' }, 'pt').backgroundColor).toBe('#fff');
  });

  it('resolves borders with all sides by default', () => {
    expect(resolveBorder({ width: 1, color: '#000', style: 'solid' })).toEqual({
      width: 1,
      color: '#000',
      style: 'solid',
      sides: ['top', 'right', 'bottom', 'left'],
    });
    expect(resolveBorder({ width: 1, color: '#000', style: 'dashed', sides: ['bottom'] })!.sides).toEqual(['bottom']);
  });

  it('treats zero-width or side-less borders as no border', () => {
    expect(resolveBorder({ width: 0, color: '#000', style: 'solid' })).toBeUndefined();
    expect(resolveBorder({ width: 1, color: '#000', style: 'solid', sides: [] })).toBeUndefined();
    expect(resolveBorder(undefined)).toBeUndefined();
  });
});

describe('readPath / toRows', () => {
  const data = { sales: { orders: [1, 2], meta: null }, flat: 'x' };

  it('reads dot paths using own properties only', () => {
    expect(readPath(data, 'sales.orders')).toEqual([1, 2]);
    expect(readPath(data, 'sales.meta.x')).toBeUndefined();
    expect(readPath(data, 'flat.length')).toBeUndefined();
    expect(readPath(data, 'missing')).toBeUndefined();
    expect(readPath({}, 'constructor')).toBeUndefined();
    expect(readPath(null, 'a')).toBeUndefined();
  });

  it('normalises data source values to rows', () => {
    expect(toRows([1])).toEqual([1]);
    expect(toRows({ a: 1 })).toEqual([{ a: 1 }]);
    expect(toRows(null)).toEqual([]);
    expect(toRows(undefined)).toEqual([]);
  });
});

describe('compareValues', () => {
  it('orders nullish < booleans < numbers < dates < strings < others', () => {
    const d = new Date(2026, 0, 1);
    // Array#sort never passes undefined to the comparator, so it is checked separately.
    const values = ['b', { o: 1 }, 2, d, null, true, 'a', 1, false];
    const sorted = [...values].sort((a, b) => compareValues(a, b));
    expect(sorted).toEqual([null, false, true, 1, 2, d, 'a', 'b', { o: 1 }]);
    expect(compareValues(undefined, false)).toBeLessThan(0);
    expect(compareValues(undefined, null)).toBe(0);
  });

  it('compares strings with numeric collation and locale', () => {
    expect(['item10', 'item2', 'item1'].sort((a, b) => compareValues(a, b))).toEqual(['item1', 'item2', 'item10']);
    expect(compareValues('ä', 'z', 'de-DE')).toBeLessThan(0);
    expect(compareValues('ä', 'z', 'sv-SE')).toBeGreaterThan(0);
  });

  it('compares dates by time and NaN as nullish', () => {
    expect(compareValues(new Date(2026, 0, 2), new Date(2026, 0, 1))).toBeGreaterThan(0);
    expect(compareValues(Number.NaN, null)).toBe(0);
  });
});

describe('group keys and sort keys', () => {
  it('sameGroupKey compares dates by time and NaN with NaN', () => {
    expect(sameGroupKey(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(true);
    expect(sameGroupKey(Number.NaN, Number.NaN)).toBe(true);
    expect(sameGroupKey(1, '1')).toBe(false);
  });

  it('sortKey turns ISO date strings into dates', () => {
    expect(sortKey('2026-01-05')).toBeInstanceOf(Date);
    expect(sortKey('2026-01-05T10:00:00Z')).toBeInstanceOf(Date);
    expect(sortKey('hello')).toBe('hello');
    expect(sortKey(5)).toBe(5);
  });
});
