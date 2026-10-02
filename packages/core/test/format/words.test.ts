import { describe, expect, it } from 'vitest';
import { currencyToWords, numberToWords } from '../../src/format';
import { evaluateExpression as ev } from '../../src/expressions';

describe('numberToWords', () => {
  it.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [13, 'Thirteen'],
    [20, 'Twenty'],
    [42, 'Forty-Two'],
    [100, 'One Hundred'],
    [101, 'One Hundred One'],
    [999, 'Nine Hundred Ninety-Nine'],
    [1000, 'One Thousand'],
    [1234, 'One Thousand Two Hundred Thirty-Four'],
    [1_000_001, 'One Million One'],
    [2_500_000_000, 'Two Billion Five Hundred Million'],
    [-15, 'Minus Fifteen'],
    [12.99, 'Twelve'],
    [-0.5, 'Zero'],
  ])('%d -> %s', (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it('returns an empty string for values it cannot spell', () => {
    expect(numberToWords(Number.NaN)).toBe('');
    expect(numberToWords(Infinity)).toBe('');
    expect(numberToWords(1e20)).toBe('');
  });

  it('handles the largest safe integer', () => {
    expect(numberToWords(Number.MAX_SAFE_INTEGER)).toMatch(/^Nine Quadrillion .* Ninety-One$/);
  });
});

describe('currencyToWords', () => {
  it('spells the whole part and the cents', () => {
    expect(currencyToWords(12.5, 'Dollars', 'Cents')).toBe('Twelve Dollars And Fifty Cents');
    expect(currencyToWords(1234.01, 'Euros')).toBe('One Thousand Two Hundred Thirty-Four Euros And One Cents');
  });

  it('omits zero cents and an empty currency name', () => {
    expect(currencyToWords(40, 'Dollars')).toBe('Forty Dollars');
    expect(currencyToWords(40)).toBe('Forty');
    expect(currencyToWords(0.25, '', '')).toBe('Zero And Twenty-Five');
  });

  it('rounds to cents, carrying into the whole part', () => {
    expect(currencyToWords(1.999, 'Dollars')).toBe('Two Dollars');
    expect(currencyToWords(1.005, 'Dollars')).toMatch(/^One Dollars/);
  });

  it('handles negatives and invalid values', () => {
    expect(currencyToWords(-3.5, 'Dollars')).toBe('Minus Three Dollars And Fifty Cents');
    expect(currencyToWords(-0.001, 'Dollars')).toBe('Zero Dollars');
    expect(currencyToWords(Number.NaN)).toBe('');
    expect(currencyToWords(1e20)).toBe('');
  });
});

describe('toWords / toCurrencyWords builtins', () => {
  it('are callable from expressions', () => {
    expect(ev('toWords(21)')).toBe('Twenty-One');
    expect(ev('toWords("1000")')).toBe('One Thousand');
    expect(ev('toCurrencyWords(total, "Dollars")', { total: 99.9 })).toBe('Ninety-Nine Dollars And Ninety Cents');
    expect(ev('toCurrencyWords(1.5, "Pounds", "Pence")')).toBe('One Pounds And Fifty Pence');
  });

  it('return an empty string for non-numbers', () => {
    expect(ev('toWords(null)')).toBe('');
    expect(ev('toWords("abc")')).toBe('');
    expect(ev('toCurrencyWords(undefined)')).toBe('');
  });
});
