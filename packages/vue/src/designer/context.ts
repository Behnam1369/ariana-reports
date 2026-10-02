import { inject, type ComputedRef, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import type { DesignerController, DesignerState, Labels } from '@ariana-report/core';

export interface DesignerContext {
  controller: DesignerController;
  state: Readonly<ShallowRef<DesignerState>>;
  labels: ComputedRef<Labels>;
  /** Design surface zoom. */
  zoom: Ref<number>;
}

export const DESIGNER_KEY: InjectionKey<DesignerContext> = Symbol('ariana-report-designer');

export function useDesignerContext(): DesignerContext {
  const ctx = inject(DESIGNER_KEY, null);
  if (!ctx) throw new Error('Designer components must be used inside <ReportDesigner>');
  return ctx;
}

/** MIME type for drag-and-drop payloads from the toolbox and data tree. */
export const DND_TYPE = 'application/x-ariana-report';

export type DragPayload =
  | { kind: 'component'; type: 'text' | 'image' | 'line' | 'rectangle' }
  | { kind: 'field'; root: string; path: string[] };

export function readPayload(dt: DataTransfer | null | undefined): DragPayload | null {
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

export function writePayload(dt: DataTransfer | null, payload: DragPayload): void {
  if (!dt) return;
  const json = JSON.stringify(payload);
  dt.setData(DND_TYPE, json);
  dt.setData('text/plain', json);
  dt.effectAllowed = 'copy';
}
