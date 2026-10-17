import { DEFAULT_LABELS, mergeLabels, type Labels } from './labels';
import { fa } from './locales/fa';

/**
 * A UI translation. `labels` may be partial: missing keys fall back to
 * English. `values` translates option values shown in select boxes
 * (e.g. "bold", "portrait", "asc"); untranslated values are shown as is.
 */
export interface UiLocale {
  /** BCP 47 language code, e.g. "fa" or "de-CH". */
  code: string;
  /** Writing direction of the UI. Defaults to "ltr". */
  dir?: 'ltr' | 'rtl';
  labels: Partial<Labels>;
  values?: Record<string, string>;
}

/** A locale with every label filled in. */
export interface ResolvedUiLocale {
  code: string;
  dir: 'ltr' | 'rtl';
  labels: Labels;
  values: Record<string, string>;
}

export const en: UiLocale = {
  code: 'en',
  dir: 'ltr',
  labels: DEFAULT_LABELS,
  values: { auto: 'Auto', ltr: 'Left to right', rtl: 'Right to left' },
};

const registry = new Map<string, UiLocale>([
  ['en', en],
  ['fa', fa],
]);

/** Makes a locale available by code, e.g. `registerUiLocale(de)` then `uiLocale="de"`. */
export function registerUiLocale(locale: UiLocale): void {
  registry.set(locale.code.toLowerCase(), locale);
}

/** Codes of the registered UI locales. */
export function uiLocales(): string[] {
  return [...registry.keys()];
}

/** Finds a registered locale: exact code first ("fa-ir"), then the language ("fa"). */
export function findUiLocale(code: string): UiLocale | undefined {
  const c = code.trim().toLowerCase().replace(/_/g, '-');
  return registry.get(c) ?? registry.get(c.split('-')[0]!);
}

/**
 * Resolves the `uiLocale` and `labels` props of the viewer and designer.
 * Unknown codes fall back to English; `overrides` win over the locale.
 */
export function resolveUiLocale(locale?: string | UiLocale | null, overrides?: Partial<Labels>): ResolvedUiLocale {
  const base = (typeof locale === 'string' ? findUiLocale(locale) : locale) ?? en;
  return {
    code: base.code,
    dir: base.dir ?? 'ltr',
    labels: mergeLabels({ ...base.labels, ...overrides }),
    values: { ...base.values },
  };
}

/** Display text for an option value. */
export function optionLabel(values: Record<string, string>, value: string): string {
  return values[value] ?? value;
}
