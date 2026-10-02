import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  injectStyles,
  mergeLabels,
  renderPage,
  ZOOM_LEVELS,
  type ExcelExportOptions,
  type GenerateOptions,
  type Labels,
  type LayoutDocument,
  type LayoutIssue,
  type PdfExportOptions,
  type ReportTemplate,
  type ViewerController,
  type ZoomMode,
} from '@ariana-report/core';
import { useLatest, useStore, useViewerController } from './hooks';

export interface ReportViewerProps extends Omit<GenerateOptions, 'validate'> {
  /** Template object or JSON text. Regenerates when the reference changes. */
  template?: ReportTemplate | string;
  /** JSON data. Regenerates when the reference changes. */
  data?: unknown;
  /** Show a prebuilt layout document instead of generating one. */
  document?: LayoutDocument;
  pdf?: PdfExportOptions;
  excel?: ExcelExportOptions;
  /** Show the toolbar. Defaults to true. */
  toolbar?: boolean;
  /** Which export buttons to show. Defaults to all. */
  exports?: { pdf?: boolean; excel?: boolean; print?: boolean };
  /** Open the issues panel initially. */
  showIssues?: boolean;
  zoom?: number;
  zoomMode?: ZoomMode;
  labels?: Partial<Labels>;
  /** Use an external controller (e.g. to drive the viewer from your own UI). */
  controller?: ViewerController;
  /** Add the default stylesheet to the document. Defaults to true. */
  injectStyles?: boolean;
  /** Replaces the browser download for exports. */
  save?: (bytes: Uint8Array, fileName: string, mimeType: string) => void;
  onError?: (error: Error) => void;
  onGenerated?: (document: LayoutDocument) => void;
  className?: string;
  style?: CSSProperties;
}

/** Renders one page of a layout document with the shared DOM renderer. */
export function ReportPage({ document: doc, pageIndex, zoom }: { document: LayoutDocument; pageIndex: number; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !doc.pages[pageIndex]) return;
    host.replaceChildren(renderPage(doc, pageIndex, { scale: zoom, ownerDocument: host.ownerDocument }));
  }, [doc, pageIndex, zoom]);
  return <div ref={ref} className="ar-page-host" />;
}

function IssuesPanel({ issues, labels }: { issues: LayoutIssue[]; labels: Labels }) {
  return (
    <aside className="ar-issues" aria-label={labels.issues}>
      <h2 className="ar-panel-title">{labels.issues}</h2>
      {issues.length === 0 ? (
        <p className="ar-hint">{labels.noIssues}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {issues.map((issue, i) => (
            <li key={i} className={`ar-issue ar-issue-${issue.severity}`}>
              <div>{issue.message}</div>
              {issue.expression && <code>{issue.expression}</code>}
              {(issue.componentId || issue.bandId) && <span className="ar-hint">{issue.componentId ?? issue.bandId}</span>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * Report viewer: generates a report from a template and JSON data and shows
 * it with page navigation, zoom, print and PDF/Excel export.
 */
export function ReportViewer(props: ReportViewerProps) {
  const {
    template,
    data,
    document: prebuilt,
    pdf,
    excel,
    toolbar = true,
    exports = {},
    showIssues = false,
    labels: labelOverrides,
    controller: external,
    injectStyles: inject = true,
    save,
    onError,
    onGenerated,
    className,
    style,
    params,
    locale,
    functions,
    measurer,
    maxPages,
    maxSteps,
  } = props;
  const controller = useViewerController({ zoom: props.zoom, zoomMode: props.zoomMode }, external);
  const state = useStore(controller);
  const labels = mergeLabels(labelOverrides);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [issuesOpen, setIssuesOpen] = useState(showIssues);
  const [pageInput, setPageInput] = useState('1');
  const onErrorRef = useLatest(onError);
  const onGeneratedRef = useLatest(onGenerated);

  useEffect(() => {
    if (inject) injectStyles(scrollRef.current?.ownerDocument);
  }, [inject]);

  controller.setOptions({ pdf, excel, save, params, locale, functions, measurer, maxPages, maxSteps });

  useEffect(() => {
    if (prebuilt) controller.show(prebuilt);
    else if (template !== undefined) controller.load(template, data ?? {});
    const s = controller.getState();
    if (s.error) onErrorRef.current?.(s.error);
    else if (s.document) onGeneratedRef.current?.(s.document);
    // Options are read through setOptions above; regenerate when inputs change.
  }, [controller, prebuilt, template, data, params, locale, functions, measurer, maxPages, maxSteps, onErrorRef, onGeneratedRef]);

  useEffect(() => {
    if (props.zoom !== undefined) controller.setZoom(props.zoom);
  }, [controller, props.zoom]);
  useEffect(() => {
    if (props.zoomMode !== undefined) controller.setZoomMode(props.zoomMode);
  }, [controller, props.zoomMode]);

  useEffect(() => setPageInput(String(state.pageIndex + 1)), [state.pageIndex, state.pageCount]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => controller.setContainerSize(el.clientWidth, el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [controller]);

  const run = (task: () => Promise<void>) => {
    task().catch((err: unknown) => onErrorRef.current?.(err instanceof Error ? err : new Error(String(err))));
  };

  const commitPage = () => {
    const n = Number.parseInt(pageInput, 10);
    if (Number.isFinite(n)) controller.goToPage(n - 1);
    setPageInput(String(controller.getState().pageIndex + 1));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      PageDown: () => controller.nextPage(),
      PageUp: () => controller.previousPage(),
      Home: () => controller.firstPage(),
      End: () => controller.lastPage(),
    };
    const action = (e.ctrlKey || e.metaKey ? undefined : keys[e.key]) ?? undefined;
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const doc = state.document;
  const hasDoc = !!doc;
  const atStart = state.pageIndex <= 0;
  const atEnd = state.pageIndex >= state.pageCount - 1;
  const issueCount = doc?.issues.length ?? 0;
  const zoomPercent = Math.round(state.zoom * 100);

  return (
    <div className={`ar-root ar-viewer${className ? ` ${className}` : ''}`} style={style}>
      {toolbar && (
        <div className="ar-toolbar" role="toolbar" aria-label="Report viewer">
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" aria-label={labels.firstPage} title={labels.firstPage} disabled={!hasDoc || atStart} onClick={() => controller.firstPage()}>
              «
            </button>
            <button type="button" className="ar-btn" aria-label={labels.previousPage} title={labels.previousPage} disabled={!hasDoc || atStart} onClick={() => controller.previousPage()}>
              ‹
            </button>
            <input
              className="ar-input ar-input-page"
              aria-label={labels.pageNumber}
              inputMode="numeric"
              value={pageInput}
              disabled={!hasDoc}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPage}
              onKeyDown={(e) => e.key === 'Enter' && commitPage()}
            />
            <span className="ar-hint">
              {labels.pageOf} {state.pageCount}
            </span>
            <button type="button" className="ar-btn" aria-label={labels.nextPage} title={labels.nextPage} disabled={!hasDoc || atEnd} onClick={() => controller.nextPage()}>
              ›
            </button>
            <button type="button" className="ar-btn" aria-label={labels.lastPage} title={labels.lastPage} disabled={!hasDoc || atEnd} onClick={() => controller.lastPage()}>
              »
            </button>
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" aria-label={labels.zoomOut} title={labels.zoomOut} onClick={() => controller.zoomOut()}>
              −
            </button>
            <select
              className="ar-select"
              aria-label={labels.zoom}
              value={state.zoomMode === 'custom' ? String(state.zoom) : state.zoomMode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'fitWidth' || v === 'fitPage') controller.setZoomMode(v);
                else controller.setZoom(Number(v));
              }}
            >
              {!ZOOM_LEVELS.includes(state.zoom as (typeof ZOOM_LEVELS)[number]) && state.zoomMode === 'custom' && (
                <option value={String(state.zoom)}>{zoomPercent}%</option>
              )}
              {ZOOM_LEVELS.map((z) => (
                <option key={z} value={String(z)}>
                  {Math.round(z * 100)}%
                </option>
              ))}
              <option value="fitWidth">{labels.fitWidth}</option>
              <option value="fitPage">{labels.fitPage}</option>
            </select>
            <button type="button" className="ar-btn" aria-label={labels.zoomIn} title={labels.zoomIn} onClick={() => controller.zoomIn()}>
              +
            </button>
          </div>
          <span className="ar-spacer" />
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" aria-pressed={issuesOpen} disabled={!hasDoc} onClick={() => setIssuesOpen((v) => !v)}>
              {labels.issues}
              {issueCount > 0 ? ` (${issueCount})` : ''}
            </button>
            {exports.print !== false && (
              <button type="button" className="ar-btn" disabled={!hasDoc || state.busy} onClick={() => run(() => controller.print())}>
                {labels.print}
              </button>
            )}
            {exports.pdf !== false && (
              <button type="button" className="ar-btn" title={labels.exportPdfTitle} disabled={!hasDoc || state.busy} onClick={() => run(() => controller.downloadPdf())}>
                {labels.exportPdf}
              </button>
            )}
            {exports.excel !== false && (
              <button type="button" className="ar-btn" title={labels.exportExcelTitle} disabled={!hasDoc || state.busy} onClick={() => run(() => controller.downloadExcel())}>
                {labels.exportExcel}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="ar-viewer-body">
        <div ref={scrollRef} className="ar-viewer-scroll" tabIndex={0} onKeyDown={onKeyDown} aria-busy={state.busy}>
          {state.error ? (
            <div className="ar-status ar-status-error" role="alert">
              <strong>{labels.reportError}</strong>
              {'\n'}
              {state.error.message}
            </div>
          ) : doc ? (
            <ReportPage document={doc} pageIndex={state.pageIndex} zoom={state.zoom} />
          ) : (
            <div className="ar-status">{labels.noReport}</div>
          )}
        </div>
        {issuesOpen && doc && <IssuesPanel issues={doc.issues} labels={labels} />}
      </div>
    </div>
  );
}
