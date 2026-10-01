import { describe, expect, it } from 'vitest';
import {
  createStandardFontMeasurer,
  standardFamily,
  standardFontName,
  wrapText,
  type FontSpec,
} from '../../src/layout';
import { fixedMeasurer } from './helpers';

const helvetica = (size = 10, bold = false, italic = false): FontSpec => ({ family: 'Helvetica', size, bold, italic });

describe('standard font mapping', () => {
  it.each([
    ['Helvetica', 'Helvetica'],
    ['Arial', 'Helvetica'],
    ['sans-serif', 'Helvetica'],
    ['Unknown Font', 'Helvetica'],
    ['Times New Roman', 'Times'],
    ['"Georgia", serif', 'Times'],
    ['serif', 'Times'],
    ['Courier New', 'Courier'],
    ['monospace', 'Courier'],
  ])('%s -> %s', (family, expected) => {
    expect(standardFamily(family)).toBe(expected);
  });

  it('picks bold and italic variants', () => {
    expect(standardFontName('Arial', false, false)).toBe('Helvetica');
    expect(standardFontName('Arial', true, true)).toBe('Helvetica-BoldOblique');
    expect(standardFontName('Times', true, false)).toBe('Times-Bold');
    expect(standardFontName('Times', false, true)).toBe('Times-Italic');
    expect(standardFontName('Courier', false, true)).toBe('Courier-Oblique');
    expect(standardFontName('Courier', true, true)).toBe('Courier-BoldOblique');
  });
});

describe('createStandardFontMeasurer', () => {
  const m = createStandardFontMeasurer();

  it('uses AFM glyph widths', () => {
    // Helvetica "A" is 667/1000 em.
    expect(m.measure('A', helvetica(10))).toBeCloseTo(6.67, 5);
    expect(m.measure('AA', helvetica(20))).toBeCloseTo(26.68, 5);
    expect(m.measure('', helvetica())).toBe(0);
  });

  it('applies kerning pairs', () => {
    // Helvetica kerns "A" + "V" by -70.
    expect(m.measure('AV', helvetica(10))).toBeCloseTo((667 + 667 - 70) / 100, 5);
  });

  it('measures bold and other families differently', () => {
    const regular = m.measure('Hello world', helvetica());
    expect(m.measure('Hello world', helvetica(10, true))).toBeGreaterThan(regular);
    const courier = m.measure('iiii', { family: 'Courier', size: 10, bold: false, italic: false });
    expect(courier).toBeCloseTo(24, 5); // Courier is 600/1000 em per glyph
  });

  it('uses a fallback width for characters outside WinAnsi', () => {
    expect(m.measure('中', helvetica(10))).toBeCloseTo(5.56, 5);
    expect(m.measure('سلام', helvetica(10))).toBeCloseTo(4 * 5.56, 5);
  });
});

describe('wrapText', () => {
  const font = helvetica(2); // fixedMeasurer: 1 pt per character

  it('keeps short text on one line', () => {
    expect(wrapText('hello', 10, font, fixedMeasurer)).toEqual(['hello']);
  });

  it('breaks at spaces', () => {
    expect(wrapText('aaa bbb ccc', 7, font, fixedMeasurer)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapText('aaa bbb ccc', 6, font, fixedMeasurer)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('honours explicit line breaks, including blank lines and CRLF', () => {
    expect(wrapText('a\nb\r\n\nc', 10, font, fixedMeasurer)).toEqual(['a', 'b', '', 'c']);
  });

  it('splits words longer than a line', () => {
    expect(wrapText('abcdefghij', 4, font, fixedMeasurer)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('xx abcdefghij', 4, font, fixedMeasurer)).toEqual(['xx', 'abcd', 'efgh', 'ij']);
  });

  it('preserves inner spacing and paragraph indentation', () => {
    expect(wrapText('a  b', 10, font, fixedMeasurer)).toEqual(['a  b']);
    expect(wrapText('  indented', 20, font, fixedMeasurer)).toEqual(['  indented']);
  });

  it('drops the spaces at a wrap point', () => {
    expect(wrapText('aaa    bbb', 5, font, fixedMeasurer)).toEqual(['aaa', 'bbb']);
  });

  it('returns a single empty line for empty text', () => {
    expect(wrapText('', 10, font, fixedMeasurer)).toEqual(['']);
    expect(wrapText('   ', 10, font, fixedMeasurer)).toEqual(['']);
  });

  it('only splits on explicit breaks when wordWrap is false', () => {
    expect(wrapText('aaa bbb ccc\nd', 3, font, fixedMeasurer, false)).toEqual(['aaa bbb ccc', 'd']);
  });

  it('never produces lines wider than the limit with real metrics', () => {
    const m = createStandardFontMeasurer();
    const f = helvetica(10);
    const lorem =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    const lines = wrapText(lorem, 100, f, m);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(m.measure(line, f)).toBeLessThanOrEqual(100);
    expect(lines.join(' ')).toBe(lorem);
  });
});
