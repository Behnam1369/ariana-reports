import type { LayoutDocument } from '../layout/types';
import { CSS, PX_PER_PT, renderPage, type RenderOptions } from './render';

/** "continuous" shows every page in one scrollable column; "single" shows one page at a time. */
export type ViewMode = 'continuous' | 'single';

export interface PageListOptions {
  /** Called when scrolling makes another page the current one. */
  onPageChange?: (index: number) => void;
  /**
   * Pages within this distance of the visible area are rendered, as a CSS
   * margin string. Pages further away are replaced by empty placeholders.
   * Defaults to "100% 0px" (one viewport above and below).
   */
  renderMargin?: string;
}

export interface PageListState {
  document: LayoutDocument | null;
  /** Zoom factor (1 = physical size). */
  zoom: number;
  /** Page to show; scrolls there when it differs from the current page. */
  pageIndex: number;
  allowImageSrc?: (src: string) => boolean;
  /** Accessible page name, see `RenderOptions.pageLabel`. */
  pageLabel?: string;
}

/** CSS class of the placeholder that holds one page. */
export const PAGE_SLOT_CLASS = 'ar-page-slot';
/** CSS class of the element that holds all page slots. */
export const PAGE_LIST_CLASS = 'ar-pages';

/**
 * Continuous page view: lays out every page of a document one below the
 * other inside a scroll container, renders only the pages near the visible
 * area, and reports which page is current while the user scrolls.
 *
 * Framework-neutral; the React and Vue viewers wrap it.
 */
export class PageList {
  private slots: HTMLElement[] = [];
  private rendered = new Set<number>();
  private observer: IntersectionObserver | null = null;
  private state: PageListState = { document: null, zoom: 1, pageIndex: 0 };
  private current = 0;
  /** scrollTop set by `scrollToPage`; scroll events at this position do not change the current page. */
  private programmaticTop: number | null = null;
  private frame = 0;
  private destroyed = false;

  /**
   * @param scroller the scrolling element (overflow: auto)
   * @param host element inside `scroller` that receives the page slots
   */
  constructor(
    private readonly scroller: HTMLElement,
    private readonly host: HTMLElement,
    private readonly options: PageListOptions = {},
  ) {
    host.classList.add(PAGE_LIST_CLASS, CSS.document);
    scroller.addEventListener('scroll', this.onScroll, { passive: true });
  }

  /** Index of the page currently considered visible. */
  get currentPage(): number {
    return this.current;
  }

  /** Page slot elements, one per page. */
  get pageElements(): readonly HTMLElement[] {
    return this.slots;
  }

  /** Applies new inputs. Rebuilds the slots when the document or zoom changed. */
  update(next: PageListState): void {
    if (this.destroyed) return;
    const prev = this.state;
    this.state = next;
    const relayout = next.document !== prev.document || next.zoom !== prev.zoom || this.slots.length === 0;
    const restyle = next.allowImageSrc !== prev.allowImageSrc || next.pageLabel !== prev.pageLabel;
    if (relayout) {
      this.build();
      this.scrollToPage(next.pageIndex);
    } else {
      if (restyle) for (const i of [...this.rendered]) this.renderSlot(i);
      if (next.pageIndex !== this.current) this.scrollToPage(next.pageIndex);
    }
  }

  /** Scrolls so the top of a page is at the top of the scroll container. */
  scrollToPage(index: number): void {
    const n = this.slots.length;
    if (n === 0) {
      this.current = 0;
      return;
    }
    const i = Math.min(n - 1, Math.max(0, Math.trunc(index)));
    this.current = i;
    const slot = this.slots[i]!;
    const top = this.scroller.scrollTop + slot.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top - this.paddingTop();
    this.scroller.scrollTop = Math.max(0, top);
    this.programmaticTop = this.scroller.scrollTop;
    // Without IntersectionObserver every page is rendered in build().
  }

  destroy(): void {
    this.destroyed = true;
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.observer?.disconnect();
    this.observer = null;
    if (this.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.host.replaceChildren();
    this.slots = [];
    this.rendered.clear();
  }

  private paddingTop(): number {
    const view = this.scroller.ownerDocument.defaultView;
    const value = view?.getComputedStyle ? parseFloat(view.getComputedStyle(this.scroller).paddingTop) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  private build(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.rendered.clear();
    const doc = this.state.document;
    if (!doc) {
      this.slots = [];
      this.host.replaceChildren();
      return;
    }
    const d = this.host.ownerDocument;
    const scale = this.state.zoom * PX_PER_PT;
    const width = `${Number((doc.pageWidth * scale).toFixed(3))}px`;
    const height = `${Number((doc.pageHeight * scale).toFixed(3))}px`;
    this.slots = doc.pages.map((_, i) => {
      const slot = d.createElement('div');
      slot.className = PAGE_SLOT_CLASS;
      slot.dataset.pageIndex = String(i);
      slot.style.width = width;
      slot.style.height = height;
      return slot;
    });
    this.host.replaceChildren(...this.slots);

    const IO = d.defaultView?.IntersectionObserver ?? (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : undefined);
    if (!IO) {
      this.slots.forEach((_, i) => this.renderSlot(i));
      return;
    }
    this.observer = new IO(
      (entries) => {
        for (const entry of entries) {
          const i = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (entry.isIntersecting) this.renderSlot(i);
          else this.clearSlot(i);
        }
      },
      { root: this.scroller, rootMargin: this.options.renderMargin ?? '100% 0px' },
    );
    for (const slot of this.slots) this.observer.observe(slot);
  }

  private renderSlot(i: number): void {
    const doc = this.state.document;
    const slot = this.slots[i];
    if (!doc || !slot || !doc.pages[i]) return;
    const options: RenderOptions = { scale: this.state.zoom, ownerDocument: slot.ownerDocument };
    if (this.state.allowImageSrc) options.allowImageSrc = this.state.allowImageSrc;
    if (this.state.pageLabel) options.pageLabel = this.state.pageLabel;
    slot.replaceChildren(renderPage(doc, i, options));
    this.rendered.add(i);
  }

  private clearSlot(i: number): void {
    if (!this.rendered.has(i)) return;
    this.slots[i]?.replaceChildren();
    this.rendered.delete(i);
  }

  private readonly onScroll = (): void => {
    if (this.frame) return;
    const run = () => {
      this.frame = 0;
      this.detectCurrent();
    };
    if (typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(run);
    else run();
  };

  /** Current page: the last page whose top edge is above the middle of the viewport. */
  private detectCurrent(): void {
    if (this.destroyed || this.slots.length === 0) return;
    const top = this.scroller.scrollTop;
    if (this.programmaticTop !== null && Math.abs(top - this.programmaticTop) < 2) return;
    this.programmaticTop = null;
    const box = this.scroller.getBoundingClientRect();
    const probe = box.top + this.scroller.clientHeight / 2;
    let lo = 0;
    let hi = this.slots.length - 1;
    let found = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.slots[mid]!.getBoundingClientRect().top <= probe) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // At the very bottom the last pages may never reach the middle line.
    if (top + this.scroller.clientHeight >= this.scroller.scrollHeight - 1 && top > 0) found = this.slots.length - 1;
    if (found !== this.current) {
      this.current = found;
      this.options.onPageChange?.(found);
    }
  }
}
