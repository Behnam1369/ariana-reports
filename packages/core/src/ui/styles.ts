/**
 * Default stylesheet for the viewer and designer UIs. React and Vue
 * components use the same class names, so both look the same.
 *
 * Theming: every color, the corner radius and the font come from CSS custom
 * properties on `.ar-root` (see `ArianaTheme` / `themeVars()`), so the UI
 * can follow your application theme (e.g. `themeFromMui(theme)`) without
 * overriding individual rules.
 */
export const ARIANA_STYLES = `
/* Theme defaults, with zero specificity so any rule of yours (e.g. \`.ar-root { --ar-primary: red }\`) wins.
   A nested root (the designer's preview) inherits the outer theme. */
:where(.ar-root:not(.ar-root .ar-root)) {
  --ar-primary: #1976d2;
  --ar-on-primary: #ffffff;
  --ar-bg: #eef1f5;
  --ar-surface: #ffffff;
  --ar-surface-2: #f5f7fa;
  --ar-input-bg: #ffffff;
  --ar-border: #dde2e8;
  --ar-text: #1f2933;
  --ar-muted: #66717d;
  --ar-danger: #c62828;
  --ar-radius: 6px;
  --ar-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --ar-font-size: 13px;
  --ar-band-color: #455a64;
  --ar-band-caption-text: #ffffff;
  --ar-primary-soft: color-mix(in srgb, var(--ar-primary) 14%, transparent);
  --ar-primary-softer: color-mix(in srgb, var(--ar-primary) 7%, transparent);
  --ar-hover: color-mix(in srgb, var(--ar-text) 7%, transparent);
  --ar-focus: 0 0 0 3px color-mix(in srgb, var(--ar-primary) 35%, transparent);
  --ar-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 16px rgba(15, 23, 42, 0.08);
}
.ar-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  font-family: var(--ar-font);
  font-size: var(--ar-font-size);
  line-height: 1.45;
  color: var(--ar-text);
  background: var(--ar-bg);
  box-sizing: border-box;
}
.ar-root *, .ar-root *::before, .ar-root *::after { box-sizing: border-box; }
.ar-root :focus-visible { outline: none; box-shadow: var(--ar-focus); }
.ar-icon { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ar-root[dir="rtl"] .ar-icon-flip { transform: scaleX(-1); }

/* -- toolbar ------------------------------------------------------------- */
.ar-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  padding: 6px 10px;
  background: var(--ar-surface);
  border-bottom: 1px solid var(--ar-border);
}
.ar-toolbar-group { display: flex; align-items: center; gap: 2px; }
.ar-toolbar-sep { width: 1px; align-self: stretch; margin: 4px 6px; background: var(--ar-border); }
.ar-spacer { flex: 1; }

.ar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--ar-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s;
}
.ar-btn-icon { padding: 0; width: 32px; }
.ar-btn-icon .ar-icon { width: 18px; height: 18px; }
.ar-btn:hover:not(:disabled) { background: var(--ar-hover); }
.ar-btn:disabled { opacity: 0.4; cursor: default; }
.ar-btn[aria-pressed="true"] { background: var(--ar-primary-soft); color: var(--ar-primary); }
.ar-btn-primary, .ar-btn-primary:hover:not(:disabled) { background: var(--ar-primary); color: var(--ar-on-primary); }
.ar-btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
.ar-btn-outline { border-color: var(--ar-border); }
.ar-btn-danger { color: var(--ar-danger); }
.ar-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--ar-danger) 10%, transparent); }
.ar-btn-sm { height: 26px; min-width: 26px; padding: 0 8px; font-size: 12px; }
.ar-btn-sm.ar-btn-icon { width: 26px; padding: 0; }
.ar-btn-sm .ar-icon { width: 15px; height: 15px; }
.ar-tabs { display: inline-flex; padding: 3px; gap: 2px; border-radius: calc(var(--ar-radius) + 2px); background: var(--ar-surface-2); border: 1px solid var(--ar-border); }
.ar-tabs .ar-btn { height: 28px; }
.ar-tabs .ar-btn[aria-selected="true"] { background: var(--ar-surface); color: var(--ar-primary); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12); }

/* -- form controls ------------------------------------------------------- */
.ar-input, .ar-select, .ar-textarea {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--ar-border);
  border-radius: var(--ar-radius);
  background: var(--ar-input-bg);
  color: inherit;
  font: inherit;
  min-width: 0;
  width: 100%;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.ar-input:hover, .ar-select:hover, .ar-textarea:hover { border-color: color-mix(in srgb, var(--ar-text) 35%, var(--ar-border)); }
.ar-input:focus, .ar-select:focus, .ar-textarea:focus { outline: none; border-color: var(--ar-primary); box-shadow: var(--ar-focus); }
.ar-toolbar .ar-input, .ar-toolbar .ar-select { width: auto; }
.ar-textarea { height: auto; min-height: 64px; padding: 6px 8px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }
.ar-input[aria-invalid="true"], .ar-textarea[aria-invalid="true"] { border-color: var(--ar-danger); }
.ar-input-page { width: 56px !important; text-align: center; }
.ar-input-color { width: 32px !important; height: 28px; padding: 2px; cursor: pointer; }
.ar-root input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--ar-primary); cursor: pointer; }

/* -- viewer -------------------------------------------------------------- */
.ar-viewer-body { flex: 1; min-height: 0; display: flex; }
.ar-viewer-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  gap: 20px;
}
.ar-page-host .ar-page, .ar-page-slot { box-shadow: var(--ar-shadow); }
/* Report content is laid out left to right, also in right-to-left UIs. Auto margins keep wide pages scrollable. */
.ar-page-host, .ar-pages { direction: ltr; margin: 0 auto; flex: none; }
.ar-pages { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.ar-pages[hidden] { display: none; }
.ar-page-slot { flex: none; position: relative; background: #fff; }
.ar-status { padding: 24px; color: var(--ar-muted); }
.ar-status-error { color: var(--ar-danger); white-space: pre-wrap; }
.ar-issues {
  width: 320px;
  overflow: auto;
  background: var(--ar-surface);
  border-inline-start: 1px solid var(--ar-border);
}
.ar-issues > ul { padding: 4px 8px !important; }
.ar-issue { padding: 8px; border-radius: var(--ar-radius); margin-bottom: 4px; background: var(--ar-surface-2); }
.ar-issue-error { color: var(--ar-danger); }
.ar-issue code { display: block; color: var(--ar-muted); word-break: break-all; font-size: 12px; }
.ar-error { outline: 1px dashed var(--ar-danger); outline-offset: -1px; }

/* -- panels -------------------------------------------------------------- */
.ar-designer-body { flex: 1; min-height: 0; display: flex; }
.ar-panel {
  width: 272px;
  flex: none;
  overflow: auto;
  background: var(--ar-surface);
  border-inline-end: 1px solid var(--ar-border);
}
.ar-panel-right { border-inline-end: 0; border-inline-start: 1px solid var(--ar-border); width: 320px; }
.ar-panel-header {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  background: var(--ar-surface);
  border-bottom: 1px solid var(--ar-border);
  font-weight: 600;
}
h2.ar-panel-header { margin: 0; font-size: inherit; }
.ar-panel-header .ar-hint { font-weight: 400; margin-inline-start: auto; }
.ar-panel-section, .ar-section { border-bottom: 1px solid var(--ar-border); }
.ar-panel-section { padding: 10px 14px; }
.ar-section > summary, .ar-section-summary {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ar-muted);
}
.ar-section > summary::-webkit-details-marker { display: none; }
.ar-section > summary:hover { color: var(--ar-text); background: var(--ar-surface-2); }
.ar-section > summary .ar-icon { width: 14px; height: 14px; transition: transform 0.15s; transform: rotate(-90deg); }
.ar-root[dir="rtl"] .ar-section > summary .ar-icon { transform: rotate(90deg); }
.ar-section[open] > summary .ar-icon { transform: none !important; }
.ar-section-body { padding: 2px 14px 14px; }
.ar-panel-title { margin: 0 0 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ar-muted); }
.ar-subsection { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--ar-border); }
.ar-field { display: grid; grid-template-columns: 104px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 8px; }
.ar-field > label, .ar-field > .ar-label { color: var(--ar-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.ar-field-full { grid-template-columns: minmax(0, 1fr); gap: 4px; }
.ar-field-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.ar-field-grid > label { display: flex; flex-direction: column; gap: 3px; }
.ar-field-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.ar-field-row > .ar-input, .ar-field-row > .ar-select { flex: 1; width: auto; }
.ar-field-control { display: flex; gap: 4px; align-items: flex-start; min-width: 0; }
.ar-field-control > :first-child { flex: 1; min-width: 0; }
.ar-field-control { flex-wrap: wrap; }
.ar-field-control > .ar-field-error { flex-basis: 100%; }
.ar-check { display: flex; align-items: center; gap: 8px; min-height: 26px; margin-bottom: 2px; cursor: pointer; }
.ar-check label { cursor: pointer; }
.ar-hint { font-size: 11.5px; color: var(--ar-muted); }
p.ar-hint { margin: 2px 0 10px; }
.ar-field-error { grid-column: 1 / -1; font-size: 11.5px; color: var(--ar-danger); }
.ar-color { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ar-color .ar-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* toolbox */
.ar-toolbox { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.ar-toolbox-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  min-height: 60px;
  padding: 8px 6px;
  border: 1px solid var(--ar-border);
  border-radius: var(--ar-radius);
  background: var(--ar-surface);
  cursor: grab;
  font: inherit;
  font-size: 12px;
  color: inherit;
  transition: border-color 0.12s, background-color 0.12s, color 0.12s;
}
.ar-toolbox-item .ar-icon { width: 22px; height: 22px; color: var(--ar-muted); }
.ar-toolbox-item:hover { border-color: var(--ar-primary); background: var(--ar-primary-softer); }
.ar-toolbox-item:hover .ar-icon { color: var(--ar-primary); }
.ar-toolbox-item:active { cursor: grabbing; }

/* data sources and field tree */
.ar-source { border: 1px solid var(--ar-border); border-radius: var(--ar-radius); margin-bottom: 8px; background: var(--ar-surface); overflow: hidden; }
.ar-source > summary { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: pointer; list-style: none; background: var(--ar-surface-2); font-weight: 600; }
.ar-source > summary::-webkit-details-marker { display: none; }
.ar-source > summary .ar-icon { width: 16px; height: 16px; color: var(--ar-primary); }
.ar-source-body { padding: 10px; }
.ar-tree { list-style: none; margin: 0; padding: 0; padding-inline-start: 14px; }
.ar-tree-root { padding-inline-start: 0; margin-top: 4px; }
.ar-tree-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px;
  border-radius: calc(var(--ar-radius) - 2px);
  cursor: grab;
  user-select: none;
}
.ar-tree-item .ar-icon { width: 14px; height: 14px; color: var(--ar-muted); }
.ar-tree-item:hover { background: var(--ar-primary-softer); }
.ar-tree-item:hover .ar-icon { color: var(--ar-primary); }
.ar-tree-type { margin-inline-start: auto; font-size: 11px; color: var(--ar-muted); padding: 0 6px; border-radius: 999px; background: var(--ar-surface-2); }

/* -- design surface ------------------------------------------------------ */
.ar-surface-scroll { flex: 1; min-width: 0; overflow: auto; padding: 32px; }
.ar-surface { position: relative; direction: ltr; margin: 0 auto; background: #fff; box-shadow: var(--ar-shadow); width: max-content; color: #111827; }
.ar-margin-guide { position: absolute; pointer-events: none; z-index: 6; border: 1px dashed color-mix(in srgb, var(--ar-primary) 60%, transparent); }
.ar-section-band { --ar-band-tint: color-mix(in srgb, var(--ar-band-color) 9%, #ffffff); }
.ar-section-caption {
  display: flex; align-items: center; gap: 6px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ar-band-caption-text);
  background: var(--ar-band-color);
  cursor: pointer;
  user-select: none;
  font-family: var(--ar-font);
}
.ar-section-caption > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ar-section-caption[aria-selected="true"] { box-shadow: inset 0 0 0 2px var(--ar-primary), inset 4px 0 0 var(--ar-primary); }
.ar-section-caption .ar-btn { height: 18px; min-width: 18px; width: 18px; padding: 0; color: inherit; border-radius: 3px; }
.ar-section-caption .ar-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.ar-section-caption .ar-icon { width: 13px; height: 13px; }
.ar-band { position: relative; overflow: visible; touch-action: none; background-color: var(--ar-band-tint); }
.ar-band-grid {
  background-image:
    linear-gradient(to right, rgba(0,0,0,0.055) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0,0,0,0.055) 1px, transparent 1px);
}
.ar-band-drop { outline: 2px dashed var(--ar-primary); outline-offset: -2px; }
.ar-band-resize {
  position: absolute; left: 0; right: 0; bottom: -3px; height: 6px;
  cursor: ns-resize; z-index: 3;
}
.ar-band-resize:hover { background: var(--ar-primary-soft); }
.ar-band-gap {
  height: 12px;
  touch-action: none;
  cursor: crosshair;
  background: #ffffff;
}
.ar-component {
  position: absolute;
  overflow: visible;
  cursor: move;
  outline: 1px dashed rgba(0, 0, 0, 0.3);
  outline-offset: -1px;
  user-select: none;
}
/* Content is clipped to the box; handles (children of the box) stay visible outside it. */
/* The inner body clips the content; the component box itself never clips, so handles can stick out. */
.ar-component-body, .ar-component-label { overflow: hidden; min-height: 0; min-width: 0; max-width: 100%; max-height: 100%; }
/* Text boxes wrap by default; wordWrap: false sets white-space: pre inline on the box. */
.ar-component-text { white-space: pre-wrap; word-break: break-word; }
.ar-component-image { display: flex; align-items: center; justify-content: center; color: #6b7280; background: repeating-linear-gradient(45deg, #f9fafb, #f9fafb 6px, #f3f4f6 6px, #f3f4f6 12px); }
.ar-component-line { outline: none; }
.ar-component[aria-selected="true"] { outline: 1px solid var(--ar-primary); z-index: 2; }
.ar-component-invalid { outline: 1px solid var(--ar-danger); }
.ar-handle {
  position: absolute; width: 8px; height: 8px;
  background: #fff; border: 1.5px solid var(--ar-primary); border-radius: 2px;
  z-index: 4;
}
/* Centered on the edges: half inside, half outside the component. */
.ar-handle-nw { left: -4px; top: -4px; cursor: nwse-resize; }
.ar-handle-n { left: calc(50% - 4px); top: -4px; cursor: ns-resize; }
.ar-handle-ne { right: -4px; top: -4px; cursor: nesw-resize; }
.ar-handle-e { right: -4px; top: calc(50% - 4px); cursor: ew-resize; }
.ar-handle-se { right: -4px; bottom: -4px; cursor: nwse-resize; }
.ar-handle-s { left: calc(50% - 4px); bottom: -4px; cursor: ns-resize; }
.ar-handle-sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
.ar-handle-w { left: -4px; top: calc(50% - 4px); cursor: ew-resize; }
.ar-guide { position: absolute; pointer-events: none; z-index: 5; background: #ec4899; }
.ar-marquee { position: absolute; pointer-events: none; z-index: 5; border: 1px solid var(--ar-primary); background: var(--ar-primary-soft); }

/* -- menus and dialogs --------------------------------------------------- */
.ar-menu { position: relative; display: inline-block; }
.ar-menu-list {
  position: absolute; z-index: 20; top: 100%; inset-inline-start: 0;
  min-width: 180px;
  margin: 4px 0 0; padding: 4px;
  list-style: none;
  background: var(--ar-surface);
  border: 1px solid var(--ar-border);
  border-radius: var(--ar-radius);
  box-shadow: var(--ar-shadow);
}
.ar-menu-list .ar-btn { width: 100%; justify-content: flex-start; }
.ar-modal-backdrop {
  position: fixed; inset: 0; z-index: 1300;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}
.ar-modal {
  display: flex; flex-direction: column;
  width: min(960px, 100%);
  height: min(640px, 100%);
  background: var(--ar-surface);
  color: var(--ar-text);
  border-radius: calc(var(--ar-radius) + 4px);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.3);
  overflow: hidden;
}
.ar-modal-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--ar-border); }
.ar-modal-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.ar-modal-body { flex: 1; min-height: 0; display: flex; }
.ar-modal-footer { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--ar-border); background: var(--ar-surface-2); }
.ar-editor-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; }
.ar-editor-main .ar-textarea { flex: 1; min-height: 0; resize: none; font-size: 13px; }
.ar-editor-toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.ar-editor-side { width: 260px; flex: none; overflow: auto; border-inline-start: 1px solid var(--ar-border); background: var(--ar-surface-2); padding: 12px; }
.ar-editor-side input.ar-input { margin-bottom: 8px; }
.ar-editor-list { list-style: none; margin: 0 0 12px; padding: 0; }
.ar-editor-list button {
  display: block; width: 100%; text-align: start;
  padding: 4px 8px; border: 0; border-radius: calc(var(--ar-radius) - 2px);
  background: transparent; color: inherit; cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ar-editor-list button:hover, .ar-editor-list button:focus-visible { background: var(--ar-primary-soft); color: var(--ar-primary); }

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
