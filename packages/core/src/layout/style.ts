import type { BorderSpec, Padding, StyleProps, Unit } from '../model/types';
import { BORDER_SIDES } from '../model/types';
import { toPoints } from '../model/units';
import type { ResolvedBorder, ResolvedPadding, ResolvedStyle } from './types';

export const DEFAULT_STYLE: Readonly<Required<Omit<StyleProps, 'backgroundColor' | 'border' | 'padding'>>> = {
  fontFamily: 'Helvetica',
  fontSize: 10,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#000000',
  textAlign: 'left',
  verticalAlign: 'top',
};

/** Merges style layers; later layers win. Undefined values do not override. */
export function mergeStyles(...layers: (StyleProps | undefined)[]): StyleProps {
  const out: StyleProps = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function resolvePadding(padding: number | Padding | undefined, unit: Unit): ResolvedPadding {
  if (padding === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof padding === 'number') {
    const p = toPoints(padding, unit);
    return { top: p, right: p, bottom: p, left: p };
  }
  return {
    top: toPoints(padding.top, unit),
    right: toPoints(padding.right, unit),
    bottom: toPoints(padding.bottom, unit),
    left: toPoints(padding.left, unit),
  };
}

export function resolveBorder(border: BorderSpec | undefined): ResolvedBorder | undefined {
  if (!border || border.width <= 0) return undefined;
  const sides = border.sides ?? [...BORDER_SIDES];
  if (sides.length === 0) return undefined;
  return { width: border.width, color: border.color, style: border.style, sides: [...sides] };
}

/** Resolves a merged style into concrete values in points. */
export function resolveStyle(style: StyleProps, unit: Unit): ResolvedStyle {
  const resolved: ResolvedStyle = {
    fontFamily: style.fontFamily ?? DEFAULT_STYLE.fontFamily,
    fontSize: style.fontSize ?? DEFAULT_STYLE.fontSize,
    fontWeight: style.fontWeight ?? DEFAULT_STYLE.fontWeight,
    fontStyle: style.fontStyle ?? DEFAULT_STYLE.fontStyle,
    textDecoration: style.textDecoration ?? DEFAULT_STYLE.textDecoration,
    color: style.color ?? DEFAULT_STYLE.color,
    textAlign: style.textAlign ?? DEFAULT_STYLE.textAlign,
    verticalAlign: style.verticalAlign ?? DEFAULT_STYLE.verticalAlign,
    padding: resolvePadding(style.padding, unit),
  };
  if (style.backgroundColor !== undefined && style.backgroundColor !== 'transparent') {
    resolved.backgroundColor = style.backgroundColor;
  }
  const border = resolveBorder(style.border);
  if (border) resolved.border = border;
  return resolved;
}
