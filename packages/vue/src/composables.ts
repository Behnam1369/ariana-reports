import { getCurrentInstance, markRaw, onBeforeUnmount, shallowRef, type ShallowRef } from 'vue';
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

/** A reactive (shallow) ref that follows a controller's state. Unsubscribes on unmount. */
export function useStore<S>(store: Store<S>): Readonly<ShallowRef<S>> {
  const state = shallowRef(store.getState());
  const off = store.subscribe((s) => {
    state.value = s;
  });
  if (getCurrentInstance()) onBeforeUnmount(off);
  return state;
}

/** Creates a viewer controller with live state. */
export function useViewer(options?: ViewerControllerOptions): { controller: ViewerController; state: Readonly<ShallowRef<ViewerState>> } {
  const controller = markRaw(new ViewerController(options));
  return { controller, state: useStore(controller) };
}

/** Creates a designer controller with live state. */
export function useDesigner(options?: DesignerControllerOptions): { controller: DesignerController; state: Readonly<ShallowRef<DesignerState>> } {
  const controller = markRaw(new DesignerController(options));
  return { controller, state: useStore(controller) };
}
