import { describe, expect, it } from 'vitest';
import {
  bidiLevels,
  detectDirection,
  generateReport,
  hasRtlCharacters,
  mirrorChar,
  reorderSegments,
  resolveBaseDirection,
  resolveStyle,
  toVisualOrder,
  visualRuns,
  type LayoutText,
} from '../../src';
import { scriptDirection, shapesRightToLeft } from '../../src/layout/bidi';
import { band, fixedMeasurer, text, tpl } from './helpers';

// Reversed (visual) spellings, for readable expectations.
const rev = (s: string) => Array.from(s).reverse().join('');

describe('base direction', () => {
  it('follows the first strong character', () => {
    expect(detectDirection('سلام Hi')).toBe('rtl');
    expect(detectDirection('Hi سلام')).toBe('ltr');
    expect(detectDirection('123 שלום')).toBe('rtl');
    expect(detectDirection('۱۲۳ - 456')).toBeNull();
    expect(detectDirection('\u200Fabc')).toBe('rtl');
  });

  it('resolves auto, and keeps explicit directions', () => {
    expect(resolveBaseDirection('سلام', 'auto')).toBe('rtl');
    expect(resolveBaseDirection('123', 'auto')).toBe('ltr');
    expect(resolveBaseDirection('سلام', 'ltr')).toBe('ltr');
    expect(resolveBaseDirection('Hello', 'rtl')).toBe('rtl');
    expect(resolveBaseDirection('سلام')).toBe('rtl');
  });

  it('detects right-to-left characters', () => {
    expect(hasRtlCharacters('abc')).toBe(false);
    expect(hasRtlCharacters('abc سلام')).toBe(true);
    expect(hasRtlCharacters('١٢٣')).toBe(true);
  });
});

describe('bidiLevels', () => {
  it('assigns implicit levels', () => {
    expect(bidiLevels('ab سل', 'ltr')).toEqual([0, 0, 0, 1, 1]);
    expect(bidiLevels('سل ab', 'rtl')).toEqual([1, 1, 1, 2, 2]);
    // Numbers in right-to-left text are left-to-right (level 2).
    expect(bidiLevels('سل ۱۲', 'rtl')).toEqual([1, 1, 1, 2, 2]);
    // European numbers after Arabic letters become Arabic numbers (also level 2 in an LTR paragraph).
    expect(bidiLevels('ab سل 12', 'ltr')).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
  });

  it('resets trailing whitespace to the base level', () => {
    expect(bidiLevels('ab ', 'rtl')).toEqual([2, 2, 1]);
    expect(bidiLevels('سل ', 'ltr')).toEqual([1, 1, 0]);
  });

  it('keeps number separators inside numbers', () => {
    const levels = bidiLevels('سل 1,234.50', 'rtl');
    expect(levels.slice(3)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it('gives marks the level of their base letter', () => {
    // "بِ": beh + kasra.
    expect(bidiLevels('a بِ', 'ltr')).toEqual([0, 0, 1, 1]);
  });
});

describe('visual order', () => {
  it('leaves left-to-right text alone', () => {
    expect(toVisualOrder('Hello, world (1)', 'ltr')).toBe('Hello, world (1)');
  });

  it('reverses right-to-left words but keeps numbers left-to-right', () => {
    expect(toVisualOrder('سلام دنیا ۱۲۳ فارسی', 'rtl')).toBe(`${rev('فارسی')} ۱۲۳ ${rev('دنیا')} ${rev('سلام')}`);
    expect(toVisualOrder('قیمت 1,234.5 ریال', 'rtl')).toBe(`${rev('ریال')} 1,234.5 ${rev('قیمت')}`);
    expect(toVisualOrder('١٢٣', 'rtl')).toBe('١٢٣');
  });

  it('places embedded Latin words and mirrors brackets', () => {
    expect(toVisualOrder('سلام (Roboto)', 'rtl')).toBe(`(Roboto) ${rev('سلام')}`);
    expect(toVisualOrder('Roboto (سلام)', 'ltr')).toBe(`Roboto (${rev('سلام')})`);
    expect(toVisualOrder('Name: نام', 'ltr')).toBe(`Name: ${rev('نام')}`);
  });

  it('removes bidi controls', () => {
    expect(toVisualOrder('a\u200Fb\u200Ec', 'ltr')).toBe('abc');
    expect(toVisualOrder('\u202Babc\u202C', 'ltr')).toBe('abc');
  });

  it('returns runs of uniform level', () => {
    expect(visualRuns('سلام abc', 'rtl')).toEqual([
      { text: 'abc', level: 2 },
      { text: ` ${rev('سلام')}`, level: 1 },
    ]);
  });

  it('reorders arbitrary segments by level', () => {
    const segs = [{ id: 'a', level: 0 }, { id: 'b', level: 1 }, { id: 'c', level: 2 }, { id: 'd', level: 1 }, { id: 'e', level: 0 }];
    expect(reorderSegments(segs).map((s) => s.id)).toEqual(['a', 'd', 'c', 'b', 'e']);
    expect(reorderSegments([])).toEqual([]);
  });

  it('mirrors paired punctuation', () => {
    expect(mirrorChar('(')).toBe(')');
    expect(mirrorChar('«')).toBe('»');
    expect(mirrorChar('a')).toBe('a');
  });
});

describe('script direction (fontkit reversal)', () => {
  it('matches how fontkit picks the layout direction', () => {
    expect(scriptDirection('a')).toBe('ltr');
    expect(scriptDirection('س')).toBe('rtl');
    expect(scriptDirection('۱')).toBe('rtl');
    expect(scriptDirection('1')).toBeNull();
    expect(scriptDirection(' ')).toBeNull();
    expect(shapesRightToLeft('۱۲۳')).toBe(true);
    expect(shapesRightToLeft('( سلام')).toBe(true);
    expect(shapesRightToLeft('x۱')).toBe(false);
    expect(shapesRightToLeft('(،)')).toBe(false);
  });
});

describe('text direction in the layout', () => {
  const layout = (t: string, style: Record<string, unknown> = {}) => {
    const doc = generateReport(tpl({ body: [{ kind: 'band', ...band(20, [text(t, { style })]) }] }), {}, { measurer: fixedMeasurer });
    return doc.pages[0]!.bands[0]!.items[0] as LayoutText;
  };

  it('resolves auto from the text and right-aligns right-to-left text by default', () => {
    expect(layout('سلام')).toMatchObject({ direction: 'rtl', style: { direction: 'auto', textAlign: 'right' } });
    expect(layout('Hello')).toMatchObject({ direction: 'ltr', style: { textAlign: 'left' } });
    // Expressions are resolved first: the direction follows the final text.
    expect(layout('{{ "سلام" }}')).toMatchObject({ direction: 'rtl' });
  });

  it('keeps an explicit direction and alignment', () => {
    expect(layout('سلام', { direction: 'ltr' })).toMatchObject({ direction: 'ltr', style: { textAlign: 'left' } });
    expect(layout('Hello', { direction: 'rtl' })).toMatchObject({ direction: 'rtl', style: { textAlign: 'right' } });
    expect(layout('سلام', { textAlign: 'center' })).toMatchObject({ direction: 'rtl', style: { textAlign: 'center' } });
  });

  it('resolves the style default', () => {
    expect(resolveStyle({}, 'pt')).toMatchObject({ direction: 'auto', textAlign: 'left' });
    expect(resolveStyle({ direction: 'rtl' }, 'pt')).toMatchObject({ direction: 'rtl', textAlign: 'right' });
    expect(resolveStyle({ direction: 'rtl', textAlign: 'justify' }, 'pt').textAlign).toBe('justify');
  });
});
