import { computed, defineComponent, h, markRaw, onMounted, provide, ref, watch, type PropType } from 'vue';
import {
  createTemplate,
  DesignerController,
  downloadBytes,
  injectStyles,
  fontFamilies,
  resolveUiLocale,
  safeFileName,
  themeVars,
  type ArianaTheme,
  type IconName,
  type TextAlign,
  type VerticalAlign,
  type DesignerSettings,
  type ExcelExportOptions,
  type Labels,
  type PdfExportOptions,
  type ReportTemplate,
  type TextMeasurer,
  type UiLocale,
} from '@ariana-reports/core';
import { useStore } from '../composables';
import { ReportViewer } from '../ReportViewer';
import { DESIGNER_KEY } from './context';
import { DataPanel, ParametersPanel, Toolbox } from './DataPanel';
import { DesignSurface } from './DesignSurface';
import { PropertiesPanel } from './PropertiesPanel';
import { TextEditor } from './TextEditor';
import { icon } from '../Icon';

/**
 * Report designer: banded design surface with drag and drop, properties,
 * data binding, expression checking, undo/redo, JSON open/save and preview.
 *
 * Events: `change(template)` after every edit, `save(template, json)` when
 * Save is clicked (when no `onSave` prop is given, Save downloads JSON).
 */
export const ReportDesigner = defineComponent({
  name: 'ArReportDesigner',
  props: {
    /** Initial template; later changes are ignored. Use the exposed controller to replace it. */
    template: { type: [Object, String] as PropType<ReportTemplate | string> },
    sampleData: { type: null as unknown as PropType<unknown> },
    settings: { type: Object as PropType<Partial<DesignerSettings>> },
    labels: { type: Object as PropType<Partial<Labels>> },
    /**
     * UI language: a registered locale code such as "fa", or a `UiLocale`
     * object. Sets the labels and writing direction of the toolbar and panels;
     * the design surface itself stays left to right.
     */
    uiLocale: { type: [String, Object] as PropType<string | UiLocale> },
    /** UI colors, radius and font; e.g. `themeFromMui(theme)`. See `ArianaTheme`. */
    theme: { type: Object as PropType<ArianaTheme> },
    /**
     * Extra font families for the font lists, e.g. ["Vazirmatn"]. Families of
     * `preview.pdf.fonts` are added automatically. The browser needs the font
     * (via @font-face) to show it; register it in `pdf.fonts` for PDF export.
     */
    fonts: { type: Array as PropType<string[]> },
    preview: {
      type: Object as PropType<{
        params?: Record<string, unknown>;
        measurer?: TextMeasurer;
        pdf?: PdfExportOptions;
        excel?: ExcelExportOptions;
        /** Decides which image sources the preview may load (default: http(s), blob, raster data URIs, relative URLs). */
        allowImageSrc?: (src: string) => boolean;
      }>,
    },
    controller: { type: Object as PropType<DesignerController> },
    injectStyles: { type: Boolean, default: true },
    /** Save handler; may return a promise. When omitted, Save downloads the template JSON. */
    onSave: { type: Function as PropType<(template: ReportTemplate, json: string) => void | Promise<void>> },
  },
  emits: {
    change: (_t: ReportTemplate) => true,
  },
  setup(props, { emit, expose }) {
    const controller = markRaw(props.controller ?? new DesignerController({ template: props.template, sampleData: props.sampleData, settings: props.settings }));
    const state = useStore(controller);
    const ui = computed(() => resolveUiLocale(props.uiLocale, props.labels));
    const labels = computed(() => ui.value.labels);
    const values = computed(() => ui.value.values);
    const dir = computed(() => ui.value.dir);
    const zoom = ref(1);
    const mode = ref<'design' | 'preview'>('design');
    const message = ref<string | null>(null);
    const editing = ref<string | null>(null);
    const fileInput = ref<HTMLInputElement>();
    const root = ref<HTMLDivElement>();
    const fonts = computed(() =>
      fontFamilies(state.value.template, [...(props.fonts ?? []), ...(props.preview?.pdf?.fonts ?? []).map((f) => f.family)]),
    );
    provide(DESIGNER_KEY, { controller, state, labels, values, dir, zoom, fonts, openTextEditor: (id: string) => (editing.value = id) });
    expose({ controller });

    onMounted(() => {
      if (props.injectStyles) injectStyles(root.value?.ownerDocument);
    });
    watch(
      () => props.sampleData,
      (d) => d !== undefined && controller.setSampleData(d),
      { immediate: true },
    );
    watch(
      () => state.value.template,
      (t) => emit('change', t),
    );

    const confirmDiscard = () => !state.value.dirty || typeof window === 'undefined' || window.confirm(labels.value.unsavedChanges);

    const save = async () => {
      const json = controller.toJSON();
      try {
        if (props.onSave) await props.onSave(state.value.template, json);
        else downloadBytes(new TextEncoder().encode(json), safeFileName(state.value.template.name, 'json'), 'application/json');
        controller.markSaved();
        message.value = null;
      } catch (err) {
        message.value = (err as Error).message;
      }
    };

    const open = async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        controller.load(await file.text());
        message.value = null;
      } catch (err) {
        message.value = `${labels.value.invalidFile}: ${(err as Error).message}`;
      }
    };

    const btn = (label: string, name: IconName, disabled: boolean, onClick: () => void, extraClass = '') =>
      h('button', { type: 'button', class: ['ar-btn ar-btn-icon', extraClass], 'aria-label': label, title: label, disabled, onClick }, [icon(name)]);
    const toggle = (label: string, name: IconName, pressed: boolean, onClick: () => void) =>
      h('button', { type: 'button', class: 'ar-btn ar-btn-icon', 'aria-label': label, title: label, 'aria-pressed': String(pressed), onClick }, [icon(name)]);

    return () => {
      const s = state.value;
      const l = labels.value;
      const sel = s.selection.componentIds.length;
      const alignment = controller.textAlignment();
      const hasText = mode.value === 'design' && controller.selectedComponents().some((c) => c.type === 'text');
      const textAligns: [TextAlign, string, IconName][] = [
        ['left', l.alignLeft, 'textLeft'],
        ['center', l.alignCenter, 'textCenter'],
        ['right', l.alignRight, 'textRight'],
        ['justify', l.alignJustify, 'textJustify'],
      ];
      const verticalAligns: [VerticalAlign, string, IconName][] = [
        ['top', l.alignTop, 'valignTop'],
        ['middle', l.alignMiddle, 'valignMiddle'],
        ['bottom', l.alignBottom, 'valignBottom'],
      ];
      const alignButton = (label: string, name: IconName, pressed: boolean, onClick: () => void) =>
        h('button', { type: 'button', class: 'ar-btn ar-btn-icon', 'aria-label': label, title: label, 'aria-pressed': String(pressed), disabled: !hasText, onClick }, [icon(name)]);
      const toolbar = h('div', { class: 'ar-toolbar', role: 'toolbar', 'aria-label': l.designerToolbar }, [
        h('div', { class: 'ar-toolbar-group' }, [
          h('button', { type: 'button', class: 'ar-btn', onClick: () => confirmDiscard() && controller.load(createTemplate()) }, [icon('newFile'), l.newReport]),
          h('button', { type: 'button', class: 'ar-btn', onClick: () => confirmDiscard() && fileInput.value?.click() }, [icon('open'), l.openReport]),
          h('input', { ref: fileInput, type: 'file', accept: '.json,application/json', hidden: true, 'aria-hidden': 'true', 'data-testid': 'ar-open-file', onChange: open }),
          h('button', { type: 'button', class: 'ar-btn', onClick: () => void save() }, [icon('save'), `${l.saveReport}${s.dirty ? ' •' : ''}`]),
        ]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group' }, [btn(l.undo, 'undo', !s.canUndo, () => controller.undo()), btn(l.redo, 'redo', !s.canRedo, () => controller.redo())]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group', role: 'group', 'aria-label': l.textAlignment }, [
          ...textAligns.map(([a, label, name]) => alignButton(label, name, alignment.textAlign === a, () => controller.setTextAlign(a))),
          ...verticalAligns.map(([a, label, name]) => alignButton(label, name, alignment.verticalAlign === a, () => controller.setVerticalAlign(a))),
        ]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group' }, [
          btn(l.distributeHorizontal, 'distributeHorizontal', sel < 3, () => controller.distribute('horizontal')),
          btn(l.distributeVertical, 'distributeVertical', sel < 3, () => controller.distribute('vertical')),
          btn(l.bringToFront, 'bringToFront', sel === 0, () => controller.reorder('front')),
          btn(l.sendToBack, 'sendToBack', sel === 0, () => controller.reorder('back')),
          btn(l.delete, 'delete', sel === 0, () => controller.removeComponents(), 'ar-btn-danger'),
        ]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group' }, [
          toggle(l.showGrid, 'grid', s.settings.showGrid, () => controller.updateSettings({ showGrid: !s.settings.showGrid })),
          toggle(l.snap, 'snap', s.settings.snapToGrid, () => controller.updateSettings({ snapToGrid: !s.settings.snapToGrid, snapToObjects: !s.settings.snapToGrid })),
          toggle(l.showMargins, 'margins', s.settings.showMargins, () => controller.updateSettings({ showMargins: !s.settings.showMargins })),
          h(
            'select',
            { class: 'ar-select', 'aria-label': l.zoom, value: String(zoom.value), onChange: (e: Event) => (zoom.value = Number((e.target as HTMLSelectElement).value)) },
            [0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => h('option', { key: z, value: String(z), selected: zoom.value === z }, `${z * 100}%`)),
          ),
        ]),
        h('span', { class: 'ar-spacer' }),
        h('div', { class: 'ar-tabs', role: 'tablist' }, [
          h('button', { type: 'button', role: 'tab', class: 'ar-btn', 'aria-selected': String(mode.value === 'design'), onClick: () => (mode.value = 'design') }, [icon('design'), l.design]),
          h('button', { type: 'button', role: 'tab', class: 'ar-btn', 'aria-selected': String(mode.value === 'preview'), onClick: () => (mode.value = 'preview') }, [icon('preview'), l.preview]),
        ]),
      ]);

      const body =
        mode.value === 'design'
          ? h('div', { class: 'ar-designer-body' }, [
              h('aside', { class: 'ar-panel', 'aria-label': `${l.components} / ${l.data}` }, [
                h('div', { class: 'ar-panel-header', title: s.template.name }, s.template.name),
                h(Toolbox),
                h(DataPanel),
                h(ParametersPanel),
              ]),
              h(DesignSurface),
              h(PropertiesPanel),
            ])
          : h(ReportViewer, {
              template: s.template,
              data: controller.getSampleData() ?? {},
              params: props.preview?.params,
              measurer: props.preview?.measurer,
              pdf: props.preview?.pdf,
              excel: props.preview?.excel,
              allowImageSrc: props.preview?.allowImageSrc,
              labels: props.labels,
              uiLocale: props.uiLocale,
              showIssues: true,
              injectStyles: false,
            });

      return h('div', { ref: root, class: 'ar-root ar-designer', style: themeVars(props.theme), dir: ui.value.dir, lang: ui.value.code }, [
        toolbar,
        message.value ? h('div', { class: 'ar-status ar-status-error', role: 'alert', style: { padding: '6px 8px' } }, message.value) : null,
        body,
        editing.value && mode.value === 'design' ? h(TextEditor, { key: editing.value, componentId: editing.value, onClose: () => (editing.value = null) }) : null,
      ]);
    };
  },
});
