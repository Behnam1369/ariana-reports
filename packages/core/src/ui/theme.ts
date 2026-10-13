import { parseColor } from '../export/color';

/**
 * Theme of the viewer and designer UI. Every value is optional and maps to a
 * CSS custom property on the component's root element, so you can also set
 * the variables in your own CSS (`.ar-root { --ar-primary: … }`).
 *
 * | property          | CSS variable        | used for                              |
 * | ----------------- | ------------------- | ------------------------------------- |
 * | `primary`         | `--ar-primary`      | selection, focus, active buttons      |
 * | `onPrimary`       | `--ar-on-primary`   | text on primary backgrounds           |
 * | `background`      | `--ar-bg`           | workspace behind pages and panels     |
 * | `surface`         | `--ar-surface`      | toolbars and panels                   |
 * | `surfaceVariant`  | `--ar-surface-2`    | section headers, hover backgrounds    |
 * | `inputBackground` | `--ar-input-bg`     | inputs and selects                    |
 * | `border`          | `--ar-border`       | dividers and input borders            |
 * | `text`            | `--ar-text`         | text                                  |
 * | `textMuted`       | `--ar-muted`        | labels and hints                      |
 * | `danger`          | `--ar-danger`       | errors and delete buttons             |
 * | `radius`          | `--ar-radius`       | corner radius of controls             |
 * | `fontFamily`      | `--ar-font`         | UI font                               |
 * | `fontSize`        | `--ar-font-size`    | base UI font size                     |
 * | `bandColor`       | `--ar-band-color`   | default band caption color (design)   |
 */
export interface ArianaTheme {
  /** "dark" also switches native controls (scrollbars, pickers) to dark. */
  mode?: 'light' | 'dark';
  primary?: string;
  onPrimary?: string;
  background?: string;
  surface?: string;
  surfaceVariant?: string;
  inputBackground?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  danger?: string;
  /** Number = pixels. */
  radius?: number | string;
  fontFamily?: string;
  /** Number = pixels. */
  fontSize?: number | string;
  bandColor?: string;
}

const VARS: Record<Exclude<keyof ArianaTheme, 'mode'>, string> = {
  primary: '--ar-primary',
  onPrimary: '--ar-on-primary',
  background: '--ar-bg',
  surface: '--ar-surface',
  surfaceVariant: '--ar-surface-2',
  inputBackground: '--ar-input-bg',
  border: '--ar-border',
  text: '--ar-text',
  textMuted: '--ar-muted',
  danger: '--ar-danger',
  radius: '--ar-radius',
  fontFamily: '--ar-font',
  fontSize: '--ar-font-size',
  bandColor: '--ar-band-color',
};

/** Dark preset; combine with your own values: `{ ...DARK_THEME, primary: '#90caf9' }`. */
export const DARK_THEME: ArianaTheme = {
  mode: 'dark',
  primary: '#90caf9',
  onPrimary: '#0b1220',
  background: '#0f1115',
  surface: '#1b1e24',
  surfaceVariant: '#252a32',
  inputBackground: '#14171c',
  border: 'rgba(255, 255, 255, 0.14)',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
  danger: '#f28b82',
  bandColor: '#5c6b77',
};

/**
 * Converts a theme to a style object of CSS custom properties, to put on the
 * root element (the components do this for their `theme` prop).
 */
export function themeVars(theme: ArianaTheme | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!theme) return out;
  for (const [key, cssVar] of Object.entries(VARS) as [keyof typeof VARS, string][]) {
    const v = theme[key];
    if (v === undefined || v === null || v === '') continue;
    out[cssVar] = typeof v === 'number' ? `${v}px` : String(v);
  }
  if (theme.mode) out.colorScheme = theme.mode;
  return out;
}

/** The parts of a Material UI (MUI v5/v6/v7) theme that `themeFromMui` reads. */
export interface MuiThemeLike {
  palette: {
    mode?: 'light' | 'dark';
    primary: { main: string; contrastText?: string };
    error?: { main: string };
    background?: { default?: string; paper?: string };
    text?: { primary?: string; secondary?: string };
    divider?: string;
    action?: { hover?: string; selected?: string };
    grey?: Record<string | number, string | undefined>;
  };
  shape?: { borderRadius?: number | string };
  typography?: { fontFamily?: string; fontSize?: number };
}

/**
 * Builds a theme from a Material UI theme, so the report UI follows your
 * application's palette, dark mode, radius and font:
 *
 * ```tsx
 * const muiTheme = useTheme();
 * <ReportDesigner theme={themeFromMui(muiTheme)} />
 * ```
 *
 * No MUI dependency is needed: any object with the same shape works.
 */
export function themeFromMui(mui: MuiThemeLike, overrides: ArianaTheme = {}): ArianaTheme {
  const p = mui.palette;
  const dark = p.mode === 'dark';
  const paper = p.background?.paper ?? (dark ? '#121212' : '#ffffff');
  const theme: ArianaTheme = {
    mode: dark ? 'dark' : 'light',
    primary: p.primary.main,
    onPrimary: p.primary.contrastText ?? '#ffffff',
    background: p.background?.default ?? (dark ? '#121212' : '#f5f5f5'),
    surface: paper,
    surfaceVariant: p.action?.hover ?? (dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'),
    inputBackground: paper,
    border: p.divider ?? (dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'),
    text: p.text?.primary ?? (dark ? '#ffffff' : 'rgba(0, 0, 0, 0.87)'),
    textMuted: p.text?.secondary ?? (dark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)'),
    danger: p.error?.main ?? '#d32f2f',
  };
  if (mui.shape?.borderRadius !== undefined) theme.radius = mui.shape.borderRadius;
  if (mui.typography?.fontFamily) theme.fontFamily = mui.typography.fontFamily;
  if (mui.typography?.fontSize) theme.fontSize = Math.max(11, mui.typography.fontSize - 1);
  const grey = p.grey?.[700];
  if (grey && !dark) theme.bandColor = grey;
  return { ...theme, ...overrides };
}

/** Relative luminance (0 = black, 1 = white) of a color, or null when invalid. */
export function luminance(color: string | undefined): number | null {
  const c = parseColor(color);
  if (!c) return null;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * CSS custom properties for a band with a custom `designColor`: the caption
 * color and a readable caption text color. Empty when the band uses the
 * theme's default band color.
 */
export function bandColorVars(designColor: string | undefined): Record<string, string> {
  const c = parseColor(designColor);
  if (!designColor || !c || c.a === 0) return {};
  const lum = luminance(designColor) ?? 0;
  return {
    '--ar-band-color': designColor.trim(),
    '--ar-band-caption-text': lum > 0.45 ? '#111827' : '#ffffff',
  };
}
