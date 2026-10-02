import { parseColor } from '../export/color';
import { standardFamily } from '../layout/text';
import type {
  LayoutBand,
  LayoutDocument,
  LayoutImage,
  LayoutItem,
  LayoutLine,
  LayoutPage,
  LayoutText,
  ResolvedBorder,
  ResolvedStyle,
} from '../layout/types';

/** CSS class names used by the renderer; style them with the exported stylesheet or your own CSS. */
export const CSS = {
  document: 'ar-document',
  page: 'ar-page',
  band: 'ar-band',
  item: 'ar-item',
  text: 'ar-text',
  line: 'ar-line',
  image: 'ar-image',
  rectangle: 'ar-rect',
  error: 'ar-error',
} as const;

export interface RenderOptions {
  /** Zoom factor; 1 renders pages at their physical size (1pt = 1/72in). Defaults to 1. */
  scale?: number;
  /** Document used to create elements. Defaults to the global document. */
  ownerDocument?: Document;
  /** Decides whether an image src may be loaded. Defaults to `isSafeImageSrc`. */
  allowImageSrc?: (src: string) => boolean;
}

/** CSS font stacks that match the PDF standard fonts used for measuring. */
export function cssFontFamily(family: string): string {
  const first = (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
  const std = standardFamily(first);
  const isStandardName = /^(helvetica|arial|sans-serif|times|times new roman|serif|courier|courier new|monospace)$/i.test(first);
  const stacks = {
    Helvetica: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif',
    Times: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
    Courier: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace',
  };
  if (isStandardName || first === '') return stacks[std];
  // Custom family: quote it and fall back to the closest standard stack.
  return `"${first.replace(/["\\]/g, '')}", ${stacks[std]}`;
}

/** Converts a template color to a safe CSS color string, or undefined. */
export function cssColor(value: string | undefined): string | undefined {
  const c = parseColor(value);
  if (!c || c.a === 0) return undefined;
  return c.a === 1 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${Number(c.a.toFixed(3))})`;
}

/** Allows data:image URIs, http(s) URLs and relative paths; rejects javascript: and other schemes. */
export function isSafeImageSrc(src: string): boolean {
  const s = src.trim();
  if (s === '') return false;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) return !/^data:image\/svg/i.test(s);
  if (/^https?:\/\//i.test(s)) return true;
  if (/^blob:/i.test(s)) return true;
  // Relative URLs: no scheme before the first slash, question mark or hash.
  return !/^[a-z][a-z0-9+.-]*:/i.test(s);
}

const pt = (n: number, scale: number) => `${Number((n * scale).toFixed(3))}px`;

/** Points to CSS pixels at scale 1 (96 dpi). */
export const PX_PER_PT = 96 / 72;

function borderCss(border: ResolvedBorder | undefined, el: HTMLElement, scale: number): void {
  if (!border) return;
  const color = cssColor(border.color);
  if (!color) return;
  const value = `${pt(border.width, scale)} ${border.style} ${color}`;
  for (const side of border.sides) {
    el.style.setProperty(`border-${side}`, value);
  }
}

function box(el: HTMLElement, x: number, y: number, width: number, height: number, s: number): void {
  el.style.position = 'absolute';
  el.style.left = pt(x, s);
  el.style.top = pt(y, s);
  el.style.width = pt(width, s);
  el.style.height = pt(height, s);
  el.style.boxSizing = 'border-box';
}

class DomRenderer {
  private readonly d: Document;
  private readonly s: number;
  private readonly allow: (src: string) => boolean;

  constructor(options: RenderOptions) {
    const d = options.ownerDocument ?? (typeof document !== 'undefined' ? document : undefined);
    if (!d) throw new Error('The viewer renderer requires a DOM document');
    this.d = d;
    this.s = (options.scale ?? 1) * PX_PER_PT;
    this.allow = options.allowImageSrc ?? isSafeImageSrc;
  }

  page(doc: LayoutDocument, page: LayoutPage): HTMLElement {
    const el = this.d.createElement('div');
    el.className = CSS.page;
    el.dataset.page = String(page.number);
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', `Page ${page.number} of ${doc.pages.length}`);
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.style.width = pt(doc.pageWidth, this.s);
    el.style.height = pt(doc.pageHeight, this.s);
    el.style.background = '#ffffff';
    el.style.flex = 'none';
    // Bands and items are siblings: item coordinates are page-relative, and later bands paint over earlier ones.
    for (const band of page.bands) {
      el.appendChild(this.band(band));
      for (const item of band.items) el.appendChild(this.item(item, band));
    }
    return el;
  }

  private band(band: LayoutBand): HTMLElement {
    const el = this.d.createElement('div');
    el.className = CSS.band;
    el.dataset.band = band.bandId;
    el.dataset.role = band.role;
    box(el, band.x, band.y, band.width, band.height, this.s);
    const bg = cssColor(band.backgroundColor);
    if (bg) el.style.background = bg;
    borderCss(band.border, el, this.s);
    return el;
  }

  private item(item: LayoutItem, band: LayoutBand): HTMLElement {
    let el: HTMLElement;
    switch (item.kind) {
      case 'text':
        el = this.text(item);
        break;
      case 'image':
        el = this.image(item);
        break;
      case 'line':
        el = this.line(item);
        break;
      case 'rectangle':
        el = this.d.createElement('div');
        el.className = `${CSS.item} ${CSS.rectangle}`;
        box(el, item.x, item.y, item.width, item.height, this.s);
        this.fillAndBorder(el, item.style);
        if (item.cornerRadius > 0) el.style.borderRadius = pt(item.cornerRadius, this.s);
        break;
    }
    el.dataset.component = item.componentId;
    el.dataset.band = band.bandId;
    return el;
  }

  private fillAndBorder(el: HTMLElement, style: ResolvedStyle): void {
    const bg = cssColor(style.backgroundColor);
    if (bg) el.style.background = bg;
    borderCss(style.border, el, this.s);
  }

  private text(item: LayoutText): HTMLElement {
    const { style } = item;
    const el = this.d.createElement('div');
    el.className = `${CSS.item} ${CSS.text}${item.error ? ` ${CSS.error}` : ''}`;
    box(el, item.x, item.y, item.width, item.height, this.s);
    el.style.overflow = 'hidden';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.justifyContent =
      style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
    // Borders are drawn on the item box; padding is applied inside it, as in the PDF.
    this.fillAndBorder(el, style);
    const p = style.padding;
    el.style.padding = `${pt(p.top, this.s)} ${pt(p.right, this.s)} ${pt(p.bottom, this.s)} ${pt(p.left, this.s)}`;
    el.style.fontFamily = cssFontFamily(style.fontFamily);
    el.style.fontSize = pt(style.fontSize, this.s);
    el.style.fontWeight = style.fontWeight;
    el.style.fontStyle = style.fontStyle;
    el.style.lineHeight = pt(item.lineHeight, this.s);
    el.style.color = cssColor(style.color) ?? 'transparent';
    if (style.textDecoration !== 'none') el.style.textDecoration = style.textDecoration;
    if (item.error) el.title = 'Expression error';

    // Lines are pre-wrapped by the engine; render one block per line so breaks match the PDF.
    item.lines.forEach((line, i) => {
      const lineEl = this.d.createElement('div');
      lineEl.style.whiteSpace = 'pre';
      lineEl.style.overflow = 'visible';
      lineEl.style.flex = 'none';
      lineEl.style.minHeight = pt(item.lineHeight, this.s);
      const isLast = i === item.lines.length - 1;
      lineEl.style.textAlign = style.textAlign === 'justify' ? (isLast ? 'left' : 'justify') : style.textAlign;
      if (style.textAlign === 'justify' && !isLast) {
        lineEl.style.textAlignLast = 'justify';
        lineEl.style.whiteSpace = 'pre-wrap';
      }
      lineEl.textContent = line;
      el.appendChild(lineEl);
    });
    return el;
  }

  private image(item: LayoutImage): HTMLElement {
    const el = this.d.createElement('div');
    el.className = `${CSS.item} ${CSS.image}`;
    box(el, item.x, item.y, item.width, item.height, this.s);
    el.style.overflow = 'hidden';
    this.fillAndBorder(el, item.style);
    if (item.src && this.allow(item.src)) {
      const img = this.d.createElement('img');
      img.src = item.src;
      img.alt = '';
      img.draggable = false;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      img.style.objectFit = item.fit === 'none' ? 'none' : item.fit;
      el.appendChild(img);
    }
    return el;
  }

  private line(item: LayoutLine): HTMLElement {
    const el = this.d.createElement('div');
    el.className = `${CSS.item} ${CSS.line}`;
    const horizontal = item.y1 === item.y2;
    const w = item.lineWidth;
    // Center the stroke on the geometric line, like the PDF renderer.
    const x = Math.min(item.x1, item.x2) - (horizontal ? 0 : w / 2);
    const y = Math.min(item.y1, item.y2) - (horizontal ? w / 2 : 0);
    const length = horizontal ? Math.abs(item.x2 - item.x1) : Math.abs(item.y2 - item.y1);
    box(el, x, y, horizontal ? length : w, horizontal ? w : length, this.s);
    const color = cssColor(item.color);
    if (color && w > 0) {
      el.style.setProperty(horizontal ? 'border-top' : 'border-left', `${pt(w, this.s)} ${item.lineStyle} ${color}`);
    }
    return el;
  }
}

/** Renders one page of a layout document to a DOM element. */
export function renderPage(doc: LayoutDocument, pageIndex: number, options: RenderOptions = {}): HTMLElement {
  const page = doc.pages[pageIndex];
  if (!page) throw new RangeError(`Page index ${pageIndex} is out of range (0..${doc.pages.length - 1})`);
  return new DomRenderer(options).page(doc, page);
}

/** Renders every page into `container`, replacing its contents. Returns the page elements. */
export function renderDocument(doc: LayoutDocument, container: HTMLElement, options: RenderOptions = {}): HTMLElement[] {
  const renderer = new DomRenderer({ ownerDocument: container.ownerDocument, ...options });
  const pages = doc.pages.map((p) => renderer.page(doc, p));
  container.replaceChildren(...pages);
  container.classList.add(CSS.document);
  return pages;
}
