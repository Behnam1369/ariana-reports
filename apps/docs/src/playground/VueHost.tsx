import { useEffect, useRef } from 'react';
import type { App } from 'vue';

type Props = Record<string, unknown>;
interface Mounted {
  app: App;
  set: (props: Props) => void;
}

/**
 * Mounts the Vue designer or viewer inside the React page, so one playground
 * can run either framework against the same controller. Vue is loaded only
 * when this component is used.
 */
export default function VueHost({ kind, props }: { kind: 'designer' | 'viewer'; props: Props }) {
  const el = useRef<HTMLDivElement>(null);
  const mounted = useRef<Mounted | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([import('vue'), import('@ariana-reports/vue')]).then(([{ createApp, h, shallowReactive }, lib]) => {
      if (cancelled || !el.current) return;
      const state = shallowReactive({ props: latest.current });
      const component = kind === 'designer' ? lib.ReportDesigner : lib.ReportViewer;
      const app = createApp({ render: () => h(component as never, state.props) });
      app.mount(el.current);
      mounted.current = { app, set: (next) => (state.props = next) };
    });
    return () => {
      cancelled = true;
      mounted.current?.app.unmount();
      mounted.current = null;
    };
  }, [kind]);

  useEffect(() => {
    mounted.current?.set(props);
  });

  return <div ref={el} style={{ height: '100%' }} />;
}
