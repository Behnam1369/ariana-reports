// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ReportDesigner, ReportViewer } from '../src';
import { salesData, salesTemplate } from './fixtures';

// Server rendering must not touch the DOM: frameworks such as Nuxt render components on the server first.
describe('server-side rendering (no DOM)', () => {
  it('renders the viewer toolbar without a document', async () => {
    expect(typeof document).toBe('undefined');
    const html = await renderToString(createSSRApp({ render: () => h(ReportViewer, { template: salesTemplate(), data: salesData }) }));
    expect(html).toContain('ar-viewer');
    expect(html).toContain('aria-label="Next page"');
  });

  it('renders the designer without a document', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ReportDesigner, { template: salesTemplate(), sampleData: salesData }) }));
    expect(html).toContain('ar-designer');
    expect(html).toContain('data-band-id="detail"');
  });

  it('renders translated, right-to-left markup', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ReportViewer, { template: salesTemplate(), data: salesData, uiLocale: 'fa' }) }));
    expect(html).toContain('dir="rtl"');
  });
});
