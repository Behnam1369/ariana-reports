// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  ARIANA_STYLES,
  componentPreview,
  DEFAULT_LABELS,
  designScale,
  injectStyles,
  mergeLabels,
  PX_PER_PT,
  STYLE_ELEMENT_ID,
  type ReportComponent,
} from '../../src';
import { invoiceTemplate } from '../fixtures/invoice';

describe('styles', () => {
  it('injects the stylesheet once', () => {
    injectStyles();
    injectStyles(document);
    const els = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(els).toHaveLength(1);
    expect(els[0]!.textContent).toBe(ARIANA_STYLES);
  });

  it('is a no-op without a document', () => {
    expect(() => injectStyles(undefined)).not.toThrow();
  });
});

describe('labels', () => {
  it('merges overrides over the defaults', () => {
    const labels = mergeLabels({ print: 'Drucken' });
    expect(labels.print).toBe('Drucken');
    expect(labels.zoomIn).toBe(DEFAULT_LABELS.zoomIn);
    expect(mergeLabels()).toEqual(DEFAULT_LABELS);
  });
});

describe('design helpers', () => {
  it('designScale converts template units to CSS pixels', () => {
    expect(designScale('pt')).toBeCloseTo(PX_PER_PT, 10);
    expect(designScale('in')).toBeCloseTo(96, 10);
    expect(designScale('mm', 2)).toBeCloseTo((96 / 25.4) * 2, 10);
  });

  it('previews text with named and inline styles', () => {
    const t = invoiceTemplate();
    const c = { ...t.reportHeader!.components[0]!, style: { textAlign: 'center', backgroundColor: '#ff0000', border: { width: 1, color: '#000', style: 'solid', sides: ['bottom'] } } } as ReportComponent;
    const p = componentPreview(c, t);
    expect(p.label).toBe('{{ params.title }}');
    expect(p.error).toBeNull();
    expect(p.style).toMatchObject({
      left: '0px',
      fontWeight: 'bold',
      color: 'rgb(31, 41, 55)',
      textAlign: 'center',
      background: 'rgb(255, 0, 0)',
      borderBottom: `${Number(PX_PER_PT.toFixed(3))}px solid rgb(0, 0, 0)`,
      fontSize: `${Number((16 * PX_PER_PT).toFixed(3))}px`,
    });
    expect(p.style.borderTop).toBeUndefined();
    expect(parseFloat(p.style.width!)).toBeCloseTo(190 * designScale('mm'), 2);
  });

  it('previews the text direction', () => {
    const t = invoiceTemplate();
    const base = { id: 'x', type: 'text', x: 0, y: 0, width: 50, height: 10, text: 'سلام' } as ReportComponent;
    // auto: the browser decides from the text (dir="auto") and aligns to the start edge.
    const auto = componentPreview(base, t);
    expect(auto.dir).toBe('auto');
    expect(auto.style.textAlign).toBe('start');
    const rtl = componentPreview({ ...base, style: { direction: 'rtl' } } as ReportComponent, t);
    expect(rtl.dir).toBe('rtl');
    expect(rtl.style.textAlign).toBe('right');
    const aligned = componentPreview({ ...base, style: { direction: 'auto', textAlign: 'center' } } as ReportComponent, t);
    expect(aligned.style.textAlign).toBe('center');
    expect(componentPreview({ id: 'r', type: 'rectangle', x: 0, y: 0, width: 5, height: 5 } as ReportComponent, t).dir).toBeUndefined();
  });

  it('reports text syntax errors', () => {
    const t = invoiceTemplate();
    const c = { id: 'x', type: 'text', x: 0, y: 0, width: 10, height: 5, text: '{{ row.total +' } as ReportComponent;
    expect(componentPreview(c, t).error).toMatch(/unterminated/);
  });

  it('previews images, rectangles and lines', () => {
    const t = invoiceTemplate();
    expect(componentPreview(t.reportFooter!.components[0]!, t).label).toBe('Image');
    expect(componentPreview({ id: 'i', type: 'image', x: 0, y: 0, width: 1, height: 1, src: 'logo.png' }, t).label).toBe('logo.png');
    const rect = componentPreview({ id: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, cornerRadius: 2, style: { backgroundColor: '#00f' } }, t);
    expect(rect.style).toMatchObject({ background: 'rgb(0, 0, 255)' });
    expect(rect.style.borderRadius).toMatch(/px$/);
    const line = componentPreview(t.pageHeader!.components[0]!, t);
    expect(line.style.height).toBe('6px');
    expect(line.style.top).toMatch(/^calc\(/);
    const vline = componentPreview({ id: 'v', type: 'line', orientation: 'vertical', x: 5, y: 0, width: 0, height: 10 }, t);
    expect(vline.style.width).toBe('6px');
  });
});
