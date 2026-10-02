/**
 * Default stylesheet for the viewer and designer UIs. React and Vue
 * components use the same class names, so both look the same. Override any
 * rule in your own CSS, or set the CSS variables on a parent element.
 */
export const ARIANA_STYLES = `
.ar-root {
  --ar-bg: #f3f4f6;
  --ar-panel: #ffffff;
  --ar-border: #d1d5db;
  --ar-text: #111827;
  --ar-muted: #6b7280;
  --ar-accent: #2563eb;
  --ar-accent-soft: rgba(37, 99, 235, 0.12);
  --ar-danger: #b91c1c;
  --ar-focus: 0 0 0 2px rgba(37, 99, 235, 0.45);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ar-text);
  background: var(--ar-bg);
  box-sizing: border-box;
}
.ar-root *, .ar-root *::before, .ar-root *::after { box-sizing: border-box; }
.ar-root :focus-visible { outline: none; box-shadow: var(--ar-focus); }

.ar-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--ar-panel);
  border-bottom: 1px solid var(--ar-border);
}
.ar-toolbar-group { display: flex; align-items: center; gap: 2px; }
.ar-toolbar-sep { width: 1px; align-self: stretch; margin: 0 4px; background: var(--ar-border); }
.ar-spacer { flex: 1; }

.ar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.ar-btn:hover:not(:disabled) { background: var(--ar-bg); border-color: var(--ar-border); }
.ar-btn:disabled { opacity: 0.45; cursor: default; }
.ar-btn[aria-pressed="true"] { background: var(--ar-accent-soft); border-color: var(--ar-accent); }
.ar-btn-primary { background: var(--ar-accent); color: #fff; }
.ar-btn-primary:hover:not(:disabled) { background: var(--ar-accent); filter: brightness(1.1); }
.ar-btn-danger { color: var(--ar-danger); }

.ar-input, .ar-select, .ar-textarea {
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--ar-border);
  border-radius: 4px;
  background: #fff;
  color: inherit;
  font: inherit;
  min-width: 0;
}
.ar-textarea { height: auto; min-height: 56px; padding: 4px 6px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ar-input[aria-invalid="true"], .ar-textarea[aria-invalid="true"] { border-color: var(--ar-danger); }
.ar-input-page { width: 52px; text-align: center; }
.ar-input-color { width: 36px; padding: 2px; }

.ar-viewer-body { flex: 1; min-height: 0; display: flex; }
.ar-viewer-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  gap: 16px;
}
.ar-viewer-scroll .ar-page { box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.08); }
.ar-status { padding: 24px; color: var(--ar-muted); }
.ar-status-error { color: var(--ar-danger); white-space: pre-wrap; }
.ar-issues {
  width: 320px;
  overflow: auto;
  background: var(--ar-panel);
  border-left: 1px solid var(--ar-border);
  padding: 8px;
}
.ar-issue { padding: 6px; border-bottom: 1px solid var(--ar-border); }
.ar-issue-error { color: var(--ar-danger); }
.ar-issue code { display: block; color: var(--ar-muted); word-break: break-all; }
.ar-error { outline: 1px dashed var(--ar-danger); outline-offset: -1px; }

.ar-designer-body { flex: 1; min-height: 0; display: flex; }
.ar-panel {
  width: 260px;
  flex: none;
  overflow: auto;
  background: var(--ar-panel);
  border-right: 1px solid var(--ar-border);
}
.ar-panel-right { border-right: 0; border-left: 1px solid var(--ar-border); width: 300px; }
.ar-panel-section { border-bottom: 1px solid var(--ar-border); padding: 8px; }
.ar-panel-title { margin: 0 0 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ar-muted); }
.ar-field { display: grid; grid-template-columns: 96px 1fr; align-items: center; gap: 6px; margin-bottom: 6px; }
.ar-field > label, .ar-field > .ar-label { color: var(--ar-muted); font-size: 12px; }
.ar-field-full { grid-template-columns: 1fr; }
.ar-field-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.ar-field-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.ar-check { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.ar-hint { font-size: 11px; color: var(--ar-muted); }
.ar-field-error { grid-column: 1 / -1; font-size: 11px; color: var(--ar-danger); }

.ar-toolbox { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.ar-toolbox-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--ar-border);
  border-radius: 4px;
  background: #fff;
  cursor: grab;
  font: inherit;
  color: inherit;
}
.ar-tree { list-style: none; margin: 0; padding: 0 0 0 12px; }
.ar-tree-root { padding-left: 0; }
.ar-tree-item {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: grab;
  user-select: none;
}
.ar-tree-item:hover { background: var(--ar-bg); }
.ar-tree-type { margin-left: auto; font-size: 11px; color: var(--ar-muted); }

.ar-surface-scroll { flex: 1; min-width: 0; overflow: auto; padding: 24px; }
.ar-surface { margin: 0 auto; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); width: max-content; }
.ar-section-caption {
  display: flex; align-items: center; gap: 6px;
  height: 22px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--ar-muted);
  background: #eef2f7;
  border-top: 1px solid var(--ar-border);
  cursor: pointer;
  user-select: none;
}
.ar-section-caption[aria-selected="true"] { background: var(--ar-accent-soft); color: var(--ar-accent); }
.ar-section-caption .ar-btn { height: 18px; min-width: 18px; padding: 0 4px; font-size: 11px; }
.ar-band { position: relative; overflow: visible; touch-action: none; }
.ar-band-grid {
  background-image:
    linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px);
}
.ar-band-drop { outline: 2px dashed var(--ar-accent); outline-offset: -2px; }
.ar-band-resize {
  position: absolute; left: 0; right: 0; bottom: -3px; height: 6px;
  cursor: ns-resize; z-index: 3;
}
.ar-band-resize:hover { background: var(--ar-accent-soft); }
.ar-component {
  position: absolute;
  overflow: hidden;
  cursor: move;
  outline: 1px dashed rgba(0,0,0,0.25);
  outline-offset: -1px;
  user-select: none;
}
.ar-component-text { white-space: pre-wrap; word-break: break-word; }
.ar-component-image { display: flex; align-items: center; justify-content: center; color: var(--ar-muted); background: repeating-linear-gradient(45deg, #f9fafb, #f9fafb 6px, #f3f4f6 6px, #f3f4f6 12px); }
.ar-component-line { outline: none; overflow: visible; }
.ar-component[aria-selected="true"] { outline: 1px solid var(--ar-accent); z-index: 2; }
.ar-component-invalid { outline: 1px solid var(--ar-danger); }
.ar-handle {
  position: absolute; width: 8px; height: 8px;
  background: #fff; border: 1px solid var(--ar-accent);
  z-index: 4;
}
.ar-handle-nw { left: -4px; top: -4px; cursor: nwse-resize; }
.ar-handle-n { left: calc(50% - 4px); top: -4px; cursor: ns-resize; }
.ar-handle-ne { right: -4px; top: -4px; cursor: nesw-resize; }
.ar-handle-e { right: -4px; top: calc(50% - 4px); cursor: ew-resize; }
.ar-handle-se { right: -4px; bottom: -4px; cursor: nwse-resize; }
.ar-handle-s { left: calc(50% - 4px); bottom: -4px; cursor: ns-resize; }
.ar-handle-sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
.ar-handle-w { left: -4px; top: calc(50% - 4px); cursor: ew-resize; }
.ar-guide { position: absolute; pointer-events: none; z-index: 5; background: #ec4899; }
.ar-marquee { position: absolute; pointer-events: none; z-index: 5; border: 1px solid var(--ar-accent); background: var(--ar-accent-soft); }

.ar-menu { position: relative; display: inline-block; }
.ar-menu-list {
  position: absolute; z-index: 20; top: 100%; left: 0;
  min-width: 180px;
  margin: 2px 0 0; padding: 4px;
  list-style: none;
  background: var(--ar-panel);
  border: 1px solid var(--ar-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.ar-menu-list .ar-btn { width: 100%; justify-content: flex-start; }
.ar-visually-hidden {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
@media print {
  .ar-toolbar, .ar-issues { display: none !important; }
}
`;

export const STYLE_ELEMENT_ID = 'ariana-report-styles';

/** Adds the default stylesheet to a document once. Safe to call repeatedly; no-op without a DOM. */
export function injectStyles(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): void {
  if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = ARIANA_STYLES;
  doc.head.appendChild(style);
}
