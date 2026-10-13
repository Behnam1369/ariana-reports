import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';

// Every file in demos/react is a demo; they load on demand, when the demo scrolls into view.
const demos = import.meta.glob<{ default: ComponentType }>('../demos/react/*.tsx');

/** True once the element has been visible once. Elements in a hidden tab never intersect, so they load when the tab opens. */
function useSeen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <div className="demo-loading">Demo failed: {this.state.error.message}</div> : this.props.children;
  }
}

export default function ReactDemo({ name }: { name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const seen = useSeen(host);
  const Demo = useMemo(() => {
    const load = demos[`../demos/react/${name}.tsx`];
    return load ? lazy(load) : null;
  }, [name]);
  return (
    <div ref={host} className="demo-mount" style={{ height: '100%' }}>
      {!Demo ? (
        <div className="demo-loading">Unknown demo "{name}"</div>
      ) : seen ? (
        <Boundary>
          <Suspense fallback={<div className="demo-loading">Loading demo…</div>}>
            <Demo />
          </Suspense>
        </Boundary>
      ) : (
        <div className="demo-loading">React demo</div>
      )}
    </div>
  );
}
