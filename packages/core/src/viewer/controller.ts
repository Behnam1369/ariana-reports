import { downloadBytes, PDF_MIME, safeFileName, XLSX_MIME } from '../export/download';
import { exportExcel, type ExcelExportOptions } from '../export/excel';
import { exportPdf, type PdfExportOptions } from '../export/pdf';
import { generateReport, type GenerateOptions } from '../layout/engine';
import type { LayoutDocument } from '../layout/types';
import type { ReportTemplate } from '../model/types';
import { PX_PER_PT, renderPage } from './render';

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** "custom" keeps the selected zoom; the fit modes follow the container size. */
export type ZoomMode = 'custom' | 'fitWidth' | 'fitPage';

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Next zoom level above the current zoom. */
export function zoomInStep(zoom: number): number {
  return ZOOM_LEVELS.find((z) => z > zoom + 1e-9) ?? MAX_ZOOM;
}

/** Next zoom level below the current zoom. */
export function zoomOutStep(zoom: number): number {
  return [...ZOOM_LEVELS].reverse().find((z) => z < zoom - 1e-9) ?? MIN_ZOOM;
}

/** Zoom that makes a page fit a container. `padding` is the CSS pixel gap kept around the page. */
export function fitZoom(
  doc: Pick<LayoutDocument, 'pageWidth' | 'pageHeight'>,
  container: { width: number; height: number },
  mode: 'fitWidth' | 'fitPage',
  padding = 32,
): number {
  const w = (container.width - padding) / (doc.pageWidth * PX_PER_PT);
  const h = (container.height - padding) / (doc.pageHeight * PX_PER_PT);
  const zoom = mode === 'fitWidth' ? w : Math.min(w, h);
  return clampZoom(zoom > 0 ? zoom : MIN_ZOOM);
}

export interface ViewerState {
  /** Null until the first successful generation. */
  document: LayoutDocument | null;
  /** Generation error (invalid template, page limit, ...). */
  error: Error | null;
  /** 0-based index of the current page. */
  pageIndex: number;
  pageCount: number;
  zoom: number;
  zoomMode: ZoomMode;
  /** True while an export runs. */
  busy: boolean;
}

export interface ViewerControllerOptions extends GenerateOptions {
  pdf?: PdfExportOptions;
  excel?: ExcelExportOptions;
  /** Initial zoom. Defaults to 1. */
  zoom?: number;
  zoomMode?: ZoomMode;
  /** Replaces the browser download (useful for tests or custom saving). */
  save?: (bytes: Uint8Array, fileName: string, mimeType: string) => void;
}

type Listener = (state: ViewerState) => void;

/**
 * Framework-neutral viewer logic: generation, navigation, zoom, export and
 * print. The React and Vue viewers are thin views over this controller.
 */
export class ViewerController {
  private state: ViewerState;
  private readonly listeners = new Set<Listener>();
  private template: ReportTemplate | string | null = null;
  private data: unknown = {};
  private options: ViewerControllerOptions;
  private containerSize: { width: number; height: number } | null = null;

  constructor(options: ViewerControllerOptions = {}) {
    this.options = options;
    this.state = {
      document: null,
      error: null,
      pageIndex: 0,
      pageCount: 0,
      zoom: clampZoom(options.zoom ?? 1),
      zoomMode: options.zoomMode ?? 'custom',
      busy: false,
    };
  }

  getState(): ViewerState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<ViewerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Updates generate/export options without regenerating. */
  setOptions(options: ViewerControllerOptions): void {
    this.options = { ...this.options, ...options };
  }

  /** Generates the report. Errors are stored in `state.error`, never thrown. */
  load(template: ReportTemplate | string, data: unknown, options?: ViewerControllerOptions): LayoutDocument | null {
    this.template = template;
    this.data = data;
    if (options) this.setOptions(options);
    return this.regenerate();
  }

  /** Shows an already generated layout document. */
  show(document: LayoutDocument): void {
    this.template = null;
    this.apply(document);
  }

  private apply(document: LayoutDocument): void {
    this.set({
      document,
      error: null,
      pageCount: document.pages.length,
      pageIndex: Math.min(this.state.pageIndex, Math.max(0, document.pages.length - 1)),
    });
    this.applyFit();
  }

  /** Regenerates from the last loaded template and data (e.g. after changing params). */
  regenerate(): LayoutDocument | null {
    if (this.template === null) return this.state.document;
    try {
      const doc = generateReport(this.template, this.data, this.options);
      this.apply(doc);
      return doc;
    } catch (err) {
      this.set({ error: err instanceof Error ? err : new Error(String(err)), document: null, pageCount: 0, pageIndex: 0 });
      return null;
    }
  }

  // -- navigation -------------------------------------------------------------

  goToPage(index: number): void {
    if (this.state.pageCount === 0) return;
    const i = Math.min(this.state.pageCount - 1, Math.max(0, Math.trunc(index)));
    if (i !== this.state.pageIndex) this.set({ pageIndex: i });
  }

  nextPage(): void {
    this.goToPage(this.state.pageIndex + 1);
  }

  previousPage(): void {
    this.goToPage(this.state.pageIndex - 1);
  }

  firstPage(): void {
    this.goToPage(0);
  }

  lastPage(): void {
    this.goToPage(this.state.pageCount - 1);
  }

  // -- zoom -------------------------------------------------------------------

  setZoom(zoom: number): void {
    this.set({ zoom: clampZoom(zoom), zoomMode: 'custom' });
  }

  zoomIn(): void {
    this.setZoom(zoomInStep(this.state.zoom));
  }

  zoomOut(): void {
    this.setZoom(zoomOutStep(this.state.zoom));
  }

  setZoomMode(mode: ZoomMode): void {
    this.set({ zoomMode: mode });
    this.applyFit();
  }

  /** Call when the viewer's scroll container is resized; fit modes recompute the zoom. */
  setContainerSize(width: number, height: number): void {
    this.containerSize = { width, height };
    this.applyFit();
  }

  private applyFit(): void {
    const { document: doc, zoomMode } = this.state;
    if (!doc || !this.containerSize || zoomMode === 'custom') return;
    const zoom = fitZoom(doc, this.containerSize, zoomMode);
    if (Math.abs(zoom - this.state.zoom) > 1e-6) this.set({ zoom });
  }

  // -- export -----------------------------------------------------------------

  private async run<T>(task: () => Promise<T>): Promise<T> {
    this.set({ busy: true });
    try {
      return await task();
    } finally {
      this.set({ busy: false });
    }
  }

  private requireDocument(): LayoutDocument {
    const doc = this.state.document;
    if (!doc) throw new Error('No report has been generated');
    return doc;
  }

  private save(bytes: Uint8Array, fileName: string, mime: string): void {
    (this.options.save ?? downloadBytes)(bytes, fileName, mime);
  }

  exportPdf(options?: PdfExportOptions): Promise<Uint8Array> {
    return this.run(() => exportPdf(this.requireDocument(), { ...this.options.pdf, ...options }));
  }

  exportExcel(options?: ExcelExportOptions): Promise<Uint8Array> {
    return this.run(() => exportExcel(this.requireDocument(), { ...this.options.excel, ...options }));
  }

  async downloadPdf(fileName?: string): Promise<void> {
    const doc = this.requireDocument();
    const bytes = await this.exportPdf();
    this.save(bytes, fileName ?? safeFileName(doc.name, 'pdf'), PDF_MIME);
  }

  async downloadExcel(fileName?: string): Promise<void> {
    const doc = this.requireDocument();
    const bytes = await this.exportExcel();
    this.save(bytes, fileName ?? safeFileName(doc.name, 'xlsx'), XLSX_MIME);
  }

  /** Prints every page through a hidden iframe. Browser only. */
  print(): Promise<void> {
    return printDocument(this.requireDocument());
  }
}

/** Builds a standalone HTML document with all pages, sized for printing. */
export function buildPrintDocument(doc: LayoutDocument, target: Document): void {
  const style = target.createElement('style');
  const w = Number(doc.pageWidth.toFixed(3));
  const h = Number(doc.pageHeight.toFixed(3));
  style.textContent = [
    `@page { size: ${w}pt ${h}pt; margin: 0; }`,
    'html, body { margin: 0; padding: 0; background: #fff; }',
    '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.ar-page { break-after: page; page-break-after: always; }',
    '.ar-page:last-child { break-after: auto; page-break-after: auto; }',
  ].join('\n');
  target.head.appendChild(style);
  target.title = doc.name;
  doc.pages.forEach((_, i) => target.body.appendChild(renderPage(doc, i, { ownerDocument: target })));
}

/**
 * Prints a layout document via a hidden iframe so the host page is untouched.
 * Resolves after the print dialog has been opened.
 */
export function printDocument(doc: LayoutDocument): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('printDocument() requires a browser'));
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const target = iframe.contentDocument;
  if (!win || !target) {
    iframe.remove();
    return Promise.reject(new Error('Could not create a print frame'));
  }
  buildPrintDocument(doc, target);
  return new Promise((resolve) => {
    const cleanup = () => {
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };
    // Wait for images, then print.
    const images = Array.from(target.images);
    Promise.all(
      images.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => ((img.onload = () => r()), (img.onerror = () => r()))))),
    ).then(() => {
      win.focus();
      win.print();
      cleanup();
    });
  });
}
