import { computed, defineComponent, h, markRaw, onMounted, provide, ref, watch, type PropType } from 'vue';
import {
  createTemplate,
  DesignerController,
  downloadBytes,
  injectStyles,
  mergeLabels,
  safeFileName,
  type Alignment,
  type DesignerSettings,
  type ExcelExportOptions,
  type Labels,
  type PdfExportOptions,
  type ReportTemplate,
  type TextMeasurer,
} from '@ariana-report/core';
import { useStore } from '../composables';
import { ReportViewer } from '../ReportViewer';
import { DESIGNER_KEY } from './context';
import { DataPanel, ParametersPanel, Toolbox } from './DataPanel';
import { DesignSurface } from './DesignSurface';
import { PropertiesPanel } from './PropertiesPanel';

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
    preview: { type: Object as PropType<{ params?: Record<string, unknown>; measurer?: TextMeasurer; pdf?: PdfExportOptions; excel?: ExcelExportOptions }> },
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
    const labels = computed(() => mergeLabels(props.labels));
    const zoom = ref(1);
    const mode = ref<'design' | 'preview'>('design');
    const message = ref<string | null>(null);
    const fileInput = ref<HTMLInputElement>();
    const root = ref<HTMLDivElement>();
    provide(DESIGNER_KEY, { controller, state, labels, zoom });
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

    const btn = (label: string, text: string, disabled: boolean, onClick: () => void, extra: Record<string, unknown> = {}) =>
      h('button', { type: 'button', class: 'ar-btn', 'aria-label': label, title: label, disabled, onClick, ...extra }, text);

    return () => {
      const s = state.value;
      const l = labels.value;
      const sel = s.selection.componentIds.length;
      const aligns: [Alignment, string, string][] = [
        ['left', l.alignLeft, '⇤'],
        ['center', l.alignCenter, '↔'],
        ['right', l.alignRight, '⇥'],
        ['top', l.alignTop, '⤒'],
        ['middle', l.alignMiddle, '↕'],
        ['bottom', l.alignBottom, '⤓'],
      ];
      const toolbar = h('div', { class: 'ar-toolbar', role: 'toolbar', 'aria-label': 'Report designer' }, [
        h('div', { class: 'ar-toolbar-group' }, [
          h('button', { type: 'button', class: 'ar-btn', onClick: () => confirmDiscard() && controller.load(createTemplate()) }, l.newReport),
          h('button', { type: 'button', class: 'ar-btn', onClick: () => confirmDiscard() && fileInput.value?.click() }, l.openReport),
          h('input', { ref: fileInput, type: 'file', accept: '.json,application/json', hidden: true, 'aria-hidden': 'true', 'data-testid': 'ar-open-file', onChange: open }),
          h('button', { type: 'button', class: 'ar-btn', onClick: () => void save() }, `${l.saveReport}${s.dirty ? ' •' : ''}`),
        ]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group' }, [btn(l.undo, '↶', !s.canUndo, () => controller.undo()), btn(l.redo, '↷', !s.canRedo, () => controller.redo())]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group', role: 'group', 'aria-label': l.align }, [
          ...aligns.map(([a, label, icon]) => btn(label, icon, sel === 0 || mode.value !== 'design', () => controller.align(a))),
          btn(l.distributeHorizontal, '⋯', sel < 3, () => controller.distribute('horizontal')),
          btn(l.distributeVertical, '⋮', sel < 3, () => controller.distribute('vertical')),
          btn(l.bringToFront, '⬒', sel === 0, () => controller.reorder('front')),
          btn(l.sendToBack, '⬓', sel === 0, () => controller.reorder('back')),
          btn(l.delete, '🗑', sel === 0, () => controller.removeComponents(), { class: 'ar-btn ar-btn-danger' }),
        ]),
        h('span', { class: 'ar-toolbar-sep' }),
        h('div', { class: 'ar-toolbar-group' }, [
          h('button', { type: 'button', class: 'ar-btn', 'aria-pressed': String(s.settings.showGrid), onClick: () => controller.updateSettings({ showGrid: !s.settings.showGrid }) }, l.showGrid),
          h(
            'button',
            {
              type: 'button',
              class: 'ar-btn',
              'aria-pressed': String(s.settings.snapToGrid),
              onClick: () => controller.updateSettings({ snapToGrid: !s.settings.snapToGrid, snapToObjects: !s.settings.snapToGrid }),
            },
            l.snap,
          ),
          h(
            'select',
            { class: 'ar-select', 'aria-label': l.zoom, value: String(zoom.value), onChange: (e: Event) => (zoom.value = Number((e.target as HTMLSelectElement).value)) },
            [0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => h('option', { key: z, value: String(z), selected: zoom.value === z }, `${z * 100}%`)),
          ),
        ]),
        h('span', { class: 'ar-spacer' }),
        h('div', { class: 'ar-toolbar-group', role: 'tablist' }, [
          h('button', { type: 'button', role: 'tab', class: 'ar-btn', 'aria-selected': String(mode.value === 'design'), 'aria-pressed': String(mode.value === 'design'), onClick: () => (mode.value = 'design') }, l.design),
          h('button', { type: 'button', role: 'tab', class: 'ar-btn', 'aria-selected': String(mode.value === 'preview'), 'aria-pressed': String(mode.value === 'preview'), onClick: () => (mode.value = 'preview') }, l.preview),
        ]),
      ]);

      const body =
        mode.value === 'design'
          ? h('div', { class: 'ar-designer-body' }, [
              h('aside', { class: 'ar-panel', 'aria-label': `${l.components} / ${l.data}` }, [h(Toolbox), h(DataPanel), h(ParametersPanel)]),
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
              labels: props.labels,
              showIssues: true,
              injectStyles: false,
            });

      return h('div', { ref: root, class: 'ar-root ar-designer' }, [
        toolbar,
        message.value ? h('div', { class: 'ar-status ar-status-error', role: 'alert', style: { padding: '6px 8px' } }, message.value) : null,
        body,
      ]);
    };
  },
});
