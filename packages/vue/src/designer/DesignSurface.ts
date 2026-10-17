import { defineComponent, h, ref, type PropType } from 'vue';
import {
  bandColorVars,
  componentPreview,
  designScale,
  DROP_TARGET_CLASS,
  marqueeTargets,
  RESIZE_HANDLES,
  rectFromPoints,
  snapshotBands,
  snapToGrid,
  type DesignSection,
  type Rect,
  type ReportComponent,
  type ResizeHandle,
} from '@ariana-reports/core';
import { DND_TYPE, readPayload, useDesignerContext } from './context';
import { icon } from '../Icon';

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

const ComponentView = defineComponent({
  name: 'ArComponentView',
  props: {
    component: { type: Object as PropType<ReportComponent>, required: true },
    bandId: { type: String, required: true },
    scale: { type: Number, required: true },
  },
  setup(props) {
    const { controller, state, zoom, openTextEditor } = useDesignerContext();

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
      const s = props.scale;
      const bandId = props.bandId;
      // Band positions at drag start: dragging over another band moves the selection into it.
      const el = e.currentTarget as HTMLElement;
      const bandAt = snapshotBands(el.closest('.ar-surface') ?? el.ownerDocument);
      const source = bandAt ? (el.closest('[data-band-id]') as HTMLElement | null)?.getBoundingClientRect() : undefined;
      let highlighted: HTMLElement | null = null;
      const highlight = (target: HTMLElement | null) => {
        if (target === highlighted) return;
        highlighted?.classList.remove(DROP_TARGET_CLASS);
        target?.classList.add(DROP_TARGET_CLASS);
        highlighted = target;
      };
      controller.beginInteraction('Move');
      trackPointer(
        e,
        (dx, dy, ev) => {
          const hit = bandAt?.(ev.clientY);
          if (!hit || !source || hit.bandId === bandId) {
            highlight(null);
            controller.moveComponentsToBand(ids, bandId, dx / s, dy / s, !ev.altKey);
            return;
          }
          highlight(hit.element);
          controller.moveComponentsToBand(ids, hit.bandId, (dx + source.left - hit.left) / s, (dy + source.top - hit.top) / s, !ev.altKey);
        },
        () => {
          highlight(null);
          controller.endInteraction();
        },
      );
    };

    const onHandleDown = (handle: ResizeHandle) => (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      // Every selected component resizes by the same amount, e.g. to change the height of a whole row.
      const ids = controller.getState().selection.componentIds;
      controller.beginInteraction('Resize');
      trackPointer(
        e,
        (dx, dy) => controller.resizeComponents(ids.length ? ids : [props.component.id], handle, dx / props.scale, dy / props.scale),
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
          onDblclick: c.type === 'text' ? () => openTextEditor(c.id) : undefined,
        },
        [
          c.type === 'text'
            ? h('span', { class: 'ar-component-body', dir: preview.dir }, preview.runs ? preview.runs.map((r, i) => h('span', { key: i, style: r.style }, r.text)) : preview.label)
            : null,
          c.type === 'image' ? h('span', { class: 'ar-hint ar-component-label' }, preview.label) : null,
          ...(selected
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

    const onDragOver = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).some((t) => t === DND_TYPE || t === 'text/plain')) {
        e.preventDefault();
        dropping.value = true;
      }
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
      return h('section', { 'aria-label': section.label, 'data-section-band': band.id, class: 'ar-section-band', style: bandColorVars(band.designColor) }, [
        h(
          'div',
          {
            class: 'ar-section-caption',
            'aria-selected': String(selected),
            style: { paddingLeft: `${8 + section.depth * 12}px` },
            onClick: () => controller.selectBand(band.id),
          },
          [
            h('span', { dir: 'auto' }, section.label),
            h('span', { class: 'ar-spacer' }),
            section.role !== 'detail'
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'ar-btn ar-btn-icon',
                    'aria-label': `${labels.value.removeBand}: ${section.label}`,
                    title: labels.value.removeBand,
                    onClick: (e: MouseEvent) => {
                      e.stopPropagation();
                      controller.removeBand(band.id);
                    },
                  },
                  [icon('close')],
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
            onDragover: onDragOver,
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
        // Empty strip below the band: start a rubber-band selection here when components cover the whole band.
        h('div', {
          class: 'ar-band-gap',
          'data-band-gap': band.id,
          'aria-hidden': 'true',
          style: { width: `${width}px` },
          onPointerdown: onPointerDown,
          onDragover: onDragOver,
          onDragleave: () => (dropping.value = false),
          onDrop,
        }),
      ]);
    };
  },
});

/** The design canvas: all bands of the template stacked with captions. */
export const DesignSurface = defineComponent({
  name: 'ArDesignSurface',
  setup() {
    const { controller, state, zoom, labels } = useDesignerContext();
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (controller.handleKey(e)) e.preventDefault();
    };
    const surfaceEl = ref<HTMLDivElement>();
    const scrollEl = ref<HTMLDivElement>();
    const marquee = ref<{ left: number; top: number; width: number; height: number } | null>(null);
    // Rubber-band selection started outside the bands: in the page margins or around the page.
    const onPointerDown = (e: PointerEvent) => {
      const surface = surfaceEl.value;
      if (e.button !== 0 || !surface || (e.target !== surface && e.target !== scrollEl.value)) return;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const scale = designScale(state.value.template.unit, zoom.value);
      const start = { x: e.clientX, y: e.clientY };
      const box = (ev: PointerEvent) => ({
        left: Math.min(start.x, ev.clientX),
        top: Math.min(start.y, ev.clientY),
        right: Math.max(start.x, ev.clientX),
        bottom: Math.max(start.y, ev.clientY),
      });
      trackPointer(
        e,
        (_dx, _dy, ev) => {
          const b = box(ev);
          const s = surface.getBoundingClientRect();
          marquee.value = { left: b.left - s.left, top: b.top - s.top, width: b.right - b.left, height: b.bottom - b.top };
        },
        (ev, moved) => {
          marquee.value = null;
          if (!moved) {
            if (!additive) controller.clearSelection();
            return;
          }
          controller.selectInBands(marqueeTargets(surface, box(ev), scale), additive);
        },
      );
    };
    return () => {
      const { template, settings } = state.value;
      const scale = designScale(template.unit, zoom.value);
      const width = controller.bodyWidth() * scale;
      // With margins shown the surface is the whole page and the bands sit inside the margins.
      const m = template.page.margins;
      const pad = settings.showMargins ? { top: m.top * scale, right: m.right * scale, bottom: m.bottom * scale, left: m.left * scale } : null;
      const px = (v: number) => `${v}px`;
      const mq = marquee.value;
      return h('div', { ref: scrollEl, class: 'ar-surface-scroll', tabindex: 0, 'aria-label': labels.value.designSurface, onKeydown: onKeyDown, onPointerdown: onPointerDown }, [
        h(
          'div',
          {
            ref: surfaceEl,
            class: 'ar-surface',
            style: pad
              ? { width: px(width + pad.left + pad.right), paddingTop: px(pad.top), paddingRight: px(pad.right), paddingBottom: px(pad.bottom), paddingLeft: px(pad.left) }
              : { width: px(width) },
          },
          [
            pad ? h('div', { class: 'ar-margin-guide', 'aria-hidden': 'true', style: { top: px(pad.top), right: px(pad.right), bottom: px(pad.bottom), left: px(pad.left) } }) : null,
            ...controller.sections(labels.value).map((s) => h(BandView, { key: s.band.id, section: s, width })),
            mq ? h('div', { class: 'ar-marquee', style: { left: px(mq.left), top: px(mq.top), width: px(mq.width), height: px(mq.height) } }) : null,
          ],
        ),
      ]);
    };
  },
});
