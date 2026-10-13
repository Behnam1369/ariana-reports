import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import {
  DesignerController,
  ViewerController,
  type DesignerControllerOptions,
  type DesignerState,
  type ViewerControllerOptions,
  type ViewerState,
} from '@ariana-reports/core';

interface Store<S> {
  subscribe(listener: (state: S) => void): () => void;
  getState(): S;
}

/** Subscribes a component to a controller's state. */
export function useStore<S>(store: Store<S>): S {
  const subscribe = useCallback((onChange: () => void) => store.subscribe(() => onChange()), [store]);
  const getState = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Creates a viewer controller once per component (or uses the one passed in). */
export function useViewerController(options?: ViewerControllerOptions, external?: ViewerController): ViewerController {
  const [own] = useState(() => external ?? new ViewerController(options));
  return external ?? own;
}

/** Returns a viewer controller and its live state. */
export function useViewer(options?: ViewerControllerOptions): { controller: ViewerController; state: ViewerState } {
  const controller = useViewerController(options);
  return { controller, state: useStore(controller) };
}

/** Creates a designer controller once per component (or uses the one passed in). */
export function useDesignerController(options?: DesignerControllerOptions, external?: DesignerController): DesignerController {
  const [own] = useState(() => external ?? new DesignerController(options));
  return external ?? own;
}

/** Returns a designer controller and its live state. */
export function useDesigner(options?: DesignerControllerOptions): { controller: DesignerController; state: DesignerState } {
  const controller = useDesignerController(options);
  return { controller, state: useStore(controller) };
}

/** Keeps the latest value of a callback without re-running effects. */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
