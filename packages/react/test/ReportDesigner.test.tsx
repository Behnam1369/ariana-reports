import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerController, designScale, findBand, findComponent, themeFromMui, type ReportTemplate } from '@ariana-reports/core';
import { ReportDesigner, useDesigner } from '../src';
import { salesData, salesTemplate } from './fixtures';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** pt templates at zoom 1: 1 template unit = 4/3 CSS px. */
const SCALE = designScale('pt');

function setup(template: ReportTemplate = salesTemplate(), props: Partial<Parameters<typeof ReportDesigner>[0]> = {}) {
  const controller = new DesignerController({ template, sampleData: salesData, settings: { snapToGrid: false, snapToObjects: false } });
  const utils = render(<ReportDesigner controller={controller} {...props} />);
  const band = (id: string) => utils.container.querySelector(`[data-band-id="${id}"]`) as HTMLElement;
  const component = (id: string) => utils.container.querySelector(`[data-component-id="${id}"]`) as HTMLElement;
  const comp = (id: string) => findComponent(controller.template, id)?.component;
  return { ...utils, controller, band, component, comp, user: userEvent.setup() };
}

function drag(target: Element, from: { x: number; y: number }, to: { x: number; y: number }, init: PointerEventInit = {}) {
  fireEvent.pointerDown(target, { button: 0, clientX: from.x, clientY: from.y, ...init });
  fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y, ...init });
  fireEvent.pointerUp(window, { clientX: to.x, clientY: to.y, ...init });
}

/** jsdom has no DragEvent, so build a drop event with coordinates by hand. */
function dropAt(target: Element, dt: DataTransfer, clientX: number, clientY: number) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: dt, clientX, clientY });
  fireEvent(target, event);
}

function dataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (k: string, v: string) => void store.set(k, v),
    getData: (k: string) => store.get(k) ?? '',
    get types() {
      return [...store.keys()];
    },
    effectAllowed: 'all',
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

describe('ReportDesigner: surface', () => {
  it('renders every band with captions and its components', () => {
    const { container, component } = setup();
    const captions = Array.from(container.querySelectorAll('.ar-section-caption')).map((c) => c.firstElementChild!.textContent);
    expect(captions).toEqual(['Report header', 'Header: orders', 'Detail: orders', 'Footer: orders']);
    expect(component('cust').textContent).toBe('{{ row.customer }}');
    expect(component('cust').style.width).toBe(`${Number((100 * SCALE).toFixed(3))}px`);
  });

  it('selects components on click, with shift to toggle', () => {
    const { controller, component } = setup();
    fireEvent.pointerDown(component('cust'), { button: 0 });
    fireEvent.pointerUp(window);
    expect(controller.getState().selection.componentIds).toEqual(['cust']);
    expect(component('cust').getAttribute('aria-selected')).toBe('true');
    expect(component('cust').querySelectorAll('.ar-handle')).toHaveLength(8);
    fireEvent.pointerDown(component('tot'), { button: 0, shiftKey: true });
    expect(controller.getState().selection.componentIds).toEqual(['cust', 'tot']);
    // Every selected component shows its handles.
    expect(component('cust').querySelectorAll('.ar-handle')).toHaveLength(8);
    expect(component('tot').querySelectorAll('.ar-handle')).toHaveLength(8);
  });

  it('resizes every selected component with one handle', () => {
    const { controller, component, comp } = setup();
    act(() => controller.select(['cust', 'tot']));
    drag(component('tot').querySelector('[data-handle="s"]')!, { x: 0, y: 0 }, { x: 0, y: 6 * SCALE });
    expect(comp('cust')!.height).toBe(26);
    expect(comp('tot')!.height).toBe(26);
    act(() => controller.undo());
    expect(comp('cust')!.height).toBe(20);
    expect(comp('tot')!.height).toBe(20);
  });

  it('edits text in a dialog opened by double click', async () => {
    const { controller, component, comp, user } = setup();
    fireEvent.doubleClick(component('cust'));
    const dialog = screen.getByRole('dialog', { name: 'Edit text' });
    const area = within(dialog).getByLabelText('Text', { selector: 'textarea' }) as HTMLTextAreaElement;
    expect(area.value).toBe('{{ row.customer }}');
    expect(document.activeElement).toBe(area);
    await user.clear(area);
    await user.type(area, 'Name: ');
    await user.click(within(dialog).getByRole('button', { name: 'row.customer' }));
    expect(area.value).toBe('Name: {{ row.customer }}');
    await new Promise((r) => setTimeout(r, 50)); // caret is restored after a frame
    expect(area.selectionStart).toBe(area.value.length);
    area.setSelectionRange(0, 4);
    await user.click(within(dialog).getByRole('button', { name: 'Bold' }));
    expect(area.value).toBe('<b>Name</b>: {{ row.customer }}');
    expect((within(dialog).getByLabelText('Allow HTML tags') as HTMLInputElement).checked).toBe(true);
    // Nothing changes until Apply; then it is one undo step.
    expect(comp('cust')).toMatchObject({ text: '{{ row.customer }}' });
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(comp('cust')).toMatchObject({ text: '<b>Name</b>: {{ row.customer }}', allowHtml: true });
    act(() => controller.undo());
    expect(comp('cust')).toMatchObject({ text: '{{ row.customer }}' });
  });

  it('opens the text editor from the properties panel and cancels with Escape', async () => {
    const { controller, comp, user } = setup();
    act(() => controller.select(['cust']));
    await user.click(screen.getByRole('button', { name: 'Open text editor' }));
    const area = within(screen.getByRole('dialog')).getByLabelText('Text', { selector: 'textarea' });
    await user.type(area, 'x{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(comp('cust')).toMatchObject({ text: '{{ row.customer }}' });
  });

  it('colors bands on the design surface and lets users change the color', async () => {
    const { controller, container } = setup();
    const section = () => container.querySelector('[data-section-band="detail"]') as HTMLElement;
    expect(section().style.getPropertyValue('--ar-band-color')).toBe('');
    act(() => controller.selectBand('detail'));
    fireEvent.input(screen.getByLabelText('Band color'), { target: { value: '#ffcc00' } });
    expect(findBand(controller.template, 'detail')!.band.designColor).toBe('#ffcc00');
    expect(section().style.getPropertyValue('--ar-band-color')).toBe('#ffcc00');
    // Light colors get dark caption text.
    expect(section().style.getPropertyValue('--ar-band-caption-text')).toBe('#111827');
  });

  it('applies a theme as CSS variables, e.g. from a MUI theme', () => {
    const mui = { palette: { mode: 'dark' as const, primary: { main: '#ff5722' }, background: { default: '#000', paper: '#111' }, divider: '#333' }, shape: { borderRadius: 8 } };
    const { container } = setup(salesTemplate(), { theme: themeFromMui(mui) });
    const root = container.querySelector('.ar-root') as HTMLElement;
    expect(root.style.getPropertyValue('--ar-primary')).toBe('#ff5722');
    expect(root.style.getPropertyValue('--ar-surface')).toBe('#111');
    expect(root.style.getPropertyValue('--ar-radius')).toBe('8px');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('moves components by dragging as a single undo step', () => {
    const { controller, component, comp } = setup();
    drag(component('cust'), { x: 0, y: 0 }, { x: 20 * SCALE, y: 8 * SCALE });
    expect(comp('cust')).toMatchObject({ x: 20, y: 8 });
    expect(controller.getState().interacting).toBe(false);
    act(() => controller.undo());
    expect(comp('cust')).toMatchObject({ x: 0, y: 0 });
  });

  /** jsdom has no layout: give the detail and footer sections fixed screen positions. */
  function stubLayout(container: HTMLElement) {
    const rect = (top: number, height: number) => () => ({ left: 0, top, right: 600, bottom: top + height, width: 600, height, x: 0, y: top, toJSON: () => ({}) });
    const place = (id: string, top: number) => {
      const section = container.querySelector(`[data-section-band="${id}"]`) as HTMLElement;
      section.getBoundingClientRect = rect(top, 100);
      (section.querySelector('[data-band-id]') as HTMLElement).getBoundingClientRect = rect(top + 22, 66);
    };
    place('rh', 0);
    place('hdr', 100);
    place('detail', 200);
    place('ftr', 300);
  }

  it('moves a component to another band while dragging over it', () => {
    const { controller, container, component, band, comp } = setup();
    stubLayout(container);
    fireEvent.pointerDown(component('cust'), { button: 0, clientX: 0, clientY: 222 });
    fireEvent.pointerMove(window, { clientX: 10 * SCALE, clientY: 322 + 2 * SCALE });
    expect(findComponent(controller.template, 'cust')!.band.band.id).toBe('ftr');
    expect(band('ftr').classList.contains('ar-band-drop')).toBe(true);
    // Back over the original band: the component returns there.
    fireEvent.pointerMove(window, { clientX: 10 * SCALE, clientY: 222 + 4 * SCALE });
    expect(findComponent(controller.template, 'cust')!.band.band.id).toBe('detail');
    fireEvent.pointerMove(window, { clientX: 10 * SCALE, clientY: 322 + 2 * SCALE });
    fireEvent.pointerUp(window, { clientX: 10 * SCALE, clientY: 322 + 2 * SCALE });
    expect(comp('cust')).toMatchObject({ x: 10, y: 2 });
    expect(band('ftr').classList.contains('ar-band-drop')).toBe(false);
    expect(controller.getState().selection).toEqual({ componentIds: ['cust'], bandId: 'ftr' });
    // One undo step restores the original band and position.
    act(() => controller.undo());
    expect(findComponent(controller.template, 'cust')!.band.band.id).toBe('detail');
    expect(comp('cust')).toMatchObject({ x: 0, y: 0 });
  });

  it('moves a multi-selection to another band', () => {
    const { controller, container, component, comp } = setup();
    stubLayout(container);
    act(() => controller.select(['cust', 'tot']));
    drag(component('cust'), { x: 0, y: 222 }, { x: 0, y: 322 + 5 * SCALE });
    expect(findComponent(controller.template, 'cust')!.band.band.id).toBe('ftr');
    expect(findComponent(controller.template, 'tot')!.band.band.id).toBe('ftr');
    expect(comp('cust')).toMatchObject({ x: 0, y: 5 });
    expect(comp('tot')).toMatchObject({ x: 180, y: 5 });
  });

  it('selects with a marquee started in the page margin', () => {
    const { controller, container } = setup();
    stubLayout(container);
    const surface = container.querySelector('.ar-surface')!;
    drag(surface, { x: -5, y: 215 }, { x: 300 * SCALE, y: 230 });
    expect(controller.getState().selection).toEqual({ componentIds: ['cust', 'tot'], bandId: 'detail' });
    fireEvent.pointerDown(surface, { button: 0, clientX: -5, clientY: 5 });
    fireEvent.pointerUp(window, { clientX: -5, clientY: 5 });
    expect(controller.getState().selection.componentIds).toEqual([]);
  });

  it('offers extra and registered PDF fonts in the font list', () => {
    const { controller } = setup(salesTemplate(), { fonts: ['Vazirmatn'], preview: { pdf: { fonts: [{ family: 'Lato', data: new Uint8Array() }] } } });
    act(() => controller.select(['cust']));
    const options = Array.from((screen.getByLabelText('Font') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['', 'Helvetica', 'Times', 'Courier', 'Vazirmatn', 'Lato']);
  });

  it('selects with a marquee started in the empty strip below a band', () => {
    const { controller, container } = setup();
    const gap = container.querySelector('[data-band-gap="detail"]')!;
    expect(gap).toBeTruthy();
    drag(gap, { x: 0, y: 0 }, { x: 300 * SCALE, y: 10 * SCALE });
    expect(controller.getState().selection).toEqual({ componentIds: ['cust', 'tot'], bandId: 'detail' });
  });

  it('shows the page margins around the bands', async () => {
    const { container, controller, user } = setup();
    const surface = container.querySelector('.ar-surface') as HTMLElement;
    const m = controller.template.page.margins;
    expect(container.querySelector('.ar-margin-guide')).toBeTruthy();
    expect(surface.style.paddingLeft).toBe(`${m.left * SCALE}px`);
    expect(parseFloat(surface.style.width)).toBeCloseTo(controller.pageSize().width * SCALE, 2);
    await user.click(screen.getByRole('button', { name: 'Margins' }));
    expect(container.querySelector('.ar-margin-guide')).toBeNull();
    expect(parseFloat(surface.style.width)).toBeCloseTo(controller.bodyWidth() * SCALE, 2);
  });

  it('resizes with handles and bands with the bottom edge', () => {
    const { controller, container, component, comp } = setup();
    act(() => controller.select(['tot']));
    drag(component('tot').querySelector('[data-handle="se"]')!, { x: 0, y: 0 }, { x: 10 * SCALE, y: 5 * SCALE });
    expect(comp('tot')).toMatchObject({ width: 110, height: 25 });
    drag(container.querySelector('[data-band-resize="detail"]')!, { x: 0, y: 0 }, { x: 0, y: 15 * SCALE });
    expect(findBand(controller.template, 'detail')!.band.height).toBe(55);
  });

  it('selects bands by clicking and components with a marquee', () => {
    const { controller, band } = setup();
    drag(band('detail'), { x: 150 * SCALE, y: 0 }, { x: 300 * SCALE, y: 10 * SCALE });
    expect(controller.getState().selection).toEqual({ componentIds: ['tot'], bandId: 'detail' });
    fireEvent.pointerDown(band('hdr'), { button: 0 });
    fireEvent.pointerUp(window);
    expect(controller.getState().selection).toEqual({ componentIds: [], bandId: 'hdr' });
  });

  it('adds components and fields by drag and drop', () => {
    const { controller, band, container } = setup();
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Rectangle/ }), { dataTransfer: dt });
    fireEvent.dragOver(band('ftr'), { dataTransfer: dt });
    expect(band('ftr').classList.contains('ar-band-drop')).toBe(true);
    dropAt(band('ftr'), dt, 40 * SCALE, 0);
    const added = findBand(controller.template, 'ftr')!.band.components.at(-1)!;
    expect(added).toMatchObject({ type: 'rectangle', x: 40, y: 0 });

    const fieldDt = dataTransfer();
    const field = within(container.querySelector('.ar-tree')! as HTMLElement).getByText('customer').parentElement!;
    fireEvent.dragStart(field, { dataTransfer: fieldDt });
    dropAt(band('detail'), fieldDt, 120 * SCALE, 0);
    expect(findBand(controller.template, 'detail')!.band.components.at(-1)).toMatchObject({ type: 'text', text: '{{ row.customer }}', x: 120 });
  });

  it('adds components to the selected band by clicking the toolbox', async () => {
    const { controller, user } = setup();
    act(() => controller.selectBand('rh'));
    await user.click(screen.getByRole('button', { name: /Text/ }));
    const rh = findBand(controller.template, 'rh')!.band.components;
    expect(rh).toHaveLength(2);
    expect(controller.getState().selection.componentIds).toEqual([rh[1]!.id]);
  });

  it('handles keyboard shortcuts on the surface but not in inputs', () => {
    const { controller, container, comp } = setup();
    act(() => controller.select(['cust']));
    const surface = container.querySelector('.ar-surface-scroll')!;
    fireEvent.keyDown(surface, { key: 'ArrowRight', shiftKey: true });
    expect(comp('cust')!.x).toBe(1);
    fireEvent.keyDown(surface, { key: 'Delete' });
    expect(comp('cust')).toBeUndefined();
    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    expect(comp('cust')).toBeDefined();
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Delete' });
    expect(comp('cust')).toBeDefined();
  });

  it('previews allowHtml text as styled spans and toggles it in the properties', async () => {
    const { controller, component, user } = setup();
    act(() => controller.updateComponent('cust', { text: 'a <b>bold</b> <script>x</script>' } as never));
    expect(component('cust').querySelector('b, script')).toBeNull();
    act(() => controller.select(['cust']));
    await user.click(screen.getByLabelText('Allow HTML tags'));
    expect(findComponent(controller.template, 'cust')!.component).toMatchObject({ allowHtml: true });
    const spans = Array.from(component('cust').querySelector('.ar-component-body')!.children) as HTMLElement[];
    expect(spans.map((s) => s.textContent)).toEqual(['a ', 'bold', ' x']);
    expect(spans[1]!.style.fontWeight).toBe('bold');
    expect(component('cust').querySelector('script')).toBeNull();
  });

  it('translates the UI with uiLocale="fa"', () => {
    const { container } = setup(salesTemplate(), { uiLocale: 'fa' });
    expect(container.querySelector('.ar-root')!.getAttribute('dir')).toBe('rtl');
    const captions = Array.from(container.querySelectorAll('.ar-section-caption')).map((c) => c.firstElementChild!.textContent);
    expect(captions).toEqual(['سرصفحهٔ گزارش', 'سرستون: orders', 'جزئیات: orders', 'پاستون: orders']);
    expect(screen.getByRole('button', { name: 'واگرد' })).toBeTruthy();
    // Option values are translated, the stored value stays the same.
    const orientation = screen.getByLabelText('جهت') as HTMLSelectElement;
    expect(Array.from(orientation.options).map((o) => [o.value, o.text])).toEqual([
      ['portrait', 'عمودی'],
      ['landscape', 'افقی'],
    ]);
  });

  it('removes bands from their caption', async () => {
    const { controller, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Remove band: Footer: orders' }));
    expect(findBand(controller.template, 'ftr')).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Remove band: Detail: orders' })).toBeNull();
  });
});

describe('ReportDesigner: toolbar', () => {
  it('undoes and redoes', async () => {
    const { controller, user, comp } = setup();
    act(() => controller.updateComponent('cust', { x: 50 }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(comp('cust')!.x).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(comp('cust')!.x).toBe(50);
  });

  it('aligns the content of the selected texts, reorders and deletes', async () => {
    const { controller, user, comp } = setup();
    expect((screen.getByRole('button', { name: 'Align left' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => controller.select(['cust', 'tot']));
    // Default alignment is left/top.
    expect(screen.getByRole('button', { name: 'Align left' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Align right' }));
    expect(comp('cust')).toMatchObject({ x: 0, style: { textAlign: 'right' } });
    expect(comp('tot')).toMatchObject({ x: 180, style: { textAlign: 'right' } });
    expect(screen.getByRole('button', { name: 'Align right' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Align bottom' }));
    expect(comp('cust')!.style).toMatchObject({ textAlign: 'right', verticalAlign: 'bottom' });
    await user.click(screen.getByRole('button', { name: 'Justify' }));
    expect(comp('tot')!.style).toMatchObject({ textAlign: 'justify' });
    await user.click(screen.getByRole('button', { name: 'Send to back' }));
    await user.click(screen.getByRole('button', { name: 'Delete', exact: true } as never));
    expect(comp('cust')).toBeUndefined();
  });

  it('toggles grid and snapping', async () => {
    const { controller, user, band } = setup();
    expect(band('detail').classList.contains('ar-band-grid')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(band('detail').classList.contains('ar-band-grid')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Snap' }));
    expect(controller.getState().settings).toMatchObject({ snapToGrid: true, snapToObjects: true });
  });

  it('zooms the design surface', async () => {
    const { user, component } = setup();
    await user.selectOptions(screen.getByLabelText('Zoom'), '2');
    expect(component('cust').style.width).toBe(`${Number((100 * SCALE * 2).toFixed(3))}px`);
  });

  it('saves through onSave and marks the template as saved', async () => {
    const onSave = vi.fn();
    const { controller, user } = setup(salesTemplate(), { onSave });
    act(() => controller.updateComponent('cust', { x: 1 }));
    expect(screen.getByRole('button', { name: 'Save •' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save •' }));
    expect(onSave).toHaveBeenCalledWith(controller.template, controller.toJSON());
    expect(controller.getState().dirty).toBe(false);
  });

  it('shows save errors', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('server down');
    });
    const { user } = setup(salesTemplate(), { onSave });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('server down');
  });

  it('opens JSON files and reports invalid ones', async () => {
    const { controller, user, container } = setup();
    const input = container.querySelector('[data-testid="ar-open-file"]') as HTMLInputElement;
    const other = { ...salesTemplate(), name: 'Opened' };
    await user.upload(input, new File([JSON.stringify(other)], 'r.json', { type: 'application/json' }));
    await vi.waitFor(() => expect(controller.template.name).toBe('Opened'));
    await user.upload(input, new File(['{"bad":true}'], 'bad.json', { type: 'application/json' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid report template/);
  });

  it('asks before discarding unsaved changes on New', async () => {
    const { controller, user } = setup();
    act(() => controller.updateComponent('cust', { x: 1 }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(controller.template.name).toBe('Sales');
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(controller.template.name).toBe('Untitled report');
  });

  it('previews the report with the sample data', async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(container.querySelector('.ar-page')).toBeTruthy();
    expect(Array.from(container.querySelectorAll('.ar-text')).map((e) => e.textContent)).toContain('Contoso');
    expect(screen.getByRole('complementary', { name: 'Issues' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    expect(container.querySelector('.ar-surface')).toBeTruthy();
  });

  it('calls onChange after edits but not on mount', () => {
    const onChange = vi.fn();
    const { controller } = setup(salesTemplate(), { onChange });
    expect(onChange).not.toHaveBeenCalled();
    act(() => controller.updateComponent('cust', { x: 3 }));
    expect(onChange).toHaveBeenCalledWith(controller.template);
  });
});

describe('ReportDesigner: properties', () => {
  it('shows report settings when nothing is selected and edits them', async () => {
    const { controller, user } = setup();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Quarterly{Enter}');
    expect(controller.template.name).toBe('Quarterly');
    await user.selectOptions(screen.getByLabelText('Orientation'), 'landscape');
    expect(controller.template.page.orientation).toBe('landscape');
    await user.selectOptions(screen.getByLabelText('Unit'), 'mm');
    expect(controller.template.unit).toBe('mm');
    await user.click(screen.getByLabelText('Page footer'));
    expect(controller.template.pageFooter).toBeDefined();
    // The new band is selected, so its properties are shown.
    expect(screen.getByText(/^Band \(/)).toBeTruthy();
  });

  it('edits component geometry, text, format and style', async () => {
    const { controller, user, comp } = setup();
    act(() => controller.select(['tot']));
    const x = screen.getByLabelText('x (pt)');
    await user.clear(x);
    await user.type(x, '150{Enter}');
    expect(comp('tot')!.x).toBe(150);
    await user.click(screen.getByLabelText('Stretch to band height'));
    expect(comp('tot')!.growToHeight).toBe(true);
    await user.click(screen.getByLabelText('Stretch to band height'));
    expect(comp('tot')!.growToHeight).toBeUndefined();
    const text = screen.getByLabelText('Text') as HTMLTextAreaElement;
    await user.clear(text);
    await user.type(text, 'Total: {{{{ row.total ');
    expect(screen.getByRole('alert').textContent).toMatch(/unterminated/);
    expect(text.getAttribute('aria-invalid')).toBe('true');
    await user.type(text, '}}');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(text);
    expect((comp('tot') as any).text).toBe('Total: {{ row.total }}');
    await user.selectOptions(screen.getByLabelText('Format'), 'currency');
    expect((comp('tot') as any).format).toEqual({ type: 'currency', currency: 'USD' });
    await user.selectOptions(screen.getByLabelText('Weight'), 'bold');
    expect(comp('tot')!.style).toEqual({ fontWeight: 'bold' });
    await user.click(screen.getByLabelText('Border'));
    expect(comp('tot')!.style!.border).toEqual({ width: 0.5, color: '#000000', style: 'solid' });
    await user.click(screen.getByLabelText('top'));
    expect(comp('tot')!.style!.border!.sides).toEqual(['right', 'bottom', 'left']);
  });

  it('validates expressions in behavior fields', async () => {
    const { controller, user, comp } = setup();
    act(() => controller.select(['cust']));
    const visible = screen.getByLabelText('Visible if');
    await user.type(visible, 'row.total >');
    expect(screen.getByRole('alert').textContent).toMatch(/Unexpected end/);
    await user.type(visible, ' 5{Enter}');
    expect(comp('cust')!.visible).toBe('row.total > 5');
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(comp('cust')!.conditions).toEqual([{ expression: 'true', style: { color: '#b91c1c' } }]);
  });

  it('saves inline styles as named styles', async () => {
    const { controller, user, comp } = setup();
    act(() => controller.select(['cust']));
    act(() => controller.updateComponentStyle({ fontWeight: 'bold' }));
    await user.type(screen.getByLabelText('New style name'), 'strong');
    await user.click(screen.getByRole('button', { name: 'Save as style' }));
    expect(controller.template.styles!.strong).toEqual({ fontWeight: 'bold' });
    expect(comp('cust')).toMatchObject({ styleName: 'strong' });
    expect(comp('cust')!.style).toBeUndefined();
  });

  it('edits band, region and group properties', async () => {
    const { controller, user } = setup();
    act(() => controller.selectBand('detail'));
    await user.click(screen.getByLabelText('Shrink to content'));
    expect(findBand(controller.template, 'detail')!.band.canShrink).toBe(true);
    await user.click(screen.getByLabelText('Repeat header on each page'));
    expect((controller.template.body[0] as any).repeatHeaderOnEachPage).toBe(true);
    const filter = screen.getByLabelText('Filter');
    await user.type(filter, 'row.total > 1{Enter}');
    expect((controller.template.body[0] as any).filter).toBe('row.total > 1');
    await user.click(screen.getByRole('button', { name: 'Add sort' }));
    expect((controller.template.body[0] as any).sort).toEqual([{ expression: 'row.id', direction: 'asc' }]);
    const group = screen.getByLabelText('Group expression');
    await user.clear(group);
    await user.type(group, 'row.customer');
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    const groups = (controller.template.body[0] as any).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].expression).toBe('row.customer');
    expect(screen.getByText(/^Group \(/)).toBeTruthy();
    await user.click(screen.getByLabelText('Group footer'));
    expect((controller.template.body[0] as any).groups[0].footer).toBeDefined();
  });

  it('lists template errors', () => {
    const controller = new DesignerController({ template: salesTemplate() });
    render(<ReportDesigner controller={controller} />);
    act(() => controller.updateComponent('cust', { visible: 'x >' } as never));
    expect(screen.getByText(/Template errors \(1\)/)).toBeTruthy();
  });
});

describe('ReportDesigner: data panel', () => {
  it('adds data sources and detects their fields from sample data', async () => {
    const { controller, user } = setup();
    act(() => controller.setSampleData({ ...salesData, notes: [{ text: 'hi', at: '2026-01-01' }] }));
    await user.type(screen.getByLabelText('New data source name'), 'notes');
    await user.click(screen.getByRole('button', { name: 'Add data source' }));
    expect(controller.template.dataSources[1]).toEqual({ name: 'notes', fields: [{ name: 'text', type: 'string' }, { name: 'at', type: 'date' }] });
    await user.type(screen.getByLabelText('New data source name'), 'notes');
    await user.click(screen.getByRole('button', { name: 'Add data source' }));
    expect(screen.getByRole('alert').textContent).toMatch(/already exists/);
  });

  it('inserts a field into the selected band with Enter', async () => {
    const { controller, user, container } = setup();
    act(() => controller.selectBand('detail'));
    const item = within(container.querySelector('.ar-tree')! as HTMLElement).getByText('total').parentElement!;
    item.focus();
    await user.keyboard('{Enter}');
    expect(findBand(controller.template, 'detail')!.band.components.at(-1)).toMatchObject({ text: '{{ row.total }}' });
  });

  it('adds parameters', async () => {
    const { controller, user } = setup();
    await user.type(screen.getByLabelText('New parameter name'), 'year');
    await user.click(screen.getByRole('button', { name: 'Add parameter' }));
    expect(controller.template.parameters!.map((p) => p.name)).toEqual(['title', 'year']);
  });
});

describe('useDesigner', () => {
  it('exposes a controller and live state', () => {
    let api: ReturnType<typeof useDesigner> | undefined;
    function Probe() {
      api = useDesigner({ template: salesTemplate() });
      return <span>{api.state.canUndo ? 'dirty' : 'clean'}</span>;
    }
    const { container } = render(<Probe />);
    expect(container.textContent).toBe('clean');
    act(() => api!.controller.updateComponent('cust', { x: 1 }));
    expect(container.textContent).toBe('dirty');
  });

  it('creates its own controller from props', () => {
    const { container } = render(<ReportDesigner template={salesTemplate()} />);
    expect(container.querySelector('[data-component-id="cust"]')).toBeTruthy();
  });
});
