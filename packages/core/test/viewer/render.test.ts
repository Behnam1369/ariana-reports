// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  CSS,
  cssColor,
  cssFontFamily,
  generateReport,
  isSafeImageSrc,
  PX_PER_PT,
  renderDocument,
  renderPage,
  type LayoutDocument,
} from '../../src';
import type { ReportComponent } from '../../src/model/types';
import { band, region, text, tpl } from '../layout/helpers';

const single = (components: ReportComponent[]): LayoutDocument =>
  generateReport(tpl({ body: [{ kind: 'band', ...band(100, components) }] }), {});

const px = (pt: number) => `${Number((pt * PX_PER_PT).toFixed(3))}px`;

const items = (page: HTMLElement) => Array.from(page.querySelectorAll<HTMLElement>(`.${CSS.item}`));

describe('helpers', () => {
  it('cssColor converts template colors and drops transparent/invalid ones', () => {
    expect(cssColor('#ff0000')).toBe('rgb(255, 0, 0)');
    expect(cssColor('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
    expect(cssColor('transparent')).toBeUndefined();
    expect(cssColor('red; background: url(x)')).toBeUndefined();
    expect(cssColor(undefined)).toBeUndefined();
  });

  it('cssFontFamily maps to stacks that match the PDF fonts', () => {
    expect(cssFontFamily('Helvetica')).toMatch(/^Helvetica, Arial/);
    expect(cssFontFamily('Times New Roman')).toMatch(/^"Times New Roman"/);
    expect(cssFontFamily('monospace')).toMatch(/^"Courier New"/);
    expect(cssFontFamily('Vazirmatn')).toMatch(/^"Vazirmatn", Helvetica/);
    expect(cssFontFamily('Bad"Name')).toMatch(/^"BadName"/);
  });

  it.each([
    ['data:image/png;base64,AAAA', true],
    ['data:image/jpeg;base64,AAAA', true],
    ['data:image/svg+xml;base64,AAAA', false],
    ['data:text/html,<script>', false],
    ['https://cdn.example.com/logo.png', true],
    ['http://x/y.png', true],
    ['blob:https://x/1', true],
    ['/assets/logo.png', true],
    ['logo.png', true],
    ['javascript:alert(1)', false],
    [' JavaScript:alert(1)', false],
    ['vbscript:x', false],
    ['file:///etc/passwd', false],
    ['', false],
  ])('isSafeImageSrc(%j) = %s', (src, expected) => {
    expect(isSafeImageSrc(src)).toBe(expected);
  });
});

describe('renderPage', () => {
  it('sizes the page in CSS pixels and labels it', () => {
    const page = renderPage(single([]), 0);
    expect(page.className).toBe(CSS.page);
    expect(page.style.width).toBe(px(200));
    expect(page.style.height).toBe(px(300));
    expect(page.dataset.page).toBe('1');
    expect(page.getAttribute('aria-label')).toBe('Page 1 of 1');
  });

  it('applies the scale option', () => {
    const page = renderPage(single([]), 0, { scale: 2 });
    expect(page.style.width).toBe(px(400));
  });

  it('throws for an out-of-range page', () => {
    expect(() => renderPage(single([]), 3)).toThrow(RangeError);
  });

  it('renders bands with background, border and data attributes', () => {
    const doc = generateReport(
      tpl({ body: [{ kind: 'band', ...band(20, [], { id: 'b1', style: { backgroundColor: '#00ff00', border: { width: 1, color: '#000', style: 'dashed', sides: ['bottom'] } } }) }] }),
      {},
    );
    const bandEl = renderPage(doc, 0).querySelector<HTMLElement>(`.${CSS.band}`)!;
    expect(bandEl.dataset.band).toBe('b1');
    expect(bandEl.dataset.role).toBe('static');
    expect(bandEl.style.background).toBe('rgb(0, 255, 0)');
    expect(bandEl.style.borderBottom).toMatch(/dashed/);
    expect(bandEl.style.borderTop).toBe('');
    expect(bandEl.style.top).toBe(px(10));
  });

  it('renders text with one block per pre-wrapped line and resolved styles', () => {
    const doc = single([
      text('one two three four five six', {
        id: 'txt',
        x: 5,
        width: 40,
        height: 60,
        canGrow: true,
        style: { fontSize: 12, fontWeight: 'bold', fontStyle: 'italic', color: '#112233', textAlign: 'right', verticalAlign: 'middle', textDecoration: 'underline', padding: 2 },
      }),
    ]);
    const layoutLines = (doc.pages[0]!.bands[0]!.items[0] as any).lines as string[];
    const el = items(renderPage(doc, 0))[0]!;
    expect(el.classList.contains(CSS.text)).toBe(true);
    expect(el.dataset.component).toBe('txt');
    expect(Array.from(el.children).map((c) => c.textContent)).toEqual(layoutLines);
    expect(el.style.left).toBe(px(15));
    expect(el.style.fontSize).toBe(px(12));
    expect(el.style.fontWeight).toBe('bold');
    expect(el.style.fontStyle).toBe('italic');
    expect(el.style.color).toBe('rgb(17, 34, 51)');
    expect(el.style.justifyContent).toBe('center');
    expect(el.style.textDecoration).toBe('underline');
    expect(el.style.padding).toBe(px(2));
    expect((el.children[0] as HTMLElement).style.textAlign).toBe('right');
    expect((el.children[0] as HTMLElement).style.whiteSpace).toBe('pre');
  });

  it('justifies every line except the last', () => {
    const doc = single([text('aa bb cc dd ee ff gg hh', { width: 40, height: 60, style: { textAlign: 'justify' } })]);
    const lines = Array.from(items(renderPage(doc, 0))[0]!.children) as HTMLElement[];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(0, -1).every((l) => l.style.textAlign === 'justify')).toBe(true);
    expect(lines.at(-1)!.style.textAlign).toBe('left');
  });

  it('sets the resolved text direction, as the PDF does', () => {
    const doc = single([
      text('سلام دنیا Hi', { id: 'fa' }),
      text('Hello', { id: 'en', y: 20 }),
      text('Hello', { id: 'forced', y: 40, style: { direction: 'rtl' } }),
      text('آ ب پ ت ث ج چ ح خ د ذ ر', { id: 'just', y: 60, width: 40, height: 60, style: { textAlign: 'justify' } }),
    ]);
    const [fa, en, forced, just] = items(renderPage(doc, 0));
    expect(fa!.dir).toBe('rtl');
    expect((fa!.children[0] as HTMLElement).style.textAlign).toBe('right');
    expect(en!.dir).toBe('ltr');
    expect(forced!.dir).toBe('rtl');
    expect((forced!.children[0] as HTMLElement).style.textAlign).toBe('right');
    // The last line of right-to-left justified text starts at the right edge.
    const lines = Array.from(just!.children) as HTMLElement[];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.at(-1)!.style.textAlign).toBe('right');
  });

  it('sets text content, never HTML', () => {
    const doc = single([text('<img src=x onerror="alert(1)">')]);
    const el = items(renderPage(doc, 0))[0]!;
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('marks expression errors', () => {
    const doc = single([text('{{ nope.x }}')]);
    const el = items(renderPage(doc, 0))[0]!;
    expect(el.classList.contains(CSS.error)).toBe(true);
    expect(el.title).toBe('Expression error');
  });

  it('renders images only for safe sources', () => {
    const img = (src: string, id: string): ReportComponent => ({ id, type: 'image', x: 0, y: 0, width: 10, height: 10, src, fit: 'cover' });
    const page = renderPage(single([img('data:image/png;base64,AAAA', 'a'), img('javascript:alert(1)', 'b'), img('', 'c')]), 0);
    const [a, b, c] = items(page);
    expect(a!.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(a!.querySelector('img')!.style.objectFit).toBe('cover');
    expect(b!.querySelector('img')).toBeNull();
    expect(c!.querySelector('img')).toBeNull();
  });

  it('accepts a custom image policy', () => {
    const img: ReportComponent = { id: 'i', type: 'image', x: 0, y: 0, width: 10, height: 10, src: 'https://x/y.png' };
    const page = renderPage(single([img]), 0, { allowImageSrc: () => false });
    expect(page.querySelector('img')).toBeNull();
  });

  it('renders lines centred on their geometry', () => {
    const doc = single([
      { id: 'h', type: 'line', orientation: 'horizontal', x: 0, y: 10, width: 50, height: 0, style: { border: { width: 2, color: '#f00', style: 'dotted' } } },
      { id: 'v', type: 'line', orientation: 'vertical', x: 20, y: 0, width: 0, height: 30 },
    ]);
    const [h, v] = items(renderPage(doc, 0));
    expect(h!.style.top).toBe(px((10 + 10 - 1)));
    expect(h!.style.width).toBe(px(50));
    expect(h!.style.borderTop).toMatch(/dotted/);
    expect(v!.style.left).toBe(px((10 + 20 - 0.5)));
    expect(v!.style.borderLeft).toMatch(/solid/);
  });

  it('renders rectangles with fill, border and radius', () => {
    const doc = single([
      { id: 'r', type: 'rectangle', x: 0, y: 0, width: 30, height: 20, cornerRadius: 3, style: { backgroundColor: '#0000ff', border: { width: 1, color: '#000', style: 'solid' } } },
    ]);
    const el = items(renderPage(doc, 0))[0]!;
    expect(el.classList.contains(CSS.rectangle)).toBe(true);
    expect(el.style.background).toBe('rgb(0, 0, 255)');
    expect(el.style.borderRadius).toBe(px(3));
    expect(el.style.borderTop).toMatch(/solid/);
  });

  it('can render into another document', () => {
    const other = document.implementation.createHTMLDocument('x');
    const page = renderPage(single([text('hi')]), 0, { ownerDocument: other });
    expect(page.ownerDocument).toBe(other);
  });
});

describe('renderDocument', () => {
  it('renders all pages into the container, replacing old content', () => {
    const doc = generateReport(tpl({ body: [region({ detail: band(200, [text('{{ row.id }}')]) })] }), { items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const container = document.createElement('div');
    container.innerHTML = '<p>old</p>';
    const pages = renderDocument(doc, container);
    expect(pages).toHaveLength(3);
    expect(container.children).toHaveLength(3);
    expect(container.querySelector('p')).toBeNull();
    expect(container.classList.contains(CSS.document)).toBe(true);
    expect(Array.from(container.querySelectorAll(`.${CSS.text}`)).map((e) => e.textContent)).toEqual(['1', '2', '3']);
  });
});
