import type { ReportComponent, ReportTemplate, Unit } from '../model/types';
import { toPoints } from '../model/units';
import { mergeStyles, resolveStyle } from '../layout/style';
import { LINE_HEIGHT_FACTOR } from '../layout/text';
import { cssColor, cssFontFamily, PX_PER_PT } from '../viewer/render';
import { compileText } from '../expressions';
import { walkBands } from '../model/walk';
import { parseHtmlText, resolveRuns } from '../layout/html';

/** CSS pixels per template unit at a zoom level. */
export function designScale(unit: Unit, zoom = 1): number {
  return toPoints(1, unit) * PX_PER_PT * zoom;
}

/** How a component looks on the design surface. */
export interface ComponentPreview {
  /** camelCase CSS properties, usable as a React or Vue style object. */
  style: Record<string, string>;
  /** Text shown inside the component (raw text with placeholders, or a placeholder label). */
  label: string;
  /** Syntax error in the component's text or src, if any. */
  error: string | null;
  /**
   * For text components with `allowHtml`: the label split into styled runs
   * (render each as a text span with its camelCase CSS `style`). Null otherwise.
   */
  runs: { text: string; style: Record<string, string> }[] | null;
}

/**
 * Computes the design-time appearance of a component: position, size and
 * the static parts of its style (conditional styles are not applied).
 */
export function componentPreview(c: ReportComponent, template: ReportTemplate, zoom = 1): ComponentPreview {
  const s = designScale(template.unit, zoom);
  const px = (v: number) => `${Number((v * s).toFixed(3))}px`;
  const ptPx = (v: number) => `${Number((v * PX_PER_PT * zoom).toFixed(3))}px`;
  const resolved = resolveStyle(mergeStyles(c.styleName ? template.styles?.[c.styleName] : undefined, c.style), template.unit);
  const style: Record<string, string> = {
    left: px(c.x),
    top: px(c.y),
    width: px(c.width),
    height: px(c.height),
  };
  let label = '';
  let error: string | null = null;
  let runs: ComponentPreview['runs'] = null;
  const bg = cssColor(resolved.backgroundColor);
  const border = (prefix = 'border') => {
    const b = resolved.border;
    const color = b && cssColor(b.color);
    if (!b || !color) return;
    const key = (side: string) => `${prefix}${side[0]!.toUpperCase()}${side.slice(1)}`;
    for (const side of b.sides) style[key(side)] = `${ptPx(b.width)} ${b.style} ${color}`;
  };

  const check = (text: string) => {
    try {
      compileText(text);
    } catch (err) {
      error = (err as Error).message;
    }
  };

  switch (c.type) {
    case 'text': {
      label = c.text;
      check(c.text);
      const p = resolved.padding;
      Object.assign(style, {
        fontFamily: cssFontFamily(resolved.fontFamily),
        fontSize: ptPx(resolved.fontSize),
        lineHeight: ptPx(resolved.fontSize * LINE_HEIGHT_FACTOR),
        fontWeight: resolved.fontWeight,
        fontStyle: resolved.fontStyle,
        color: cssColor(resolved.color) ?? 'transparent',
        textAlign: resolved.textAlign,
        padding: `${ptPx(p.top)} ${ptPx(p.right)} ${ptPx(p.bottom)} ${ptPx(p.left)}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: resolved.verticalAlign === 'middle' ? 'center' : resolved.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
      });
      if (resolved.textDecoration !== 'none' && !c.allowHtml) style.textDecoration = resolved.textDecoration;
      if (c.wordWrap === false) style.whiteSpace = 'pre';
      if (c.allowHtml) {
        const base = {
          bold: resolved.fontWeight === 'bold',
          italic: resolved.fontStyle === 'italic',
          underline: resolved.textDecoration === 'underline',
          strike: resolved.textDecoration === 'line-through',
          color: resolved.color,
        };
        runs = resolveRuns(parseHtmlText(c.text), base).map((r) => {
          const s: Record<string, string> = {
            fontWeight: r.bold ? 'bold' : 'normal',
            fontStyle: r.italic ? 'italic' : 'normal',
            color: cssColor(r.color) ?? 'transparent',
          };
          const deco = [r.underline && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ');
          if (deco) s.textDecoration = deco;
          const runBg = cssColor(r.backgroundColor);
          if (runBg) s.background = runBg;
          return { text: r.text, style: s };
        });
      }
      if (bg) style.background = bg;
      border();
      break;
    }
    case 'image':
      label = c.src ? (c.src.startsWith('data:') ? 'Image' : c.src) : 'Image';
      check(c.src);
      if (bg) style.backgroundColor = bg;
      border();
      break;
    case 'rectangle':
      if (bg) style.background = bg;
      if (c.cornerRadius) style.borderRadius = px(c.cornerRadius);
      border();
      break;
    case 'line': {
      const b = resolved.border;
      const width = b?.width ?? 1;
      const color = cssColor(b?.color ?? resolved.color) ?? '#000';
      // Give lines a grabbable hit area around the stroke.
      const hit = 6;
      if (c.orientation === 'horizontal') {
        Object.assign(style, { top: `calc(${px(c.y)} - ${hit / 2}px)`, height: `${hit}px`, background: `linear-gradient(transparent calc(50% - ${ptPx(width / 2)}), ${color} 0, ${color} calc(50% + ${ptPx(width / 2)}), transparent 0)` });
      } else {
        Object.assign(style, { left: `calc(${px(c.x)} - ${hit / 2}px)`, width: `${hit}px`, background: `linear-gradient(to right, transparent calc(50% - ${ptPx(width / 2)}), ${color} 0, ${color} calc(50% + ${ptPx(width / 2)}), transparent 0)` });
      }
      break;
    }
  }
  return { style, label, error, runs };
}

/** Ready-made expressions offered by the designer's text editor (inserted inside `{{ }}`). */
export const EXPRESSION_SNIPPETS: readonly string[] = [
  'sum(rows, r => r.total)',
  'avg(rows, r => r.total)',
  'count(rows)',
  'min(rows, r => r.total)',
  'max(rows, r => r.total)',
  'round(value, 2)',
  'formatNumber(value, 2)',
  "formatCurrency(value, 'USD')",
  "formatDate(today(), 'yyyy-MM-dd')",
  "iif(condition, 'yes', 'no')",
  "coalesce(value, '')",
  'upper(text)',
  'toWords(value)',
  'page.number',
  'page.count',
  'rowNumber',
];

/** Wraps the selected range of `text` in `before`/`after` (e.g. `<b>`/`</b>`). Returns the new text and selection. */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after = '',
): { text: string; start: number; end: number } {
  const a = Math.max(0, Math.min(start, end, text.length));
  const b = Math.min(text.length, Math.max(start, end));
  const next = text.slice(0, a) + before + text.slice(a, b) + after + text.slice(b);
  return { text: next, start: a + before.length, end: b + before.length };
}

/** Font families every report can use without registering a font (the PDF standard fonts). */
export const STANDARD_FONT_FAMILIES: readonly string[] = ['Helvetica', 'Times', 'Courier'];

/**
 * Font families offered in the designer's font list: the standard fonts,
 * the given extra families (e.g. the `family` of every registered PDF font),
 * and every family already used in the template. Duplicates are removed
 * (case-insensitive), order is kept.
 */
export function fontFamilies(template: ReportTemplate, extra: readonly string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (f: string | undefined) => {
    const name = f?.trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push(name);
  };
  STANDARD_FONT_FAMILIES.forEach(add);
  extra.forEach(add);
  for (const s of Object.values(template.styles ?? {})) add(s.fontFamily);
  for (const { band } of walkBands(template)) {
    for (const c of band.components) {
      add(c.style?.fontFamily);
      c.conditions?.forEach((cond) => add(cond.style.fontFamily));
    }
  }
  return out;
}
