import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, toRaw } from 'vue';
import { generateReport, STYLE_ELEMENT_ID, ViewerController } from '@ariana-report/core';
import { ArianaReport, ReportViewer, useViewer } from '../src';
import { salesData, salesTemplate } from './fixtures';

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
});

function mountViewer(props: Record<string, unknown> = {}) {
  const w = mount(ReportViewer, { props: { template: salesTemplate(), data: salesData, ...props }, attachTo: document.body });
  wrappers.push(w);
  return w;
}

const texts = (w: VueWrapper) => w.findAll('.ar-text').map((e) => e.text());
const button = (w: VueWrapper, name: string) => w.get(`button[aria-label="${name}"]`);
const pageInput = (w: VueWrapper) => w.get('input[aria-label="Page number"]').element as HTMLInputElement;

describe('ReportViewer (Vue)', () => {
  it('generates, shows the first page and emits generated', async () => {
    const w = mountViewer();
    await nextTick();
    const generated = w.emitted('generated')!;
    expect(generated).toHaveLength(1);
    const pages = (generated[0]![0] as { pages: unknown[] }).pages.length;
    expect(w.text()).toContain(`of ${pages}`);
    expect(texts(w)).toEqual(['Sales report', 'Customer', 'Contoso', '10.00', 'Fabrikam', '20.50', 'Northwind', '5.00']);
    expect(w.findAll('.ar-page')).toHaveLength(1);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeTruthy();
  });

  it('navigates with the toolbar and the page input', async () => {
    const w = mountViewer();
    await nextTick();
    expect((button(w, 'First page').element as HTMLButtonElement).disabled).toBe(true);
    await button(w, 'Next page').trigger('click');
    expect(pageInput(w).value).toBe('2');
    expect(texts(w)).toContain('Tailspin');
    await button(w, 'Last page').trigger('click');
    expect((button(w, 'Next page').element as HTMLButtonElement).disabled).toBe(true);
    const input = w.get('input[aria-label="Page number"]');
    await input.setValue('1');
    await input.trigger('keydown', { key: 'Enter' });
    expect(texts(w)[0]).toBe('Sales report');
    await input.setValue('abc');
    await input.trigger('blur');
    expect(pageInput(w).value).toBe('1');
  });

  it('navigates with keyboard keys on the page area', async () => {
    const w = mountViewer();
    const scroller = w.get('.ar-viewer-scroll');
    await scroller.trigger('keydown', { key: 'PageDown' });
    expect(pageInput(w).value).toBe('2');
    await scroller.trigger('keydown', { key: 'End' });
    await scroller.trigger('keydown', { key: 'Home' });
    expect(pageInput(w).value).toBe('1');
  });

  it('zooms with the buttons and select', async () => {
    const w = mountViewer();
    await nextTick();
    const width = () => parseFloat((w.get('.ar-page').element as HTMLElement).style.width);
    const w1 = width();
    await button(w, 'Zoom in').trigger('click');
    await nextTick();
    expect(width()).toBeCloseTo(w1 * 1.25, 2);
    await w.get('select[aria-label="Zoom"]').setValue('2');
    await nextTick();
    expect(width()).toBeCloseTo(w1 * 2, 2);
    await w.get('select[aria-label="Zoom"]').setValue('fitPage');
    expect((w.get('select[aria-label="Zoom"]').element as HTMLSelectElement).value).toBe('fitPage');
  });

  it('shows errors for invalid templates and emits error', async () => {
    const w = mountViewer({ template: { ...salesTemplate(), unit: 'furlong' } });
    expect(w.get('[role="alert"]').text()).toMatch(/could not be generated[\s\S]*unit/);
    expect(w.emitted('error')).toHaveLength(1);
  });

  it('regenerates when props change', async () => {
    const w = mountViewer({ params: { title: 'A' } });
    await nextTick();
    expect(texts(w)[0]).toBe('A');
    await w.setProps({ data: { orders: [] }, params: { title: 'B' } });
    await nextTick();
    expect(texts(w)).toEqual(['B', 'Customer', '0']);
  });

  it('shows a prebuilt document', async () => {
    const doc = generateReport(salesTemplate(), salesData, { params: { title: 'Prebuilt' } });
    const w = mountViewer({ template: undefined, document: doc });
    await nextTick();
    expect(texts(w)[0]).toBe('Prebuilt');
  });

  it('lists issues', async () => {
    const t = salesTemplate();
    (t.body[0] as any).detail.components[0].text = '{{ row.missing.x }}';
    const w = mountViewer({ template: t });
    await w.get('button[aria-pressed]').trigger('click');
    const panel = w.get('aside[aria-label="Issues"]');
    expect(panel.text()).toMatch(/Cannot read property "x"/);
    expect(panel.get('code').text()).toBe('row.missing.x');
  });

  it('exports through the save callback and emits export errors', async () => {
    const save = vi.fn();
    const w = mountViewer({ save });
    await w.findAll('button').find((b) => b.text() === 'PDF')!.trigger('click');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![1]).toBe('Sales.pdf');
    await w.findAll('button').find((b) => b.text() === 'Excel')!.trigger('click');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1]).toBe('Sales.xlsx');

    const failing = mountViewer({
      save: () => {
        throw new Error('disk full');
      },
    });
    await failing.findAll('button').find((b) => b.text() === 'PDF')!.trigger('click');
    await vi.waitFor(() => expect(failing.emitted('error')?.[0]?.[0]).toMatchObject({ message: 'disk full' }));
  });

  it('hides the toolbar or export buttons and translates labels', async () => {
    const w = mountViewer({ toolbar: false });
    expect(w.find('[role="toolbar"]').exists()).toBe(false);
    const w2 = mountViewer({ exports: { excel: false, print: false }, labels: { exportPdf: 'Als PDF' } });
    const names = w2.findAll('button').map((b) => b.text());
    expect(names).toContain('Als PDF');
    expect(names).not.toContain('Excel');
    expect(names).not.toContain('Print');
  });

  it('can be driven by an external controller', async () => {
    const controller = new ViewerController();
    const w = mountViewer({ controller });
    controller.lastPage();
    await nextTick();
    expect(texts(w)).toContain('Litware');
    expect(toRaw((w.vm as unknown as { controller: ViewerController }).controller)).toBe(controller);
  });

  it('useViewer gives a controller and reactive state', async () => {
    let api: ReturnType<typeof useViewer> | undefined;
    const Probe = defineComponent({
      setup() {
        api = useViewer();
        return () => h('span', String(api!.state.value.pageCount));
      },
    });
    const w = mount(Probe);
    wrappers.push(w);
    expect(w.text()).toBe('0');
    api!.controller.load(salesTemplate(), salesData);
    await flushPromises();
    expect(Number(w.text())).toBeGreaterThan(1);
  });

  it('registers components with the plugin', () => {
    const app = createApp({ render: () => null });
    app.use(ArianaReport);
    expect(app.component('ReportViewer')).toBe(ReportViewer);
    expect(app.component('ReportDesigner')).toBeTruthy();
  });
});
