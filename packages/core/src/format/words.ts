/**
 * Spells numbers out in English words, title-cased, e.g. for "amount in
 * words" lines on financial documents.
 */

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion'];

function underThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(ONES[rest]!);
    else parts.push(TENS[Math.floor(rest / 10)]! + (rest % 10 ? `-${ONES[rest % 10]}` : ''));
  }
  return parts.join(' ');
}

/**
 * Spells out the integer part of `value`. Returns '' for non-finite values or
 * magnitudes beyond `Number.MAX_SAFE_INTEGER`.
 */
export function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return '';
  let n = Math.trunc(Math.abs(value));
  if (n > Number.MAX_SAFE_INTEGER) return '';
  if (n === 0) return ONES[0]!;
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) groups.unshift(SCALES[scale] ? `${underThousand(chunk)} ${SCALES[scale]}` : underThousand(chunk));
    n = Math.floor(n / 1000);
    scale++;
  }
  const words = groups.join(' ');
  return value < 0 && Math.trunc(value) !== 0 ? `Minus ${words}` : words;
}

/**
 * Spells out an amount with its currency and cents names, e.g.
 * `currencyToWords(12.5, 'Dollars', 'Cents')` -> "Twelve Dollars And Fifty Cents".
 * Cents are rounded to two decimals and omitted when zero.
 */
export function currencyToWords(value: number, currencyName = '', centsName = 'Cents'): string {
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  const totalCents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const wholeWords = numberToWords(whole);
  if (wholeWords === '') return '';
  let text = currencyName ? `${wholeWords} ${currencyName}` : wholeWords;
  if (cents > 0) text += ` And ${numberToWords(cents)}${centsName ? ` ${centsName}` : ''}`;
  return negative && totalCents > 0 ? `Minus ${text}` : text;
}
