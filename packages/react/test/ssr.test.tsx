// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportDesigner, ReportViewer } from '../src';
import { salesData, salesTemplate } from './fixtures';

// Server rendering must not touch the DOM: frameworks such as Next.js render components on the server first.
describe('server-side rendering (no DOM)', () => {
  it('renders the viewer toolbar without a document', () => {
    expect(typeof document).toBe('undefined');
    const html = renderToString(<ReportViewer template={salesTemplate()} data={salesData} />);
    expect(html).toContain('ar-viewer');
    expect(html).toContain('aria-label="Next page"');
  });

  it('renders the designer without a document', () => {
    const html = renderToString(<ReportDesigner template={salesTemplate()} sampleData={salesData} />);
    expect(html).toContain('ar-designer');
    expect(html).toContain('data-band-id="detail"');
  });

  it('renders translated, right-to-left markup', () => {
    const html = renderToString(<ReportViewer template={salesTemplate()} data={salesData} uiLocale="fa" />);
    expect(html).toContain('dir="rtl"');
  });
});
