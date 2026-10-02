import { defineComponent, h, ref, type PropType } from 'vue';
import {
  componentPreview,
  designScale,
  RESIZE_HANDLES,
  rectFromPoints,
  snapToGrid,
  type DesignSection,
  type Rect,
  type ReportComponent,
  type ResizeHandle,
} from '@ariana-report/core';
import { DND_TYPE, readPayload, useDesignerContext } from './context';

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Tracks a pointer drag on the window until release. */
function trackPointer(
  start: PointerEvent,
  onMove: (dx: number, dy: number, e: PointerEvent) => void,
  onEnd: (e: PointerEvent, moved: boolean) => void,
): void {
  const x0 = start.clientX;
  const y0 = start.clientY;
  let moved = false;
  const view = (start.target as Element).ownerDocument.defaultView ?? window;
  const move = (e: PointerEvent) => {
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    moved = true;
    onMove(dx, dy, e);
  };
  const up = (e: PointerEvent) => {
    view.removeEventListener('pointermove', move);
    view.removeEventListener('pointerup', up);
    view.removeEventListener('pointercancel', up);
    onEnd(e, moved);
  };
  view.addEventListener('pointermove', move);
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
}

function bandAtPoint(doc: Document, x: number, y: number): HTMLElement | null {
  const el = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(x, y) : null;
  return (el?.closest('[data-band-id]') as HTMLElement | null) ?? null;
}

const ComponentView = defineComponent({
  name: 'ArComponentView',
  props: {
    component: { type: Object as PropType<ReportComponent>, required: true },
    bandId: { type: String, required: true },
    scale: { type: Number, required: true },
  },
  setup(props) {
    const { controller, state, zoom } = useDesignerContext();

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const c = props.component;
      const selected = state.value.selection.componentIds.includes(c.id);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        controller.select([c.id], 'toggle');
        return;
      }
      if (!selected) controller.select([c.id]);
      const ids = controller.getState().selection.componentIds;
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const s = props.scale;
      const grab = { x: (e.clientX - box.left) / s, y: (e.clientY - box.top) / s };
      controller.beginInteraction('Move');
      trackPointer(
        e,
        (dx, dy, ev) => controller.moveComponents(ids, dx / s, dy / s, !ev.altKey),
        (ev, moved) => {
          if (!moved) return controller.endInteraction();
          const target = bandAtPoint((e.target as Element).ownerDocument, ev.clientX, ev.clientY);
          const targetId = target?.dataset.bandId;
          if (target && targetId && targetId !== props.bandId && ids.length === 1) {
            controller.cancelInteraction();
            const r = target.getBoundingClientRect();
            controller.moveComponentToBand(c.id, targetId, (ev.clientX - r.left) / s - grab.x, (ev.clientY - r.top) / s - grab.y);
          } else {
            controller.endInteraction();
          }
        },
      );
    };

    const onHandleDown = (handle: ResizeHandle) => (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      controller.beginInteraction('Resize');
      trackPointer(
        e,
        (dx, dy) => controller.resizeComponent(props.component.id, handle, dx / props.scale, dy / props.scale),
        () => controller.endInteraction(),
      );
    };

    return () => {
      const c = props.component;
      const preview = componentPreview(c, state.value.template, zoom.value);
      const sel = state.value.selection.componentIds;
      const selected = sel.includes(c.id);
      const handles: readonly ResizeHandle[] =
        c.type === 'line' ? (c.orientation === 'horizontal' ? ['w', 'e'] : ['n', 's']) : RESIZE_HANDLES;
      const label = c.name ?? (c.type === 'text' ? c.text : c.type);
      return h(
        'div',
        {
          class: ['ar-component', `ar-component-${c.type}`, preview.error && 'ar-component-invalid'],
          style: preview.style,
          'data-component-id': c.id,
          role: 'option',
          'aria-selected': String(selected),
          'aria-label': `${c.type}: ${label}`,
          title: preview.error ?? undefined,
          onPointerdown: onPointerDown,
        },
        [
          c.type === 'text' ? h('span', { class: 'ar-component-text' }, preview.label) : null,
          c.type === 'image' ? h('span', { class: 'ar-hint' }, preview.label) : null,
          ...(selected && sel.length === 1
            ? handles.map((hd) => h('span', { key: hd, class: `ar-handle ar-handle-${hd}`, 'data-handle': hd, onPointerdown: onHandleDown(hd) }))
            : []),
        ],
      );
    };
  },
});

const BandView = defineComponent({
  name: 'ArBandView',
  props: {
    section: { type: Object as PropType<DesignSection>, required: true },
    width: { type: Number, required: true },
  },
  setup(props) {
    const { controller, state, labels, zoom } = useDesignerContext();
    const el = ref<HTMLDivElement>();
    const marquee = ref<Rect | null>(null);
    const dropping = ref(false);
    const scale = () => designScale(state.value.template.unit, zoom.value);
    const toBand = (x: number, y: number) => {
      const r = el.value!.getBoundingClientRect();
      return { x: (x - r.left) / scale(), y: (y - r.top) / scale() };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const id = props.section.band.id;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!additive) controller.selectBand(id);
      const start = toBand(e.clientX, e.clientY);
      trackPointer(
        e,
        (_dx, _dy, ev) => {
          const p = toBand(ev.clientX, ev.clientY);
          marquee.value = rectFromPoints(start.x, start.y, p.x, p.y);
        },
        (ev, moved) => {
          marquee.value = null;
          if (!moved) return;
          const p = toBand(ev.clientX, ev.clientY);
          controller.selectInRect(id, rectFromPoints(start.x, start.y, p.x, p.y), additive);
        },
      );
    };

    const onResizeDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const band = props.section.band;
      const h0 = band.height;
      controller.beginInteraction('Resize band');
      trackPointer(
        e,
        (_dx, dy) => controller.resizeBand(band.id, h0 + dy / scale()),
        () => controller.endInteraction(),
      );
    };

    const onDrop = (e: DragEvent) => {
      dropping.value = false;
      const payload = readPayload(e.dataTransfer);
      if (!payload) return;
      e.preventDefault();
      const { settings } = state.value;
      const p = toBand(e.clientX, e.clientY);
      const grid = settings.snapToGrid ? settings.grid : 0;
      const at = { x: Math.max(0, snapToGrid(p.x, grid)), y: Math.max(0, snapToGrid(p.y, grid)) };
      const id = props.section.band.id;
      if (payload.kind === 'component') controller.addComponent(id, payload.type, at);
      else controller.insertField(id, payload.path, at, payload.root);
    };

    return () => {
      const { section, width } = props;
      const band = section.band;
      const s = scale();
      const { settings, selection, guides: allGuides } = state.value;
      const selected = selection.bandId === band.id && selection.componentIds.length === 0;
      const gridPx = settings.grid * s;
      const guides = allGuides?.bandId === band.id ? allGuides.guides : [];
      const m = marquee.value;
      return h('section', { 'aria-label': section.label }, [
        h(
          'div',
          {
            class: 'ar-section-caption',
            'aria-selected': String(selected),
            style: { paddingLeft: `${6 + section.depth * 12}px` },
            onClick: () => controller.selectBand(band.id),
          },
          [
            h('span', section.label),
            h('span', { class: 'ar-spacer' }),
            section.role !== 'detail'
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'ar-btn',
                    'aria-label': `${labels.value.removeBand}: ${section.label}`,
                    title: labels.value.removeBand,
                    onClick: (e: MouseEvent) => {
                      e.stopPropagation();
                      controller.removeBand(band.id);
                    },
                  },
                  '×',
                )
              : null,
          ],
        ),
        h(
          'div',
          {
            ref: el,
            class: ['ar-band', settings.showGrid && 'ar-band-grid', dropping.value && 'ar-band-drop'],
            'data-band-id': band.id,
            role: 'listbox',
            'aria-multiselectable': 'true',
            'aria-label': section.label,
            style: {
              width: `${width}px`,
              height: `${Math.max(band.height * s, 4)}px`,
              backgroundSize: settings.showGrid && gridPx >= 4 ? `${gridPx}px ${gridPx}px` : undefined,
            },
            onPointerdown: onPointerDown,
            onDragover: (e: DragEvent) => {
              if (Array.from(e.dataTransfer?.types ?? []).some((t) => t === DND_TYPE || t === 'text/plain')) {
                e.preventDefault();
                dropping.value = true;
              }
            },
            onDragleave: () => (dropping.value = false),
            onDrop,
          },
          [
            ...band.components.map((c) => h(ComponentView, { key: c.id, component: c, bandId: band.id, scale: s })),
            ...guides.map((g, i) =>
              h('div', {
                key: `g${i}`,
                class: 'ar-guide',
                style:
                  g.orientation === 'vertical'
                    ? { left: `${g.position * s}px`, top: 0, bottom: 0, width: '1px' }
                    : { top: `${g.position * s}px`, left: 0, right: 0, height: '1px' },
              }),
            ),
            m ? h('div', { class: 'ar-marquee', style: { left: `${m.x * s}px`, top: `${m.y * s}px`, width: `${m.width * s}px`, height: `${m.height * s}px` } }) : null,
            h('div', { class: 'ar-band-resize', 'data-band-resize': band.id, 'aria-hidden': 'true', onPointerdown: onResizeDown }),
          ],
        ),
      ]);
    };
  },
});

/** The design canvas: all bands of the template stacked with captions. */
export const DesignSurface = defineComponent({
  name: 'ArDesignSurface',
  setup() {
    const { controller, state, zoom } = useDesignerContext();
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (controller.handleKey(e)) e.preventDefault();
    };
    return () => {
      void state.value;
      const width = controller.bodyWidth() * designScale(state.value.template.unit, zoom.value);
      return h('div', { class: 'ar-surface-scroll', tabindex: 0, 'aria-label': 'Design surface', onKeydown: onKeyDown }, [
        h(
          'div',
          { class: 'ar-surface', style: { width: `${width}px` } },
          controller.sections().map((s) => h(BandView, { key: s.band.id, section: s, width })),
        ),
      ]);
    };
  },
});
