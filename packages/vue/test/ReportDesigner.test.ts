import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { DesignerController, designScale, findBand, findComponent, type ReportTemplate } from '@ariana-report/core';
import { ReportDesigner, useDesigner } from '../src';
import { salesData, salesTemplate } from './fixtures';

const SCALE = designScale('pt');
/** What `wrapper.get()` returns. */
type El = Omit<DOMWrapper<Element>, 'exists'>;
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.restoreAllMocks();
});

function setup(template: ReportTemplate = salesTemplate(), props: Record<string, unknown> = {}) {
  const controller = new DesignerController({ template, sampleData: salesData, settings: { snapToGrid: false, snapToObjects: false } });
  const w = mount(ReportDesigner, { props: { controller, ...props }, attachTo: document.body });
  wrappers.push(w);
  return {
    w,
    controller,
    band: (id: string) => w.get(`[data-band-id="${id}"]`),
    component: (id: string) => w.get(`[data-component-id="${id}"]`),
    comp: (id: string) => findComponent(controller.template, id)?.component,
  };
}

/** Finds a form control by its accessible label text (label[for] or aria-label). */
function byLabel(w: VueWrapper, text: string): El {
  const label = w.findAll('label').find((l) => l.text() === text && l.attributes('for'));
  if (label) return w.get(`[id="${label.attributes('for')}"]`);
  return w.get(`[aria-label="${text}"]`);
}

const buttonNamed = (w: VueWrapper, name: string) => {
  const b = w.findAll('button').find((x) => x.attributes('aria-label') === name || x.text() === name);
  if (!b) throw new Error(`No button "${name}"`);
  return b;
};

const toolboxItem = (w: VueWrapper, name: string) => w.findAll('.ar-toolbox-item').find((b) => b.text().endsWith(name))!;

/** test-utils cannot set clientX/shiftKey on pointer events, so dispatch real ones. */
async function pointerDown(target: El, init: PointerEventInit = {}) {
  target.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...init }));
  await nextTick();
}

async function drag(target: El, from: { x: number; y: number }, to: { x: number; y: number }, init: PointerEventInit = {}) {
  await pointerDown(target, { clientX: from.x, clientY: from.y, ...init });
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: to.x, clientY: to.y, ...init }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: to.x, clientY: to.y, ...init }));
  await nextTick();
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

/** jsdom has no DragEvent: dispatch plain events carrying a dataTransfer and coordinates. */
async function dnd(el: Element, type: string, dt: DataTransfer, clientX = 0, clientY = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: dt, clientX, clientY });
  el.dispatchEvent(event);
  await nextTick();
}

describe('ReportDesigner (Vue): surface', () => {
  it('renders bands with captions and components', () => {
    const { w, component } = setup();
    expect(w.findAll('.ar-section-caption').map((c) => c.find('span').text())).toEqual(['Report header', 'Header: orders', 'Detail: orders', 'Footer: orders']);
    expect(component('cust').text()).toBe('{{ row.customer }}');
    expect((component('cust').element as HTMLElement).style.width).toBe(`${Number((100 * SCALE).toFixed(3))}px`);
  });

  it('selects on click and toggles with shift', async () => {
    const { controller, component } = setup();
    await pointerDown(component('cust'));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await nextTick();
    expect(controller.getState().selection.componentIds).toEqual(['cust']);
    expect(component('cust').attributes('aria-selected')).toBe('true');
    expect(component('cust').findAll('.ar-handle')).toHaveLength(8);
    await pointerDown(component('tot'), { shiftKey: true });
    expect(controller.getState().selection.componentIds).toEqual(['cust', 'tot']);
    expect(component('cust').findAll('.ar-handle')).toHaveLength(0);
  });

  it('moves by dragging as one undo step', async () => {
    const { controller, component, comp } = setup();
    await drag(component('cust'), { x: 0, y: 0 }, { x: 20 * SCALE, y: 8 * SCALE });
    expect(comp('cust')).toMatchObject({ x: 20, y: 8 });
    controller.undo();
    expect(comp('cust')).toMatchObject({ x: 0, y: 0 });
  });

  it('moves a component into another band', async () => {
    const { controller, component, band, comp } = setup();
    const footer = band('ftr').element as HTMLElement;
    footer.getBoundingClientRect = () => ({ left: 0, top: 500, right: 400, bottom: 530, width: 400, height: 30, x: 0, y: 500, toJSON: () => ({}) });
    document.elementFromPoint = vi.fn(() => footer);
    await drag(component('cust'), { x: 0, y: 0 }, { x: 10 * SCALE, y: 500 + 2 * SCALE });
    expect(findComponent(controller.template, 'cust')!.band.band.id).toBe('ftr');
    expect(comp('cust')).toMatchObject({ x: 10, y: 2 });
    // @ts-expect-error remove the jsdom stub
    delete document.elementFromPoint;
  });

  it('resizes components and bands', async () => {
    const { controller, w, component, comp } = setup();
    controller.select(['tot']);
    await nextTick();
    await drag(component('tot').get('[data-handle="se"]'), { x: 0, y: 0 }, { x: 10 * SCALE, y: 5 * SCALE });
    expect(comp('tot')).toMatchObject({ width: 110, height: 25 });
    await drag(w.get('[data-band-resize="detail"]'), { x: 0, y: 0 }, { x: 0, y: 15 * SCALE });
    expect(findBand(controller.template, 'detail')!.band.height).toBe(55);
  });

  it('selects bands and marquee-selects components', async () => {
    const { controller, band } = setup();
    await drag(band('detail'), { x: 150 * SCALE, y: 0 }, { x: 300 * SCALE, y: 10 * SCALE });
    expect(controller.getState().selection).toEqual({ componentIds: ['tot'], bandId: 'detail' });
    await pointerDown(band('hdr'));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(controller.getState().selection).toEqual({ componentIds: [], bandId: 'hdr' });
  });

  it('adds components and fields by drag and drop', async () => {
    const { controller, w, band } = setup();
    const dt = dataTransfer();
    await dnd(toolboxItem(w, 'Rectangle').element, 'dragstart', dt);
    await dnd(band('ftr').element, 'dragover', dt);
    expect(band('ftr').classes()).toContain('ar-band-drop');
    await dnd(band('ftr').element, 'drop', dt, 40 * SCALE, 0);
    expect(findBand(controller.template, 'ftr')!.band.components.at(-1)).toMatchObject({ type: 'rectangle', x: 40, y: 0 });

    const fdt = dataTransfer();
    const item = w.findAll('.ar-tree-item').find((x) => x.find('span').text() === 'customer')!;
    await dnd(item.element, 'dragstart', fdt);
    await dnd(band('detail').element, 'drop', fdt, 120 * SCALE, 0);
    expect(findBand(controller.template, 'detail')!.band.components.at(-1)).toMatchObject({ text: '{{ row.customer }}', x: 120 });
  });

  it('adds to the selected band by clicking the toolbox', async () => {
    const { controller, w } = setup();
    controller.selectBand('rh');
    await toolboxItem(w, 'Text').trigger('click');
    expect(findBand(controller.template, 'rh')!.band.components).toHaveLength(2);
  });

  it('handles keyboard shortcuts on the surface but not in inputs', async () => {
    const { controller, w, comp } = setup();
    controller.select(['cust']);
    await nextTick();
    const surface = w.get('.ar-surface-scroll');
    await surface.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    expect(comp('cust')!.x).toBe(1);
    await surface.trigger('keydown', { key: 'Delete' });
    expect(comp('cust')).toBeUndefined();
    await surface.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(comp('cust')).toBeDefined();
    await byLabel(w, 'Name').trigger('keydown', { key: 'Delete' });
    expect(comp('cust')).toBeDefined();
  });

  it('removes bands from their caption', async () => {
    const { controller, w } = setup();
    await buttonNamed(w, 'Remove band: Footer: orders').trigger('click');
    expect(findBand(controller.template, 'ftr')).toBeUndefined();
    expect(w.findAll('button').some((b) => b.attributes('aria-label') === 'Remove band: Detail: orders')).toBe(false);
  });
});

describe('ReportDesigner (Vue): toolbar', () => {
  it('undoes, redoes, aligns and deletes', async () => {
    const { controller, w, comp } = setup();
    controller.updateComponent('cust', { x: 50 });
    await nextTick();
    await buttonNamed(w, 'Undo').trigger('click');
    expect(comp('cust')!.x).toBe(0);
    await buttonNamed(w, 'Redo').trigger('click');
    expect(comp('cust')!.x).toBe(50);
    controller.select(['cust', 'tot']);
    await nextTick();
    await buttonNamed(w, 'Align right').trigger('click');
    expect(comp('cust')!.x).toBe(180);
    await buttonNamed(w, 'Delete').trigger('click');
    expect(comp('cust')).toBeUndefined();
  });

  it('toggles grid and snap, and zooms', async () => {
    const { controller, w, band, component } = setup();
    await buttonNamed(w, 'Grid').trigger('click');
    expect(band('detail').classes()).not.toContain('ar-band-grid');
    await buttonNamed(w, 'Snap').trigger('click');
    expect(controller.getState().settings).toMatchObject({ snapToGrid: true, snapToObjects: true });
    await w.get('select[aria-label="Zoom"]').setValue('2');
    expect((component('cust').element as HTMLElement).style.width).toBe(`${Number((100 * SCALE * 2).toFixed(3))}px`);
  });

  it('saves through onSave and reports failures', async () => {
    const onSave = vi.fn();
    const { controller, w } = setup(salesTemplate(), { onSave });
    controller.updateComponent('cust', { x: 1 });
    await nextTick();
    await buttonNamed(w, 'Save •').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith(controller.template, controller.toJSON());
    expect(controller.getState().dirty).toBe(false);

    const failing = setup(salesTemplate(), { onSave: async () => Promise.reject(new Error('server down')) });
    await buttonNamed(failing.w, 'Save').trigger('click');
    await flushPromises();
    expect(failing.w.get('[role="alert"]').text()).toBe('server down');
  });

  it('opens JSON files and reports invalid ones', async () => {
    const { controller, w } = setup();
    const input = w.get('[data-testid="ar-open-file"]');
    const setFile = (file: File) => Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    setFile(new File([JSON.stringify({ ...salesTemplate(), name: 'Opened' })], 'r.json'));
    await input.trigger('change');
    await vi.waitFor(() => expect(controller.template.name).toBe('Opened'));
    setFile(new File(['{"bad":true}'], 'bad.json'));
    await input.trigger('change');
    await vi.waitFor(() => expect(w.get('[role="alert"]').text()).toMatch(/not a valid report template/));
  });

  it('asks before discarding changes on New', async () => {
    const { controller, w } = setup();
    controller.updateComponent('cust', { x: 1 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await buttonNamed(w, 'New').trigger('click');
    expect(controller.template.name).toBe('Sales');
    confirm.mockReturnValue(true);
    await buttonNamed(w, 'New').trigger('click');
    expect(controller.template.name).toBe('Untitled report');
  });

  it('previews with sample data', async () => {
    const { w } = setup();
    await w.findAll('[role="tab"]').find((t) => t.text() === 'Preview')!.trigger('click');
    await nextTick();
    expect(w.find('.ar-page').exists()).toBe(true);
    expect(w.findAll('.ar-text').map((e) => e.text())).toContain('Contoso');
    await w.findAll('[role="tab"]').find((t) => t.text() === 'Design')!.trigger('click');
    expect(w.find('.ar-surface').exists()).toBe(true);
  });

  it('emits change after edits only', async () => {
    const { controller, w } = setup();
    expect(w.emitted('change')).toBeUndefined();
    controller.updateComponent('cust', { x: 3 });
    await nextTick();
    expect(w.emitted('change')![0]![0]).toBe(controller.template);
  });
});

describe('ReportDesigner (Vue): properties', () => {
  it('edits report settings when nothing is selected', async () => {
    const { controller, w } = setup();
    const name = byLabel(w, 'Name');
    await name.setValue('Quarterly');
    await name.trigger('keydown', { key: 'Enter' });
    expect(controller.template.name).toBe('Quarterly');
    await byLabel(w, 'Orientation').setValue('landscape');
    expect(controller.template.page.orientation).toBe('landscape');
    await byLabel(w, 'Unit').setValue('mm');
    expect(controller.template.unit).toBe('mm');
    await byLabel(w, 'Page footer').setValue(true);
    expect(controller.template.pageFooter).toBeDefined();
  });

  it('edits component geometry, text, format and style', async () => {
    const { controller, w, comp } = setup();
    controller.select(['tot']);
    await nextTick();
    const x = byLabel(w, 'x (pt)');
    await x.setValue('150');
    await x.trigger('keydown', { key: 'Enter' });
    expect(comp('tot')!.x).toBe(150);
    const text = byLabel(w, 'Text');
    await text.setValue('Total: {{ row.total');
    expect(w.get('[role="alert"]').text()).toMatch(/unterminated/);
    expect(text.attributes('aria-invalid')).toBe('true');
    await text.setValue('Total: {{ row.total }}');
    expect(w.find('[role="alert"]').exists()).toBe(false);
    await text.trigger('blur');
    expect((comp('tot') as any).text).toBe('Total: {{ row.total }}');
    await byLabel(w, 'Format').setValue('currency');
    expect((comp('tot') as any).format).toEqual({ type: 'currency', currency: 'USD' });
    await byLabel(w, 'Weight').setValue('bold');
    expect(comp('tot')!.style).toEqual({ fontWeight: 'bold' });
    await byLabel(w, 'Border').setValue(true);
    expect(comp('tot')!.style!.border).toEqual({ width: 0.5, color: '#000000', style: 'solid' });
    await byLabel(w, 'top').setValue(false);
    expect(comp('tot')!.style!.border!.sides).toEqual(['right', 'bottom', 'left']);
  });

  it('validates behavior expressions and adds conditions', async () => {
    const { controller, w, comp } = setup();
    controller.select(['cust']);
    await nextTick();
    const visible = byLabel(w, 'Visible if');
    await visible.setValue('row.total >');
    expect(w.get('[role="alert"]').text()).toMatch(/Unexpected end/);
    await visible.setValue('row.total > 5');
    await visible.trigger('keydown', { key: 'Enter' });
    expect(comp('cust')!.visible).toBe('row.total > 5');
    await buttonNamed(w, 'Add condition').trigger('click');
    expect(comp('cust')!.conditions).toEqual([{ expression: 'true', style: { color: '#b91c1c' } }]);
  });

  it('saves inline styles as named styles', async () => {
    const { controller, w, comp } = setup();
    controller.select(['cust']);
    controller.updateComponentStyle({ fontWeight: 'bold' });
    await nextTick();
    await byLabel(w, 'New style name').setValue('strong');
    await buttonNamed(w, 'Save as style').element.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(controller.template.styles!.strong).toEqual({ fontWeight: 'bold' });
    expect(comp('cust')).toMatchObject({ styleName: 'strong' });
  });

  it('edits band, region and group properties', async () => {
    const { controller, w } = setup();
    controller.selectBand('detail');
    await nextTick();
    await byLabel(w, 'Shrink to content').setValue(true);
    expect(findBand(controller.template, 'detail')!.band.canShrink).toBe(true);
    await byLabel(w, 'Repeat header on each page').setValue(true);
    expect((controller.template.body[0] as any).repeatHeaderOnEachPage).toBe(true);
    const filter = byLabel(w, 'Filter');
    await filter.setValue('row.total > 1');
    await filter.trigger('keydown', { key: 'Enter' });
    expect((controller.template.body[0] as any).filter).toBe('row.total > 1');
    await buttonNamed(w, 'Add sort').trigger('click');
    expect((controller.template.body[0] as any).sort).toEqual([{ expression: 'row.id', direction: 'asc' }]);
    await byLabel(w, 'Group expression').setValue('row.customer');
    await buttonNamed(w, 'Add group').element.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();
    expect((controller.template.body[0] as any).groups[0].expression).toBe('row.customer');
    expect(w.text()).toMatch(/Group \(/);
    await byLabel(w, 'Group footer').setValue(true);
    expect((controller.template.body[0] as any).groups[0].footer).toBeDefined();
  });

  it('lists template errors', async () => {
    const { controller, w } = setup();
    controller.updateComponent('cust', { visible: 'x >' } as never);
    await nextTick();
    expect(w.text()).toMatch(/Template errors \(1\)/);
  });
});

describe('ReportDesigner (Vue): data panel', () => {
  it('adds data sources with detected fields', async () => {
    const { controller, w } = setup();
    controller.setSampleData({ ...salesData, notes: [{ text: 'hi', at: '2026-01-01' }] });
    await byLabel(w, 'New data source name').setValue('notes');
    await buttonNamed(w, 'Add data source').element.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(controller.template.dataSources[1]).toEqual({ name: 'notes', fields: [{ name: 'text', type: 'string' }, { name: 'at', type: 'date' }] });
    await nextTick();
    await byLabel(w, 'New data source name').setValue('notes');
    await buttonNamed(w, 'Add data source').element.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();
    expect(w.get('[role="alert"]').text()).toMatch(/already exists/);
  });

  it('inserts a field into the selected band with Enter', async () => {
    const { controller, w } = setup();
    controller.selectBand('detail');
    await nextTick();
    const item = w.findAll('.ar-tree-item').find((x) => x.find('span').text() === 'total')!;
    await item.trigger('keydown', { key: 'Enter' });
    expect(findBand(controller.template, 'detail')!.band.components.at(-1)).toMatchObject({ text: '{{ row.total }}' });
  });

  it('adds parameters', async () => {
    const { controller, w } = setup();
    await byLabel(w, 'New parameter name').setValue('year');
    await buttonNamed(w, 'Add parameter').element.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(controller.template.parameters!.map((p) => p.name)).toEqual(['title', 'year']);
  });
});

describe('useDesigner (Vue)', () => {
  it('gives a controller and reactive state', async () => {
    let api: ReturnType<typeof useDesigner> | undefined;
    const Probe = defineComponent({
      setup() {
        api = useDesigner({ template: salesTemplate() });
        return () => h('span', api!.state.value.canUndo ? 'dirty' : 'clean');
      },
    });
    const w = mount(Probe);
    wrappers.push(w);
    expect(w.text()).toBe('clean');
    api!.controller.updateComponent('cust', { x: 1 });
    await nextTick();
    expect(w.text()).toBe('dirty');
  });

  it('creates its own controller from props', () => {
    const w = mount(ReportDesigner, { props: { template: salesTemplate() } });
    wrappers.push(w);
    expect(w.find('[data-component-id="cust"]').exists()).toBe(true);
  });
});
