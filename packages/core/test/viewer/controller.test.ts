// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPrintDocument,
  clampZoom,
  CSS,
  fitZoom,
  generateReport,
  MAX_ZOOM,
  MIN_ZOOM,
  PDF_MIME,
  printDocument,
  PX_PER_PT,
  ViewerController,
  XLSX_MIME,
  zoomInStep,
  zoomOutStep,
  type ViewerState,
} from '../../src';
import { band, region, text, tpl } from '../layout/helpers';

const template = () => tpl({ name: 'Sales / Q1', body: [region({ detail: band(100, [text('{{ row.id }}')]) })] });
const data = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ id: i + 1 })) });

describe('zoom helpers', () => {
  it('clamps zoom', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it('steps through zoom levels from any value', () => {
    expect(zoomInStep(1)).toBe(1.25);
    expect(zoomInStep(1.1)).toBe(1.25);
    expect(zoomInStep(4)).toBe(4);
    expect(zoomOutStep(1)).toBe(0.75);
    expect(zoomOutStep(1.1)).toBe(1);
    expect(zoomOutStep(0.25)).toBe(0.25);
  });

  it('fits width or the whole page', () => {
    const doc = { pageWidth: 600, pageHeight: 800 };
    const width = 600 * PX_PER_PT + 32;
    expect(fitZoom(doc, { width, height: 10_000 }, 'fitWidth')).toBeCloseTo(1, 6);
    expect(fitZoom(doc, { width, height: 400 * PX_PER_PT + 32 }, 'fitPage')).toBeCloseTo(0.5, 6);
    expect(fitZoom(doc, { width: 0, height: 0 }, 'fitPage')).toBe(MIN_ZOOM);
  });
});

describe('ViewerController', () => {
  it('generates, notifies subscribers and exposes page info', () => {
    const c = new ViewerController();
    const states: ViewerState[] = [];
    const unsubscribe = c.subscribe((s) => states.push(s));
    const doc = c.load(template(), data(5));
    expect(doc!.pages).toHaveLength(3);
    expect(c.getState()).toMatchObject({ pageCount: 3, pageIndex: 0, error: null });
    expect(states.length).toBeGreaterThan(0);
    unsubscribe();
    c.nextPage();
    expect(states.at(-1)!.pageIndex).toBe(0);
  });

  it('navigates within bounds', () => {
    const c = new ViewerController();
    c.load(template(), data(5));
    c.nextPage();
    c.nextPage();
    c.nextPage();
    expect(c.getState().pageIndex).toBe(2);
    c.previousPage();
    expect(c.getState().pageIndex).toBe(1);
    c.firstPage();
    expect(c.getState().pageIndex).toBe(0);
    c.lastPage();
    expect(c.getState().pageIndex).toBe(2);
    c.goToPage(-5);
    expect(c.getState().pageIndex).toBe(0);
    c.goToPage(1.7);
    expect(c.getState().pageIndex).toBe(1);
  });

  it('keeps the page index valid after regenerating with fewer pages', () => {
    const c = new ViewerController();
    c.load(template(), data(5));
    c.lastPage();
    c.load(template(), data(1));
    expect(c.getState()).toMatchObject({ pageCount: 1, pageIndex: 0 });
  });

  it('stores generation errors instead of throwing', () => {
    const c = new ViewerController();
    expect(c.load({ ...template(), unit: 'x' } as any, {})).toBeNull();
    expect(c.getState().error!.message).toMatch(/Invalid report template/);
    expect(c.getState().document).toBeNull();
    c.nextPage();
    expect(c.getState().pageIndex).toBe(0);
    c.load(template(), data(1));
    expect(c.getState().error).toBeNull();
  });

  it('regenerates with new options such as params', () => {
    const t = tpl({ parameters: [{ name: 'p', type: 'string' }], body: [{ kind: 'band', ...band(10, [text('{{ params.p }}')]) }] });
    const c = new ViewerController();
    c.load(t, {}, { params: { p: 'a' } });
    c.setOptions({ params: { p: 'b' } });
    const doc = c.regenerate()!;
    expect((doc.pages[0]!.bands[0]!.items[0] as any).text).toBe('b');
  });

  it('shows a prebuilt document and does not regenerate it', () => {
    const c = new ViewerController();
    const doc = generateReport(template(), data(2));
    c.show(doc);
    expect(c.getState().document).toBe(doc);
    expect(c.regenerate()).toBe(doc);
  });

  it('zooms by steps and to custom values', () => {
    const c = new ViewerController({ zoom: 1 });
    c.zoomIn();
    expect(c.getState().zoom).toBe(1.25);
    c.zoomOut();
    c.zoomOut();
    expect(c.getState().zoom).toBe(0.75);
    c.setZoom(100);
    expect(c.getState()).toMatchObject({ zoom: MAX_ZOOM, zoomMode: 'custom' });
  });

  it('follows the container in fit modes and leaves them on manual zoom', () => {
    const c = new ViewerController({ zoomMode: 'fitWidth' });
    c.load(template(), data(1));
    c.setContainerSize(200 * PX_PER_PT * 2 + 32, 500);
    expect(c.getState().zoom).toBeCloseTo(2, 6);
    c.setZoomMode('fitPage');
    expect(c.getState().zoom).toBeCloseTo((500 - 32) / (300 * PX_PER_PT), 6);
    c.zoomIn();
    expect(c.getState().zoomMode).toBe('custom');
    const zoom = c.getState().zoom;
    c.setContainerSize(100, 100);
    expect(c.getState().zoom).toBe(zoom);
  });

  it('exports and saves PDF and Excel with safe file names, tracking busy state', async () => {
    const save = vi.fn();
    const c = new ViewerController({ save });
    c.load(template(), data(2));
    const busy: boolean[] = [];
    c.subscribe((s) => busy.push(s.busy));
    await c.downloadPdf();
    await c.downloadExcel('custom.xlsx');
    expect(save).toHaveBeenCalledTimes(2);
    const [pdfBytes, pdfName, pdfMime] = save.mock.calls[0]!;
    expect(new TextDecoder().decode((pdfBytes as Uint8Array).slice(0, 5))).toBe('%PDF-');
    expect(pdfName).toBe('Sales - Q1.pdf');
    expect(pdfMime).toBe(PDF_MIME);
    expect(save.mock.calls[1]!.slice(1)).toEqual(['custom.xlsx', XLSX_MIME]);
    expect(busy).toEqual([true, false, true, false]);
    expect(c.getState().busy).toBe(false);
  });

  it('rejects exports before a report exists', async () => {
    const c = new ViewerController();
    await expect(c.exportPdf()).rejects.toThrow(/No report/);
    await expect(c.downloadExcel()).rejects.toThrow(/No report/);
    expect(c.getState().busy).toBe(false);
  });

  it('passes export options through', async () => {
    const onWarning = vi.fn();
    const t = tpl({ body: [{ kind: 'band', ...band(20, [{ id: 'i', type: 'image', x: 0, y: 0, width: 10, height: 10, src: 'x.png' }]) }] });
    const c = new ViewerController({ pdf: { loadImage: async () => new Uint8Array([1, 2, 3]), onWarning } });
    c.load(t, {});
    await c.exportPdf();
    expect(onWarning).toHaveBeenCalledWith(expect.stringMatching(/not a PNG or JPEG/));
  });
});

describe('printing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('builds a print document with page size and page breaks', () => {
    const doc = generateReport(template(), data(3));
    const target = document.implementation.createHTMLDocument('print');
    buildPrintDocument(doc, target);
    expect(target.title).toBe('Sales / Q1');
    expect(target.querySelectorAll(`.${CSS.page}`)).toHaveLength(2);
    const css = target.querySelector('style')!.textContent!;
    expect(css).toContain('@page { size: 200pt 300pt; margin: 0; }');
    expect(css).toContain('break-after: page');
  });

  it('prints through a hidden iframe and removes it afterwards', async () => {
    vi.useFakeTimers();
    const print = vi.fn();
    const original = HTMLIFrameElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(original, 'contentWindow')!;
    vi.spyOn(original, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
      const win = descriptor.get!.call(this) as Window;
      win.print = print;
      return win;
    });
    const doc = generateReport(template(), data(1));
    const done = printDocument(doc);
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    await done;
    const iframe = document.querySelector('iframe')!;
    expect(iframe.getAttribute('aria-hidden')).toBe('true');
    expect(iframe.contentDocument!.querySelectorAll(`.${CSS.page}`)).toHaveLength(1);
    vi.runAllTimers();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
