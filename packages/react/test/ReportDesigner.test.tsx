import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerController, designScale, findBand, findComponent, type ReportTemplate } from '@ariana-report/core';
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
    expect(component('cust').querySelectorAll('.ar-handle')).toHaveLength(0);
  });

  it('moves components by dragging as a single undo step', () => {
    const { controller, component, comp } = setup();
    drag(component('cust'), { x: 0, y: 0 }, { x: 20 * SCALE, y: 8 * SCALE });
    expect(comp('cust')).toMatchObject({ x: 20, y: 8 });
    expect(controller.getState().interacting).toBe(false);
    act(() => controller.undo());
    expect(comp('cust')).toMatchObject({ x: 0, y: 0 });
  });

  it('moves a component to another band when dropped over it', () => {
    const { controller, component, band, comp } = setup();
    const footer = band('ftr');
    footer.getBoundingClientRect = () => ({ left: 0, top: 500, right: 400, bottom: 530, width: 400, height: 30, x: 0, y: 500, toJSON: () => ({}) });
    document.elementFromPoint = vi.fn(() => footer);
    drag(component('cust'), { x: 0, y: 0 }, { x: 10 * SCALE, y: 500 + 2 * SCALE });
    expect(findComponent(controller.template, 'cust')!.band.band.id).toBe('ftr');
    expect(comp('cust')).toMatchObject({ x: 10, y: 2 });
    // @ts-expect-error cleanup of the jsdom stub
    delete document.elementFromPoint;
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

  it('aligns, reorders and deletes the selection', async () => {
    const { controller, user, comp } = setup();
    expect((screen.getByRole('button', { name: 'Align left' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => controller.select(['cust', 'tot']));
    await user.click(screen.getByRole('button', { name: 'Align right' }));
    expect(comp('cust')!.x).toBe(180);
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
