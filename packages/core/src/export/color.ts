export interface RGBA {
  /** 0..255 */
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function channel(text: string): number {
  const t = text.trim();
  if (t.endsWith('%')) return clamp(Math.round((parseFloat(t) / 100) * 255), 0, 255);
  return clamp(Math.round(parseFloat(t)), 0, 255);
}

function alpha(text: string): number {
  const t = text.trim();
  if (t.endsWith('%')) return clamp(parseFloat(t) / 100, 0, 1);
  return clamp(parseFloat(t), 0, 1);
}

/**
 * Parses the color formats allowed in templates: #rgb, #rgba, #rrggbb,
 * #rrggbbaa, rgb(), rgba() and "transparent". Returns null for anything else.
 */
export function parseColor(input: string | undefined | null): RGBA | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = 'f'] = hex.split('').map((c) => c + c) as string[];
      return { r: parseInt(r!, 16), g: parseInt(g!, 16), b: parseInt(b!, 16), a: parseInt(a.length === 1 ? a + a : a, 16) / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  const m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1]!.split(',');
    if (parts.length !== 3 && parts.length !== 4) return null;
    if (parts.some((p) => Number.isNaN(parseFloat(p)))) return null;
    return { r: channel(parts[0]!), g: channel(parts[1]!), b: channel(parts[2]!), a: parts[3] === undefined ? 1 : alpha(parts[3]) };
  }
  return null;
}

/** Excel ARGB hex, e.g. "FF1F2937". */
export function toArgb(color: RGBA): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  return h(color.a * 255) + h(color.r) + h(color.g) + h(color.b);
}
