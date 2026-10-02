import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  componentPreview,
  designScale,
  RESIZE_HANDLES,
  rectFromPoints,
  snapToGrid,
  type DesignSection,
  type ReportComponent,
  type ResizeHandle,
} from '@ariana-report/core';
import { readPayload, useDesignerContext } from './context';

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Tracks a pointer drag on the window until release. */
function trackPointer(
  start: ReactPointerEvent,
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

function ComponentView({ component, bandId, scale }: { component: ReportComponent; bandId: string; scale: number }) {
  const { controller, state, zoom } = useDesignerContext();
  const preview = componentPreview(component, state.template, zoom);
  const selected = state.selection.componentIds.includes(component.id);
  const single = selected && state.selection.componentIds.length === 1;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      controller.select([component.id], 'toggle');
      return;
    }
    if (!selected) controller.select([component.id]);
    const ids = controller.getState().selection.componentIds;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grab = { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    controller.beginInteraction('Move');
    trackPointer(
      e,
      (dx, dy, ev) => controller.moveComponents(ids, dx / scale, dy / scale, !ev.altKey),
      (ev, moved) => {
        if (!moved) return controller.endInteraction();
        const target = bandAtPoint((e.target as Element).ownerDocument, ev.clientX, ev.clientY);
        const targetId = target?.dataset.bandId;
        if (targetId && targetId !== bandId && ids.length === 1) {
          controller.cancelInteraction();
          const r = target.getBoundingClientRect();
          controller.moveComponentToBand(component.id, targetId, (ev.clientX - r.left) / scale - grab.x, (ev.clientY - r.top) / scale - grab.y);
        } else {
          controller.endInteraction();
        }
      },
    );
  };

  const onHandleDown = (handle: ResizeHandle) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    controller.beginInteraction('Resize');
    trackPointer(
      e,
      (dx, dy) => controller.resizeComponent(component.id, handle, dx / scale, dy / scale),
      () => controller.endInteraction(),
    );
  };

  const handles =
    component.type === 'line'
      ? component.orientation === 'horizontal'
        ? (['w', 'e'] as ResizeHandle[])
        : (['n', 's'] as ResizeHandle[])
      : RESIZE_HANDLES;

  const label = component.name ?? (component.type === 'text' ? component.text : component.type);
  return (
    <div
      className={`ar-component ar-component-${component.type}${preview.error ? ' ar-component-invalid' : ''}`}
      style={preview.style}
      data-component-id={component.id}
      role="option"
      aria-selected={selected}
      aria-label={`${component.type}: ${label}`}
      title={preview.error ?? undefined}
      onPointerDown={onPointerDown}
    >
      {component.type === 'text' && <span className="ar-component-text">{preview.label}</span>}
      {component.type === 'image' && <span className="ar-hint">{preview.label}</span>}
      {single &&
        handles.map((h) => <span key={h} className={`ar-handle ar-handle-${h}`} data-handle={h} onPointerDown={onHandleDown(h)} />)}
    </div>
  );
}

function BandView({ section, width }: { section: DesignSection; width: number }) {
  const { controller, state, labels, zoom } = useDesignerContext();
  const scale = designScale(state.template.unit, zoom);
  const ref = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const band = section.band;
  const selected = state.selection.bandId === band.id && state.selection.componentIds.length === 0;
  const { settings } = state;
  const gridPx = settings.grid * scale;
  const guides = state.guides?.bandId === band.id ? state.guides.guides : [];

  const toBand = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) controller.selectBand(band.id);
    const start = toBand(e.clientX, e.clientY);
    trackPointer(
      e,
      (_dx, _dy, ev) => {
        const p = toBand(ev.clientX, ev.clientY);
        setMarquee(rectFromPoints(start.x, start.y, p.x, p.y));
      },
      (ev, moved) => {
        setMarquee(null);
        if (!moved) return;
        const p = toBand(ev.clientX, ev.clientY);
        controller.selectInRect(band.id, rectFromPoints(start.x, start.y, p.x, p.y), additive);
      },
    );
  };

  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const h0 = band.height;
    controller.beginInteraction('Resize band');
    trackPointer(
      e,
      (_dx, dy) => controller.resizeBand(band.id, h0 + dy / scale),
      () => controller.endInteraction(),
    );
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDropping(false);
    const payload = readPayload(e.dataTransfer);
    if (!payload) return;
    e.preventDefault();
    const p = toBand(e.clientX, e.clientY);
    const grid = settings.snapToGrid ? settings.grid : 0;
    const at = { x: Math.max(0, snapToGrid(p.x, grid)), y: Math.max(0, snapToGrid(p.y, grid)) };
    if (payload.kind === 'component') controller.addComponent(band.id, payload.type, at);
    else controller.insertField(band.id, payload.path, at, payload.root);
  };

  const canRemove = section.role !== 'detail';
  return (
    <section aria-label={section.label}>
      <div
        className="ar-section-caption"
        aria-selected={selected}
        style={{ paddingLeft: 6 + section.depth * 12 }}
        onClick={() => controller.selectBand(band.id)}
      >
        <span>{section.label}</span>
        <span className="ar-spacer" />
        {canRemove && (
          <button
            type="button"
            className="ar-btn"
            aria-label={`${labels.removeBand}: ${section.label}`}
            title={labels.removeBand}
            onClick={(e) => {
              e.stopPropagation();
              controller.removeBand(band.id);
            }}
          >
            ×
          </button>
        )}
      </div>
      <div
        ref={ref}
        className={`ar-band${settings.showGrid ? ' ar-band-grid' : ''}${dropping ? ' ar-band-drop' : ''}`}
        data-band-id={band.id}
        role="listbox"
        aria-multiselectable="true"
        aria-label={section.label}
        style={{
          width,
          height: Math.max(band.height * scale, 4),
          backgroundSize: settings.showGrid && gridPx >= 4 ? `${gridPx}px ${gridPx}px` : undefined,
        }}
        onPointerDown={onPointerDown}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer?.types ?? []).some((t) => t === 'application/x-ariana-report' || t === 'text/plain')) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        {band.components.map((c) => (
          <ComponentView key={c.id} component={c} bandId={band.id} scale={scale} />
        ))}
        {guides.map((g, i) => (
          <div
            key={i}
            className="ar-guide"
            style={
              g.orientation === 'vertical'
                ? { left: g.position * scale, top: 0, bottom: 0, width: 1 }
                : { top: g.position * scale, left: 0, right: 0, height: 1 }
            }
          />
        ))}
        {marquee && (
          <div className="ar-marquee" style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.width * scale, height: marquee.height * scale }} />
        )}
        <div className="ar-band-resize" data-band-resize={band.id} aria-hidden="true" onPointerDown={onResizeDown} />
      </div>
    </section>
  );
}

/** The design canvas: all bands of the template stacked with captions. */
export function DesignSurface() {
  const { controller, state, zoom } = useDesignerContext();
  const width = controller.bodyWidth() * designScale(state.template.unit, zoom);
  const sections = controller.sections();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isEditable(e.target)) return;
    if (controller.handleKey(e)) e.preventDefault();
  };
  return (
    <div className="ar-surface-scroll" tabIndex={0} onKeyDown={onKeyDown} aria-label="Design surface">
      <div className="ar-surface" style={{ width }}>
        {sections.map((s) => (
          <BandView key={s.band.id} section={s} width={width} />
        ))}
      </div>
    </div>
  );
}
