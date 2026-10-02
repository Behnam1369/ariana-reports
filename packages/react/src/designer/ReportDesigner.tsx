import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  createTemplate,
  downloadBytes,
  injectStyles,
  mergeLabels,
  safeFileName,
  type DesignerController,
  type DesignerSettings,
  type ExcelExportOptions,
  type Labels,
  type PdfExportOptions,
  type ReportTemplate,
  type TextMeasurer,
} from '@ariana-report/core';
import { useDesignerController, useLatest, useStore } from '../hooks';
import { ReportViewer } from '../ReportViewer';
import { DesignerContext, type DesignerContextValue } from './context';
import { DataPanel, ParametersPanel, Toolbox } from './DataPanel';
import { DesignSurface } from './DesignSurface';
import { PropertiesPanel } from './PropertiesPanel';

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
  /** Options for the preview tab. */
  preview?: { params?: Record<string, unknown>; measurer?: TextMeasurer; pdf?: PdfExportOptions; excel?: ExcelExportOptions };
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
  const { template, sampleData, onChange, onSave, settings, labels: labelOverrides, preview, controller: external, injectStyles: inject = true, className, style } = props;
  const controller = useDesignerController({ template, sampleData, settings }, external);
  const state = useStore(controller);
  const labels = mergeLabels(labelOverrides);
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
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
  const value: DesignerContextValue = { controller, state, labels, zoom };

  return (
    <DesignerContext.Provider value={value}>
      <div ref={rootRef} className={`ar-root ar-designer${className ? ` ${className}` : ''}`} style={style}>
        <div className="ar-toolbar" role="toolbar" aria-label="Report designer">
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" onClick={() => confirmDiscard() && controller.load(createTemplate())}>
              {labels.newReport}
            </button>
            <button type="button" className="ar-btn" onClick={() => confirmDiscard() && fileRef.current?.click()}>
              {labels.openReport}
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-hidden="true" data-testid="ar-open-file" onChange={open} />
            <button type="button" className="ar-btn" onClick={() => void save()}>
              {labels.saveReport}
              {state.dirty ? ' •' : ''}
            </button>
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" aria-label={labels.undo} title={labels.undo} disabled={!state.canUndo} onClick={() => controller.undo()}>
              ↶
            </button>
            <button type="button" className="ar-btn" aria-label={labels.redo} title={labels.redo} disabled={!state.canRedo} onClick={() => controller.redo()}>
              ↷
            </button>
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group" aria-label={labels.align} role="group">
            {(
              [
                ['left', labels.alignLeft, '⇤'],
                ['center', labels.alignCenter, '↔'],
                ['right', labels.alignRight, '⇥'],
                ['top', labels.alignTop, '⤒'],
                ['middle', labels.alignMiddle, '↕'],
                ['bottom', labels.alignBottom, '⤓'],
              ] as const
            ).map(([a, label, icon]) => (
              <button key={a} type="button" className="ar-btn" aria-label={label} title={label} disabled={sel === 0 || mode !== 'design'} onClick={() => controller.align(a)}>
                {icon}
              </button>
            ))}
            <button type="button" className="ar-btn" aria-label={labels.distributeHorizontal} title={labels.distributeHorizontal} disabled={sel < 3} onClick={() => controller.distribute('horizontal')}>
              ⋯
            </button>
            <button type="button" className="ar-btn" aria-label={labels.distributeVertical} title={labels.distributeVertical} disabled={sel < 3} onClick={() => controller.distribute('vertical')}>
              ⋮
            </button>
            <button type="button" className="ar-btn" aria-label={labels.bringToFront} title={labels.bringToFront} disabled={sel === 0} onClick={() => controller.reorder('front')}>
              ⬒
            </button>
            <button type="button" className="ar-btn" aria-label={labels.sendToBack} title={labels.sendToBack} disabled={sel === 0} onClick={() => controller.reorder('back')}>
              ⬓
            </button>
            <button type="button" className="ar-btn ar-btn-danger" aria-label={labels.delete} title={labels.delete} disabled={sel === 0} onClick={() => controller.removeComponents()}>
              🗑
            </button>
          </div>
          <span className="ar-toolbar-sep" />
          <div className="ar-toolbar-group">
            <button type="button" className="ar-btn" aria-pressed={state.settings.showGrid} onClick={() => controller.updateSettings({ showGrid: !state.settings.showGrid })}>
              {labels.showGrid}
            </button>
            <button
              type="button"
              className="ar-btn"
              aria-pressed={state.settings.snapToGrid}
              onClick={() => controller.updateSettings({ snapToGrid: !state.settings.snapToGrid, snapToObjects: !state.settings.snapToGrid })}
            >
              {labels.snap}
            </button>
            <select className="ar-select" aria-label={labels.zoom} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => (
                <option key={z} value={z}>
                  {z * 100}%
                </option>
              ))}
            </select>
          </div>
          <span className="ar-spacer" />
          <div className="ar-toolbar-group" role="tablist">
            <button type="button" role="tab" className="ar-btn" aria-selected={mode === 'design'} aria-pressed={mode === 'design'} onClick={() => setMode('design')}>
              {labels.design}
            </button>
            <button type="button" role="tab" className="ar-btn" aria-selected={mode === 'preview'} aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
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
            labels={labelOverrides}
            showIssues
            injectStyles={false}
          />
        )}
      </div>
    </DesignerContext.Provider>
  );
}
