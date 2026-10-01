import type { CustomPageSize, PageSettings, PaperSize, Unit } from './types';

/** Points (1/72 inch) per one template unit. */
const POINTS_PER_UNIT: Record<Unit, number> = {
  pt: 1,
  in: 72,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  // CSS pixel: 96 per inch.
  px: 72 / 96,
};

/** Portrait paper dimensions in millimetres. */
export const PAPER_SIZES_MM: Record<PaperSize, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export function toPoints(value: number, unit: Unit): number {
  return value * POINTS_PER_UNIT[unit];
}

export function fromPoints(points: number, unit: Unit): number {
  return points / POINTS_PER_UNIT[unit];
}

export function convertUnit(value: number, from: Unit, to: Unit): number {
  return from === to ? value : fromPoints(toPoints(value, from), to);
}

/** Page width and height in template units, with orientation applied. */
export function resolvePageSize(page: PageSettings, unit: Unit): CustomPageSize {
  let width: number;
  let height: number;
  if (typeof page.size === 'string') {
    const mm = PAPER_SIZES_MM[page.size];
    width = convertUnit(mm.width, 'mm', unit);
    height = convertUnit(mm.height, 'mm', unit);
  } else {
    ({ width, height } = page.size);
  }
  return page.orientation === 'landscape' ? { width: height, height: width } : { width, height };
}
