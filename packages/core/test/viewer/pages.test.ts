// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateReport, PageList, PX_PER_PT } from '../../src';
import { band, region, text, tpl } from '../layout/helpers';

const doc = generateReport(
  tpl({ body: [region({ detail: band(100, [text('{{ row.id }}')]) })] }),
  { items: Array.from({ length: 6 }, (_, i) => ({ id: i + 1 })) },
);

const rect = (top: number, height: number) => ({ left: 0, top, right: 300, bottom: top + height, width: 300, height, x: 0, y: top, toJSON: () => ({}) });

function setup(options: ConstructorParameters<typeof PageList>[2] = {}) {
  const scroller = document.createElement('div');
  const host = document.createElement('div');
  scroller.appendChild(host);
  document.body.appendChild(scroller);
  const list = new PageList(scroller, host, options);
  // Fake layout: pages are 300px tall, stacked without gaps; the viewport is 400px tall.
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 300 * doc.pages.length });
  scroller.getBoundingClientRect = () => rect(0, 400);
  const layout = () =>
    list.pageElements.forEach((slot, i) => {
      slot.getBoundingClientRect = () => rect(i * 300 - scroller.scrollTop, 300);
    });
  return { scroller, host, list, layout };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('PageList', () => {
  it('creates a sized slot per page and renders pages', () => {
    const { host, list } = setup();
    list.update({ document: doc, zoom: 2, pageIndex: 0 });
    expect(doc.pages.length).toBeGreaterThan(2);
    const slots = host.querySelectorAll<HTMLElement>('.ar-page-slot');
    expect(slots).toHaveLength(doc.pages.length);
    expect(slots[0]!.style.width).toBe(`${Number((doc.pageWidth * 2 * PX_PER_PT).toFixed(3))}px`);
    expect(host.querySelectorAll('.ar-page')).toHaveLength(doc.pages.length);
    list.update({ document: null, zoom: 2, pageIndex: 0 });
    expect(host.children).toHaveLength(0);
  });

  it('renders only pages near the viewport with IntersectionObserver', () => {
    const observed: Element[] = [];
    let callback: IntersectionObserverCallback = () => {};
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { host, list } = setup();
    list.update({ document: doc, zoom: 1, pageIndex: 0 });
    expect(observed).toHaveLength(doc.pages.length);
    expect(host.querySelectorAll('.ar-page')).toHaveLength(0);
    callback([{ target: observed[1]!, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(host.querySelectorAll('.ar-page')).toHaveLength(1);
    expect((observed[1] as HTMLElement).querySelector('.ar-page')).toBeTruthy();
    callback([{ target: observed[1]!, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(host.querySelectorAll('.ar-page')).toHaveLength(0);
  });

  it('reports the current page while scrolling and scrolls to pages on request', async () => {
    const onPageChange = vi.fn();
    const { scroller, list, layout } = setup({ onPageChange });
    list.update({ document: doc, zoom: 1, pageIndex: 0 });
    layout();
    scroller.scrollTop = 350; // page 2 covers the middle of the viewport (y = 200)
    scroller.dispatchEvent(new Event('scroll'));
    await vi.waitFor(() => expect(onPageChange).toHaveBeenLastCalledWith(1));
    expect(list.currentPage).toBe(1);

    list.update({ document: doc, zoom: 1, pageIndex: 2 });
    expect(scroller.scrollTop).toBe(600);
    // The scroll event caused by scrollToPage does not report a page change.
    onPageChange.mockClear();
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 30));
    expect(onPageChange).not.toHaveBeenCalled();
    expect(list.currentPage).toBe(2);
  });

  it('keeps the current page when the zoom changes and cleans up on destroy', () => {
    const { scroller, host, list, layout } = setup();
    list.update({ document: doc, zoom: 1, pageIndex: 0 });
    layout();
    list.update({ document: doc, zoom: 1, pageIndex: 1 });
    expect(scroller.scrollTop).toBe(300);
    list.update({ document: doc, zoom: 1.5, pageIndex: 1 });
    layout();
    expect(list.currentPage).toBe(1);
    list.destroy();
    expect(host.children).toHaveLength(0);
  });
});
