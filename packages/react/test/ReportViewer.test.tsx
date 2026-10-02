import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateReport, STYLE_ELEMENT_ID, ViewerController } from '@ariana-report/core';
import { ReportViewer, useViewer } from '../src';
import { salesData, salesTemplate } from './fixtures';

afterEach(cleanup);

const pageTexts = (container: HTMLElement) => Array.from(container.querySelectorAll('.ar-text')).map((e) => e.textContent);

describe('ReportViewer', () => {
  it('generates and shows the first page with page info', () => {
    const onGenerated = vi.fn();
    const { container } = render(<ReportViewer template={salesTemplate()} data={salesData} onGenerated={onGenerated} />);
    expect(onGenerated).toHaveBeenCalledTimes(1);
    const pages = onGenerated.mock.calls[0]![0].pages.length;
    expect(pages).toBeGreaterThan(1);
    expect(screen.getByText(`of ${pages}`)).toBeTruthy();
    expect(pageTexts(container)).toEqual(['Sales report', 'Customer', 'Contoso', '10.00', 'Fabrikam', '20.50', 'Northwind', '5.00']);
    expect(container.querySelectorAll('.ar-page')).toHaveLength(1);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeTruthy();
  });

  it('navigates with the toolbar and the page input', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportViewer template={salesTemplate()} data={salesData} />);
    const first = screen.getByRole('button', { name: 'First page' }) as HTMLButtonElement;
    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    expect(prev.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect((screen.getByLabelText('Page number') as HTMLInputElement).value).toBe('2');
    expect(pageTexts(container)).toContain('Tailspin');
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
    const input = screen.getByLabelText('Page number');
    await user.clear(input);
    await user.type(input, '1{Enter}');
    expect(pageTexts(container)[0]).toBe('Sales report');
    await user.clear(input);
    await user.type(input, 'abc');
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('1');
  });

  it('navigates with PageDown/PageUp/End/Home on the page area', () => {
    const { container } = render(<ReportViewer template={salesTemplate()} data={salesData} />);
    const scroller = container.querySelector('.ar-viewer-scroll')!;
    fireEvent.keyDown(scroller, { key: 'PageDown' });
    expect((screen.getByLabelText('Page number') as HTMLInputElement).value).toBe('2');
    fireEvent.keyDown(scroller, { key: 'End' });
    fireEvent.keyDown(scroller, { key: 'PageUp' });
    fireEvent.keyDown(scroller, { key: 'Home' });
    expect((screen.getByLabelText('Page number') as HTMLInputElement).value).toBe('1');
  });

  it('zooms with buttons and the zoom select, scaling the page', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportViewer template={salesTemplate()} data={salesData} />);
    const width = () => parseFloat((container.querySelector('.ar-page') as HTMLElement).style.width);
    const w1 = width();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(width()).toBeCloseTo(w1 * 1.25, 2);
    await user.selectOptions(screen.getByLabelText('Zoom'), '2');
    expect(width()).toBeCloseTo(w1 * 2, 2);
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(width()).toBeCloseTo(w1 * 1.5, 2);
    await user.selectOptions(screen.getByLabelText('Zoom'), 'fitWidth');
    expect((screen.getByLabelText('Zoom') as HTMLSelectElement).value).toBe('fitWidth');
  });

  it('shows errors for invalid templates and calls onError', () => {
    const onError = vi.fn();
    render(<ReportViewer template={{ ...salesTemplate(), unit: 'furlong' } as never} data={{}} onError={onError} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be generated[\s\S]*unit/);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect((screen.getByRole('button', { name: 'PDF' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('regenerates when data or params change', () => {
    const { container, rerender } = render(<ReportViewer template={salesTemplate()} data={salesData} params={{ title: 'A' }} />);
    expect(pageTexts(container)[0]).toBe('A');
    rerender(<ReportViewer template={salesTemplate()} data={{ orders: [] }} params={{ title: 'B' }} />);
    expect(pageTexts(container)).toEqual(['B', 'Customer', '0']);
  });

  it('shows a prebuilt document', () => {
    const doc = generateReport(salesTemplate(), salesData, { params: { title: 'Prebuilt' } });
    const { container } = render(<ReportViewer document={doc} />);
    expect(pageTexts(container)[0]).toBe('Prebuilt');
  });

  it('lists issues in the issues panel', async () => {
    const user = userEvent.setup();
    const t = salesTemplate();
    (t.body[0] as any).detail.components[0].text = '{{ row.missing.x }}';
    render(<ReportViewer template={t} data={salesData} />);
    await user.click(screen.getByRole('button', { name: /Issues \(1\)/ }));
    const panel = screen.getByRole('complementary', { name: 'Issues' });
    expect(within(panel).getByText(/Cannot read property "x"/)).toBeTruthy();
    expect(within(panel).getByText('row.missing.x')).toBeTruthy();
  });

  it('exports PDF and Excel through the save callback', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<ReportViewer template={salesTemplate()} data={salesData} save={save} />);
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![1]).toBe('Sales.pdf');
    await user.click(screen.getByRole('button', { name: 'Excel' }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1]).toBe('Sales.xlsx');
  });

  it('reports export failures through onError', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const save = () => {
      throw new Error('disk full');
    };
    render(<ReportViewer template={salesTemplate()} data={salesData} save={save} onError={onError} />);
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' })));
  });

  it('can hide the toolbar, hide export buttons and translate labels', () => {
    const { rerender } = render(<ReportViewer template={salesTemplate()} data={salesData} toolbar={false} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    rerender(<ReportViewer template={salesTemplate()} data={salesData} exports={{ excel: false, print: false }} labels={{ exportPdf: 'Als PDF' }} />);
    expect(screen.getByRole('button', { name: 'Als PDF' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });

  it('can be driven by an external controller', () => {
    const controller = new ViewerController();
    const { container } = render(<ReportViewer controller={controller} template={salesTemplate()} data={salesData} />);
    act(() => controller.lastPage());
    expect(pageTexts(container)).toContain('Litware');
  });

  it('useViewer exposes the controller and live state', () => {
    let api: ReturnType<typeof useViewer> | undefined;
    function Probe() {
      api = useViewer();
      return <span>{api.state.pageCount}</span>;
    }
    const { container } = render(<Probe />);
    expect(container.textContent).toBe('0');
    act(() => {
      api!.controller.load(salesTemplate(), salesData);
    });
    expect(Number(container.textContent)).toBeGreaterThan(1);
  });
});
