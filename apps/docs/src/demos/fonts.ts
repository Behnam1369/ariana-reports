import type { FontRegistration } from '@ariana-reports/core';
// Vazirmatn from Fontsource (SIL OFL 1.1). Fontsource splits a font into
// script subsets; registering the "arabic" and "latin" files under the same
// family lets the PDF use whichever file has each character.
import arabic400 from '@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff?url';
import arabic700 from '@fontsource/vazirmatn/files/vazirmatn-arabic-700-normal.woff?url';
import latin400 from '@fontsource/vazirmatn/files/vazirmatn-latin-400-normal.woff?url';
import latin700 from '@fontsource/vazirmatn/files/vazirmatn-latin-700-normal.woff?url';

const files = [
  { url: arabic400, bold: false },
  { url: latin400, bold: false },
  { url: arabic700, bold: true },
  { url: latin700, bold: true },
];

let cache: Promise<FontRegistration[]> | undefined;

/** Font files for PDF export. Without them the PDF can only use the standard fonts, which have no Persian letters. */
export function loadPersianFonts(): Promise<FontRegistration[]> {
  cache ??= Promise.all(
    files.map(async ({ url, bold }) => ({ family: 'Vazirmatn', bold, data: await (await fetch(url)).arrayBuffer() })),
  );
  return cache;
}
