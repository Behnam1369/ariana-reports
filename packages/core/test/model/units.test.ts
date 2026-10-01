import { describe, expect, it } from 'vitest';
import { convertUnit, fromPoints, resolvePageSize, toPoints } from '../../src/model';

describe('unit conversion', () => {
  it.each([
    [1, 'in', 72],
    [25.4, 'mm', 72],
    [2.54, 'cm', 72],
    [96, 'px', 72],
    [10, 'pt', 10],
  ] as const)('%d %s = %d pt', (value, unit, points) => {
    expect(toPoints(value, unit)).toBeCloseTo(points, 10);
    expect(fromPoints(points, unit)).toBeCloseTo(value, 10);
  });

  it('converts between arbitrary units', () => {
    expect(convertUnit(1, 'in', 'mm')).toBeCloseTo(25.4, 10);
    expect(convertUnit(10, 'cm', 'mm')).toBeCloseTo(100, 10);
    expect(convertUnit(5, 'mm', 'mm')).toBe(5);
  });
});

describe('resolvePageSize', () => {
  const margins = { top: 0, right: 0, bottom: 0, left: 0 };

  it('resolves named sizes in the template unit', () => {
    const a4 = resolvePageSize({ size: 'A4', orientation: 'portrait', margins }, 'mm');
    expect(a4).toEqual({ width: 210, height: 297 });
    const letter = resolvePageSize({ size: 'Letter', orientation: 'portrait', margins }, 'in');
    expect(letter.width).toBeCloseTo(8.5, 10);
    expect(letter.height).toBeCloseTo(11, 10);
  });

  it('swaps dimensions for landscape', () => {
    expect(resolvePageSize({ size: 'A4', orientation: 'landscape', margins }, 'mm')).toEqual({ width: 297, height: 210 });
    expect(resolvePageSize({ size: { width: 100, height: 50 }, orientation: 'landscape', margins }, 'mm')).toEqual({
      width: 50,
      height: 100,
    });
  });

  it('uses custom sizes as-is', () => {
    expect(resolvePageSize({ size: { width: 80, height: 200 }, orientation: 'portrait', margins }, 'mm')).toEqual({
      width: 80,
      height: 200,
    });
  });
});
