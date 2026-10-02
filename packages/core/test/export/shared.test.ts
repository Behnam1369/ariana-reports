import { describe, expect, it, vi } from 'vitest';
import {
  decodeDataUri,
  defaultImageLoader,
  detectImageType,
  fitImage,
  parseColor,
  safeFileName,
  toArgb,
} from '../../src';
import { makeJpeg, makePng } from './helpers';

describe('parseColor', () => {
  it.each([
    ['#f00', { r: 255, g: 0, b: 0, a: 1 }],
    ['#F008', { r: 255, g: 0, b: 0, a: 0x88 / 255 }],
    ['#1f2937', { r: 31, g: 41, b: 55, a: 1 }],
    ['#1f293780', { r: 31, g: 41, b: 55, a: 0x80 / 255 }],
    ['rgb(10, 20, 30)', { r: 10, g: 20, b: 30, a: 1 }],
    ['rgba(10, 20, 30, 0.5)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['rgb(100%, 0%, 50%)', { r: 255, g: 0, b: 128, a: 1 }],
    ['rgba(300, -5, 0, 2)', { r: 255, g: 0, b: 0, a: 1 }],
    ['rgba(0, 0, 0, 50%)', { r: 0, g: 0, b: 0, a: 0.5 }],
    [' Transparent ', { r: 0, g: 0, b: 0, a: 0 }],
  ])('%s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each(['', null, undefined, 'red', '#12', '#zzz', '#12345', 'rgb(1, 2)', 'rgb(a, b, c)', 'hsl(0, 0%, 0%)'])(
    'rejects %j',
    (input) => {
      expect(parseColor(input as string)).toBeNull();
    },
  );

  it('toArgb', () => {
    expect(toArgb({ r: 31, g: 41, b: 55, a: 1 })).toBe('FF1F2937');
    expect(toArgb({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('80000000');
  });
});

describe('images', () => {
  it('detects PNG and JPEG', () => {
    expect(detectImageType(makePng(1, 1))).toBe('png');
    expect(detectImageType(makeJpeg(1, 1))).toBe('jpeg');
    expect(detectImageType(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
  });

  it('decodes data URIs', () => {
    expect(Array.from(decodeDataUri('data:application/octet-stream;base64,AQID')!)).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(decodeDataUri('data:text/plain,a%20b')!)).toBe('a b');
    expect(decodeDataUri('https://x/y.png')).toBeNull();
  });

  it('default loader decodes data URIs, fetches URLs and ignores other sources', async () => {
    expect(Array.from((await defaultImageLoader('data:;base64,AQI=')) as Uint8Array)).toEqual([1, 2]);
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 8])));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(Array.from((await defaultImageLoader('https://cdn/x.png')) as Uint8Array)).toEqual([9, 8]);
      expect(Array.from((await defaultImageLoader('/x.png')) as Uint8Array)).toEqual([9, 8]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      fetchMock.mockImplementationOnce(async () => new Response('', { status: 404 }));
      await expect(defaultImageLoader('https://cdn/missing.png')).rejects.toThrow('HTTP 404');
      expect(await defaultImageLoader('javascript:alert(1)')).toBeNull();
      expect(await defaultImageLoader('logo.png')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('fitImage', () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };

    it('fill stretches to the box', () => {
      expect(fitImage(box, 10, 10, 'fill')).toEqual(box);
    });

    it('contain scales down to fit and centers', () => {
      expect(fitImage(box, 200, 200, 'contain')).toEqual({ x: 25, y: 0, width: 50, height: 50 });
    });

    it('cover fills the box and overflows', () => {
      expect(fitImage(box, 200, 200, 'cover')).toEqual({ x: 0, y: -25, width: 100, height: 100 });
    });

    it('none uses the natural size in points, centered', () => {
      expect(fitImage(box, 96, 96, 'none')).toEqual({ x: 14, y: -11, width: 72, height: 72 });
    });

    it('falls back to the box for unknown sizes', () => {
      expect(fitImage(box, 0, 0, 'contain')).toEqual(box);
    });
  });
});

describe('safeFileName', () => {
  it.each([
    ['Sales report', 'Sales report.pdf'],
    ['Q1 / Q2: "best"?', 'Q1 - Q2 - best.pdf'],
    ['   ', 'report.pdf'],
    ['..hidden', 'hidden.pdf'],
    ['a\u0000b', 'ab.pdf'],
  ])('%j -> %j', (input, expected) => {
    expect(safeFileName(input, 'pdf')).toBe(expected);
  });

  it('truncates long names', () => {
    expect(safeFileName('x'.repeat(300), 'xlsx')).toHaveLength(125);
  });
});
