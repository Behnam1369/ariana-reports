import { describe, expect, it } from 'vitest';
import {
  ARIANA_STYLES,
  bandColorVars,
  DARK_THEME,
  DesignerController,
  findComponent,
  fontFamilies,
  ICONS,
  themeFromMui,
  themeVars,
  validateTemplate,
  wrapSelection,
} from '../../src';
import { invoiceTemplate } from '../fixtures/invoice';

describe('themes', () => {
  it('maps theme values to CSS custom properties', () => {
    expect(themeVars(undefined)).toEqual({});
    expect(themeVars({ primary: '#f00', radius: 8, fontSize: '14px', mode: 'dark' })).toEqual({
      '--ar-primary': '#f00',
      '--ar-radius': '8px',
      '--ar-font-size': '14px',
      colorScheme: 'dark',
    });
    expect(Object.keys(themeVars(DARK_THEME)).length).toBeGreaterThan(10);
  });

  it('every variable a theme can set is used by the stylesheet', () => {
    for (const name of Object.keys(themeVars({ ...DARK_THEME, radius: 1, fontFamily: 'x', fontSize: 1 }))) {
      if (name.startsWith('--')) expect(ARIANA_STYLES).toContain(`var(${name})`);
    }
  });

  it('builds a theme from a Material UI theme', () => {
    const theme = themeFromMui(
      {
        palette: {
          mode: 'light',
          primary: { main: '#9c27b0', contrastText: '#fff' },
          error: { main: '#e53935' },
          background: { default: '#fafafa', paper: '#fff' },
          text: { primary: '#212121', secondary: '#757575' },
          divider: 'rgba(0,0,0,0.12)',
          grey: { 700: '#616161' },
        },
        shape: { borderRadius: 4 },
        typography: { fontFamily: 'Roboto, sans-serif', fontSize: 14 },
      },
      { bandColor: '#37474f' },
    );
    expect(theme).toMatchObject({
      mode: 'light',
      primary: '#9c27b0',
      onPrimary: '#fff',
      danger: '#e53935',
      background: '#fafafa',
      surface: '#fff',
      text: '#212121',
      textMuted: '#757575',
      border: 'rgba(0,0,0,0.12)',
      radius: 4,
      fontFamily: 'Roboto, sans-serif',
      fontSize: 13,
      bandColor: '#37474f',
    });
    expect(themeFromMui({ palette: { mode: 'dark', primary: { main: '#90caf9' } } }).mode).toBe('dark');
  });

  it('computes readable caption colors for custom band colors', () => {
    expect(bandColorVars(undefined)).toEqual({});
    expect(bandColorVars('not a color')).toEqual({});
    expect(bandColorVars('#1e3a8a')).toEqual({ '--ar-band-color': '#1e3a8a', '--ar-band-caption-text': '#ffffff' });
    expect(bandColorVars('#fde68a')['--ar-band-caption-text']).toBe('#111827');
  });
});

describe('design helpers', () => {
  it('validates band design colors', () => {
    const t = invoiceTemplate();
    t.reportHeader!.designColor = '#336699';
    expect(validateTemplate(t).errors).toEqual([]);
    t.reportHeader!.designColor = 'blue; x';
    expect(validateTemplate(t).errors.map((e) => e.path)).toContain('reportHeader.designColor');
  });

  it('wraps a selection in markup', () => {
    expect(wrapSelection('hello world', 0, 5, '<b>', '</b>')).toEqual({ text: '<b>hello</b> world', start: 3, end: 8 });
    expect(wrapSelection('ab', 1, 1, '{{ x }}')).toEqual({ text: 'a{{ x }}b', start: 8, end: 8 });
  });

  it('resizes several components at once as one step', () => {
    const c = new DesignerController({ template: invoiceTemplate(), settings: { snapToGrid: false, snapToObjects: false } });
    c.beginInteraction('Resize');
    c.resizeComponents(['d_id', 'd_total'], 's', 0, 3);
    c.endInteraction();
    const h = (id: string) => findComponent(c.template, id)!.component.height;
    expect([h('d_id'), h('d_total')]).toEqual([10, 10]);
    c.undo();
    expect([h('d_id'), h('d_total')]).toEqual([7, 7]);
  });

  it('has an icon for every component type', () => {
    for (const type of ['text', 'image', 'line', 'rectangle'] as const) expect(ICONS[type]).toMatch(/^M/);
  });
});

describe('designer additions', () => {
  const make = () => new DesignerController({ template: invoiceTemplate(), settings: { snapToGrid: false, snapToObjects: false } });

  it('aligns the content of selected texts and reports the common alignment', () => {
    const c = make();
    c.select(['d_id', 'd_total']);
    expect(c.textAlignment()).toEqual({ textAlign: 'left', verticalAlign: 'top' }); // defaults
    c.setTextAlign('center');
    c.setVerticalAlign('bottom');
    expect(c.textAlignment()).toEqual({ textAlign: 'center', verticalAlign: 'bottom' });
    expect(findComponent(c.template, 'd_id')!.component.x).toBe(0);
    c.clearSelection();
    expect(c.textAlignment()).toEqual({ textAlign: null, verticalAlign: null });
  });

  it('selects across bands in the band with the most hits', () => {
    const c = make();
    const all = { x: -10, y: -10, width: 500, height: 500 };
    c.selectInBands([
      { bandId: 'orders_footer', rect: all },
      { bandId: 'order_detail', rect: all },
      { bandId: 'nope', rect: all },
    ]);
    expect(c.getState().selection).toEqual({ componentIds: ['d_id', 'd_total'], bandId: 'order_detail' });
    c.selectInBands([{ bandId: 'order_detail', rect: { x: 500, y: 500, width: 1, height: 1 } }]);
    expect(c.getState().selection.componentIds).toEqual([]);
  });

  it('lists standard, extra and used font families once', () => {
    const t = invoiceTemplate();
    t.styles = { ...t.styles, fa: { fontFamily: 'Vazirmatn' } };
    expect(fontFamilies(t, ['Lato', 'helvetica', 'Vazirmatn'])).toEqual(['Helvetica', 'Times', 'Courier', 'Lato', 'Vazirmatn']);
  });
});
