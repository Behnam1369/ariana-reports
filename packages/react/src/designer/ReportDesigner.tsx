import { useCallback, useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  createTemplate,
  downloadBytes,
  injectStyles,
  resolveUiLocale,
  fontFamilies,
  safeFileName,
  themeVars,
  type ArianaTheme,
  type IconName,
  type DesignerController,
  type DesignerSettings,
  type ExcelExportOptions,
  type Labels,
  type PdfExportOptions,
  type ReportTemplate,
  type TextMeasurer,
  type UiLocale,
} from '@ariana-reports/core';
import { useDesignerController, useLatest, useStore } from '../hooks';
import { ReportViewer } from '../ReportViewer';
import { DesignerContext, type DesignerContextValue } from './context';
import { DataPanel, ParametersPanel, Toolbox } from './DataPanel';
import { DesignSurface } from './DesignSurface';
import { PropertiesPanel } from './PropertiesPanel';
import { TextEditor } from './TextEditor';
import { Icon } from '../Icon';

export interface ReportDesignerProps {
  /** Initial template (object or JSON text). Later changes are ignored; use `controller.load()` to replace it. */
  template?: ReportTemplate | string;
  /** Sample JSON data for field detection and the preview tab. */
  sampleData?: unknown;
  /** Called after every change with the new template. */
  onChange?: (template: ReportTemplate) => void;
  /**
   * Called when the user clicks Save. Without it, Save downloads the
   * template as a .json file.
   */
  onSave?: (template: ReportTemplate, json: string) => void | Promise<void>;
  settings?: Partial<DesignerSettings>;
  labels?: Partial<Labels>;
  /**
   * UI language: a registered locale code such as "fa", or a `UiLocale`
   * object. Sets the labels and the writing direction of the toolbar and
   * panels; the design surface itself stays left to right. Defaults to English.
   */
  uiLocale?: string | UiLocale;
  /** UI colors, radius and font; e.g. `themeFromMui(useTheme())`. See `ArianaTheme`. */
  theme?: ArianaTheme;
  /**
   * Extra font families for the font lists, e.g. ["Vazirmatn", "Roboto"].
   * Families of `preview.pdf.fonts` are added automatically. The browser
   * needs the font (via @font-face) to show it; register it in `pdf.fonts`
   * for PDF export.
   */
  fonts?: string[];
  /** Options for the preview tab. */
  preview?: {
    params?: Record<string, unknown>;
    measurer?: TextMeasurer;
    pdf?: PdfExportOptions;
    excel?: ExcelExportOptions;
    /** Decides which image sources the preview may load (default: http(s), blob, raster data URIs, relative URLs). */
    allowImageSrc?: (src: string) => boolean;
  };
  controller?: DesignerController;
  injectStyles?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Report designer: banded design surface with drag and drop, properties,
 * data binding, expression checking, undo/redo, JSON open/save and preview.
 */
export function ReportDesigner(props: ReportDesignerProps) {
  const { template, sampleData, onChange, onSave, settings, labels: labelOverrides, uiLocale, theme, fonts: fontsProp, preview, controller: external, injectStyles: inject = true, className, style } = props;
  const controller = useDesignerController({ template, sampleData, settings }, external);
  const state = useStore(controller);
  const ui = resolveUiLocale(uiLocale, labelOverrides);
  const labels = ui.labels;
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useLatest(onChange);
  const first = useRef(true);

  useEffect(() => {
    if (inject) injectStyles(rootRef.current?.ownerDocument);
  }, [inject]);

  useEffect(() => {
    if (sampleData !== undefined) controller.setSampleData(sampleData);
  }, [controller, sampleData]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current?.(state.template);
  }, [state.template, onChangeRef]);

  const confirmDiscard = () => !state.dirty || typeof window === 'undefined' || window.confirm(labels.unsavedChanges);

  const save = async () => {
    const json = controller.toJSON();
    try {
      if (onSave) await onSave(state.template, json);
      else downloadBytes(new TextEncoder().encode(json), safeFileName(state.template.name, 'json'), 'application/json');
      controller.markSaved();
      setMessage(null);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const open = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      controller.load(await file.text());
      setMessage(null);
    } catch (err) {
      setMessage(`${labels.invalidFile}: ${(err as Error).message}`);
    }
  };

  const sel = state.selection.componentIds.length;
  const alignment = controller.textAlignment();
  const hasText = mode === 'design' && controller.selectedComponents().some((c) => c.type === 'text');
  const fonts = fontFamilies(state.template, [...(fontsProp ?? []), ...(preview?.pdf?.fonts ?? []).map((f) => f.family)]);
  const value: DesignerContextValue = { controller, state, labels, values: ui.values, dir: ui.dir, zoom, fonts, openTextEditor: setEditing };

  const iconButton = (icon: IconName, label: string, disabled: boolean, onClick: () => void, key?: string, extra = '') => (
    <button key={key ?? icon} type="button" className={`ar-btn ar-btn-icon${extra ? ` ${extra}` : ''}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
  const toggleButton = (icon: IconName, label: string, pressed: boolean, onClick: () => void) => (
    <button type="button" className="ar-btn ar-btn-icon" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );

  return (
    <DesignerContext.Provider value={value}>
      <div ref={rootRef} className={`ar-root ar-designer${className ? ` ${className}` : ''}`} style={{ ...themeVars(theme), ...style }} dir={ui.dir} lang={ui.code}>
        <div className="ar-toolbar" role="toolbar" aria-label={labels.designerToolbar}>
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" onClick={() => confirmDiscard() && controller.load(createTemplate())}>
              <Icon name="newFile" />
              {labels.newReport}
            </button>
            <button type="button" className="ar-btn" onClick={() => confirmDiscard() && fileRef.current?.click()}>
              <Icon name="open" />
              {labels.openReport}
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-hidden="true" data-testid="ar-open-file" onChange={open} />
            <button type="button" className="ar-btn" onClick={() => void save()}>
              <Icon name="save" />
              {labels.saveReport}
              {state.dirty ? ' •' : ''}
            </button>
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group">
            {iconButton('undo', labels.undo, !state.canUndo, () => controller.undo())}
            {iconButton('redo', labels.redo, !state.canRedo, () => controller.redo())}
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group" aria-label={labels.textAlignment} role="group">
            {(
              [
                ['left', labels.alignLeft, 'textLeft'],
                ['center', labels.alignCenter, 'textCenter'],
                ['right', labels.alignRight, 'textRight'],
                ['justify', labels.alignJustify, 'textJustify'],
              ] as const
            ).map(([a, label, icon]) => (
              <button key={a} type="button" className="ar-btn ar-btn-icon" aria-label={label} title={label} aria-pressed={alignment.textAlign === a} disabled={!hasText} onClick={() => controller.setTextAlign(a)}>
                <Icon name={icon} />
              </button>
            ))}
            {(
              [
                ['top', labels.alignTop, 'valignTop'],
                ['middle', labels.alignMiddle, 'valignMiddle'],
                ['bottom', labels.alignBottom, 'valignBottom'],
              ] as const
            ).map(([a, label, icon]) => (
              <button key={a} type="button" className="ar-btn ar-btn-icon" aria-label={label} title={label} aria-pressed={alignment.verticalAlign === a} disabled={!hasText} onClick={() => controller.setVerticalAlign(a)}>
                <Icon name={icon} />
              </button>
            ))}
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group">
            {iconButton('distributeHorizontal', labels.distributeHorizontal, sel < 3, () => controller.distribute('horizontal'))}
            {iconButton('distributeVertical', labels.distributeVertical, sel < 3, () => controller.distribute('vertical'))}
            {iconButton('bringToFront', labels.bringToFront, sel === 0, () => controller.reorder('front'))}
            {iconButton('sendToBack', labels.sendToBack, sel === 0, () => controller.reorder('back'))}
            {iconButton('delete', labels.delete, sel === 0, () => controller.removeComponents(), undefined, 'ar-btn-danger')}
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group">
            {toggleButton('grid', labels.showGrid, state.settings.showGrid, () => controller.updateSettings({ showGrid: !state.settings.showGrid }))}
            {toggleButton('snap', labels.snap, state.settings.snapToGrid, () =>
              controller.updateSettings({ snapToGrid: !state.settings.snapToGrid, snapToObjects: !state.settings.snapToGrid }),
            )}
            {toggleButton('margins', labels.showMargins, state.settings.showMargins, () => controller.updateSettings({ showMargins: !state.settings.showMargins }))}
            <select className="ar-select" aria-label={labels.zoom} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => (
                <option key={z} value={z}>
                  {z * 100}%
                </option>
              ))}
            </select>
          </div>
          <span className="ar-spacer" />
          <div className="ar-tabs" role="tablist">
            <button type="button" role="tab" className="ar-btn" aria-selected={mode === 'design'} onClick={() => setMode('design')}>
              <Icon name="design" />
              {labels.design}
            </button>
            <button type="button" role="tab" className="ar-btn" aria-selected={mode === 'preview'} onClick={() => setMode('preview')}>
              <Icon name="preview" />
              {labels.preview}
            </button>
          </div>
        </div>
        {message && (
          <div className="ar-status ar-status-error" role="alert" style={{ padding: '6px 8px' }}>
            {message}
          </div>
        )}
        {mode === 'design' ? (
          <div className="ar-designer-body">
            <aside className="ar-panel" aria-label={`${labels.components} / ${labels.data}`}>
              <div className="ar-panel-header" title={state.template.name}>
                {state.template.name}
              </div>
              <Toolbox />
              <DataPanel />
              <ParametersPanel />
            </aside>
            <DesignSurface />
            <PropertiesPanel />
          </div>
        ) : (
          <ReportViewer
            template={state.template}
            data={controller.getSampleData() ?? {}}
            params={preview?.params}
            measurer={preview?.measurer}
            pdf={preview?.pdf}
            excel={preview?.excel}
            allowImageSrc={preview?.allowImageSrc}
            labels={labelOverrides}
            uiLocale={uiLocale}
            showIssues
            injectStyles={false}
          />
        )}
        {editing && mode === 'design' && <TextEditor componentId={editing} onClose={closeEditor} />}
      </div>
    </DesignerContext.Provider>
  );
}
