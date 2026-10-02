import { createContext, useContext } from 'react';
import type { DesignerController, DesignerState, Labels } from '@ariana-report/core';

export interface DesignerContextValue {
  controller: DesignerController;
  state: DesignerState;
  labels: Labels;
  /** Design surface zoom. */
  zoom: number;
}

export const DesignerContext = createContext<DesignerContextValue | null>(null);

export function useDesignerContext(): DesignerContextValue {
  const value = useContext(DesignerContext);
  if (!value) throw new Error('Designer components must be used inside <ReportDesigner>');
  return value;
}

/** MIME type for drag-and-drop payloads from the toolbox and data tree. */
export const DND_TYPE = 'application/x-ariana-report';

export type DragPayload =
  | { kind: 'component'; type: 'text' | 'image' | 'line' | 'rectangle' }
  | { kind: 'field'; root: string; path: string[] };

export function readPayload(dt: DataTransfer | null): DragPayload | null {
  if (!dt) return null;
  const raw = dt.getData(DND_TYPE) || dt.getData('text/plain');
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DragPayload;
    if (value && (value.kind === 'component' || value.kind === 'field')) return value;
  } catch {
    // not ours
  }
  return null;
}

export function writePayload(dt: DataTransfer, payload: DragPayload): void {
  const json = JSON.stringify(payload);
  dt.setData(DND_TYPE, json);
  dt.setData('text/plain', json);
  dt.effectAllowed = 'copy';
}
