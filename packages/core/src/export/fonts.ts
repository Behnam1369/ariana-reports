import { createStandardFontMeasurer, type FontSpec, type TextMeasurer } from '../layout/text';
import type { FontRegistration } from './pdf';

interface FontkitFont {
  unitsPerEm: number;
  layout(text: string): { advanceWidth: number };
}

function familyKey(family: string): string {
  return (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
}

/**
 * Builds a text measurer that uses the real metrics of registered fonts and
 * falls back to standard font metrics for other families. Pass the same
 * fonts to `generateReport` (via this measurer) and to `exportPdf` so line
 * breaks in the PDF match the layout.
 */
export async function createFontMeasurer(fonts: FontRegistration[], fallback?: TextMeasurer): Promise<TextMeasurer> {
  const mod = (await import('@pdf-lib/fontkit')) as unknown as { default?: { create(b: Uint8Array): FontkitFont }; create?(b: Uint8Array): FontkitFont };
  const fontkit = mod.default ?? (mod as { create(b: Uint8Array): FontkitFont });
  const loaded = fonts.map((f) => ({
    family: familyKey(f.family),
    bold: !!f.bold,
    italic: !!f.italic,
    font: fontkit.create(f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data)),
  }));
  const base = fallback ?? createStandardFontMeasurer();

  const pick = (spec: FontSpec) => {
    const same = loaded.filter((f) => f.family === familyKey(spec.family));
    return (
      same.find((f) => f.bold === spec.bold && f.italic === spec.italic) ??
      same.find((f) => f.bold === spec.bold) ??
      same.find((f) => !f.bold && !f.italic) ??
      same[0]
    );
  };

  return {
    measure(text, spec) {
      const entry = pick(spec);
      if (!entry) return base.measure(text, spec);
      return (entry.font.layout(text).advanceWidth / entry.font.unitsPerEm) * spec.size;
    },
  };
}
