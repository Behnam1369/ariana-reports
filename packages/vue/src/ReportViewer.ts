import {
  computed,
  defineComponent,
  h,
  markRaw,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
  type PropType,
  type VNode,
} from 'vue';
import {
  injectStyles,
  mergeLabels,
  renderPage,
  ViewerController,
  ZOOM_LEVELS,
  type EvaluateOptions,
  type ExcelExportOptions,
  type Labels,
  type LayoutDocument,
  type LayoutIssue,
  type PdfExportOptions,
  type ReportTemplate,
  type TextMeasurer,
  type ZoomMode,
} from '@ariana-report/core';
import { useStore } from './composables';

/** Renders one page of a layout document with the shared DOM renderer. */
export const ReportPage = defineComponent({
  name: 'ArReportPage',
  props: {
    document: { type: Object as PropType<LayoutDocument>, required: true },
    pageIndex: { type: Number, required: true },
    zoom: { type: Number, default: 1 },
  },
  setup(props) {
    const host = ref<HTMLDivElement>();
    onMounted(() => {
      watchEffect(() => {
        const el = host.value;
        if (!el || !props.document.pages[props.pageIndex]) return;
        el.replaceChildren(renderPage(props.document, props.pageIndex, { scale: props.zoom, ownerDocument: el.ownerDocument }));
      });
    });
    return () => h('div', { ref: host, class: 'ar-page-host' });
  },
});

function issuesPanel(issues: LayoutIssue[], labels: Labels): VNode {
  return h('aside', { class: 'ar-issues', 'aria-label': labels.issues }, [
    h('h2', { class: 'ar-panel-title' }, labels.issues),
    issues.length === 0
      ? h('p', { class: 'ar-hint' }, labels.noIssues)
      : h(
          'ul',
          { style: { listStyle: 'none', margin: 0, padding: 0 } },
          issues.map((issue, i) =>
            h('li', { key: i, class: `ar-issue ar-issue-${issue.severity}` }, [
              h('div', issue.message),
              issue.expression ? h('code', issue.expression) : null,
              issue.componentId || issue.bandId ? h('span', { class: 'ar-hint' }, issue.componentId ?? issue.bandId) : null,
            ]),
          ),
        ),
  ]);
}

/**
 * Report viewer: generates a report from a template and JSON data and shows
 * it with page navigation, zoom, print and PDF/Excel export.
 *
 * Events: `generated(document)`, `error(error)`.
 */
export const ReportViewer = defineComponent({
  name: 'ArReportViewer',
  props: {
    template: { type: [Object, String] as PropType<ReportTemplate | string> },
    data: { type: null as unknown as PropType<unknown> },
    document: { type: Object as PropType<LayoutDocument> },
    params: { type: Object as PropType<Record<string, unknown>> },
    locale: { type: String },
    functions: { type: Object as PropType<EvaluateOptions['functions']> },
    measurer: { type: Object as PropType<TextMeasurer> },
    maxPages: { type: Number },
    maxSteps: { type: Number },
    pdf: { type: Object as PropType<PdfExportOptions> },
    excel: { type: Object as PropType<ExcelExportOptions> },
    toolbar: { type: Boolean, default: true },
    exports: { type: Object as PropType<{ pdf?: boolean; excel?: boolean; print?: boolean }>, default: () => ({}) },
    showIssues: { type: Boolean, default: false },
    zoom: { type: Number },
    zoomMode: { type: String as PropType<ZoomMode> },
    labels: { type: Object as PropType<Partial<Labels>> },
    controller: { type: Object as PropType<ViewerController> },
    injectStyles: { type: Boolean, default: true },
    save: { type: Function as PropType<(bytes: Uint8Array, fileName: string, mimeType: string) => void> },
  },
  emits: {
    generated: (_doc: LayoutDocument) => true,
    error: (_err: Error) => true,
  },
  setup(props, { emit, expose }) {
    const controller = markRaw(props.controller ?? new ViewerController({ zoom: props.zoom, zoomMode: props.zoomMode }));
    const state = useStore(controller);
    const labels = computed(() => mergeLabels(props.labels));
    const scroller = ref<HTMLDivElement>();
    const issuesOpen = ref(props.showIssues);
    const pageInput = ref('1');
    expose({ controller });

    const syncOptions = () =>
      controller.setOptions({
        pdf: props.pdf,
        excel: props.excel,
        save: props.save,
        params: props.params,
        locale: props.locale,
        functions: props.functions,
        measurer: props.measurer,
        maxPages: props.maxPages,
        maxSteps: props.maxSteps,
      });

    watch(
      () => [props.document, props.template, props.data, props.params, props.locale, props.functions, props.measurer, props.maxPages, props.maxSteps] as const,
      () => {
        syncOptions();
        if (props.document) controller.show(props.document);
        else if (props.template !== undefined) controller.load(props.template, props.data ?? {});
        const s = controller.getState();
        if (s.error) emit('error', s.error);
        else if (s.document) emit('generated', s.document);
      },
      { immediate: true },
    );
    watch(() => [props.pdf, props.excel, props.save], syncOptions);
    watch(
      () => props.zoom,
      (z) => z !== undefined && controller.setZoom(z),
    );
    watch(
      () => props.zoomMode,
      (m) => m !== undefined && controller.setZoomMode(m),
    );
    watch(
      () => [state.value.pageIndex, state.value.pageCount],
      () => {
        pageInput.value = String(state.value.pageIndex + 1);
      },
      { immediate: true },
    );

    let ro: ResizeObserver | undefined;
    onMounted(() => {
      if (props.injectStyles) injectStyles(scroller.value?.ownerDocument);
      const el = scroller.value;
      if (!el) return;
      const measure = () => controller.setContainerSize(el.clientWidth, el.clientHeight);
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      }
    });
    onBeforeUnmount(() => ro?.disconnect());

    const run = (task: () => Promise<void>) => {
      task().catch((err: unknown) => emit('error', err instanceof Error ? err : new Error(String(err))));
    };
    const commitPage = () => {
      const n = Number.parseInt(pageInput.value, 10);
      if (Number.isFinite(n)) controller.goToPage(n - 1);
      pageInput.value = String(controller.getState().pageIndex + 1);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const keys: Record<string, () => void> = {
        PageDown: () => controller.nextPage(),
        PageUp: () => controller.previousPage(),
        Home: () => controller.firstPage(),
        End: () => controller.lastPage(),
      };
      const action = keys[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };

    const button = (label: string, text: string, disabled: boolean, onClick: () => void, title = label) =>
      h('button', { type: 'button', class: 'ar-btn', 'aria-label': label, title, disabled, onClick }, text);

    return () => {
      const s = state.value;
      const l = labels.value;
      const doc = s.document;
      const hasDoc = !!doc;
      const atStart = s.pageIndex <= 0;
      const atEnd = s.pageIndex >= s.pageCount - 1;
      const issueCount = doc?.issues.length ?? 0;
      const zoomValue = s.zoomMode === 'custom' ? String(s.zoom) : s.zoomMode;
      const exp = props.exports;

      const toolbar = props.toolbar
        ? h('div', { class: 'ar-toolbar', role: 'toolbar', 'aria-label': 'Report viewer' }, [
            h('div', { class: 'ar-toolbar-group' }, [
              button(l.firstPage, '«', !hasDoc || atStart, () => controller.firstPage()),
              button(l.previousPage, '‹', !hasDoc || atStart, () => controller.previousPage()),
              h('input', {
                class: 'ar-input ar-input-page',
                'aria-label': l.pageNumber,
                inputmode: 'numeric',
                value: pageInput.value,
                disabled: !hasDoc,
                onInput: (e: Event) => (pageInput.value = (e.target as HTMLInputElement).value),
                onBlur: commitPage,
                onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && commitPage(),
              }),
              h('span', { class: 'ar-hint' }, `${l.pageOf} ${s.pageCount}`),
              button(l.nextPage, '›', !hasDoc || atEnd, () => controller.nextPage()),
              button(l.lastPage, '»', !hasDoc || atEnd, () => controller.lastPage()),
            ]),
            h('span', { class: 'ar-toolbar-sep' }),
            h('div', { class: 'ar-toolbar-group' }, [
              button(l.zoomOut, '−', false, () => controller.zoomOut()),
              h(
                'select',
                {
                  class: 'ar-select',
                  'aria-label': l.zoom,
                  value: zoomValue,
                  onChange: (e: Event) => {
                    const v = (e.target as HTMLSelectElement).value;
                    if (v === 'fitWidth' || v === 'fitPage') controller.setZoomMode(v);
                    else controller.setZoom(Number(v));
                  },
                },
                [
                  s.zoomMode === 'custom' && !ZOOM_LEVELS.includes(s.zoom as (typeof ZOOM_LEVELS)[number])
                    ? h('option', { value: String(s.zoom) }, `${Math.round(s.zoom * 100)}%`)
                    : null,
                  ...ZOOM_LEVELS.map((z) => h('option', { key: z, value: String(z), selected: zoomValue === String(z) }, `${Math.round(z * 100)}%`)),
                  h('option', { value: 'fitWidth', selected: zoomValue === 'fitWidth' }, l.fitWidth),
                  h('option', { value: 'fitPage', selected: zoomValue === 'fitPage' }, l.fitPage),
                ],
              ),
              button(l.zoomIn, '+', false, () => controller.zoomIn()),
            ]),
            h('span', { class: 'ar-spacer' }),
            h('div', { class: 'ar-toolbar-group' }, [
              h(
                'button',
                { type: 'button', class: 'ar-btn', 'aria-pressed': issuesOpen.value, disabled: !hasDoc, onClick: () => (issuesOpen.value = !issuesOpen.value) },
                `${l.issues}${issueCount > 0 ? ` (${issueCount})` : ''}`,
              ),
              exp.print !== false ? h('button', { type: 'button', class: 'ar-btn', disabled: !hasDoc || s.busy, onClick: () => run(() => controller.print()) }, l.print) : null,
              exp.pdf !== false
                ? h('button', { type: 'button', class: 'ar-btn', title: l.exportPdfTitle, disabled: !hasDoc || s.busy, onClick: () => run(() => controller.downloadPdf()) }, l.exportPdf)
                : null,
              exp.excel !== false
                ? h('button', { type: 'button', class: 'ar-btn', title: l.exportExcelTitle, disabled: !hasDoc || s.busy, onClick: () => run(() => controller.downloadExcel()) }, l.exportExcel)
                : null,
            ]),
          ])
        : null;

      const content = s.error
        ? h('div', { class: 'ar-status ar-status-error', role: 'alert' }, [h('strong', l.reportError), '\n', s.error.message])
        : doc
          ? h(ReportPage, { document: doc, pageIndex: s.pageIndex, zoom: s.zoom })
          : h('div', { class: 'ar-status' }, l.noReport);

      return h('div', { class: 'ar-root ar-viewer' }, [
        toolbar,
        h('div', { class: 'ar-viewer-body' }, [
          h('div', { ref: scroller, class: 'ar-viewer-scroll', tabindex: 0, 'aria-busy': s.busy, onKeydown: onKeyDown }, [content]),
          issuesOpen.value && doc ? issuesPanel(doc.issues, l) : null,
        ]),
      ]);
    };
  },
});
