import type { App } from 'vue';
import { ReportDesigner } from './designer/ReportDesigner';
import { ReportPage, ReportViewer } from './ReportViewer';

export { ReportDesigner, ReportPage, ReportViewer };
export { useDesigner, useStore, useViewer } from './composables';

/** Vue plugin: registers <ReportViewer> and <ReportDesigner> globally. */
export const ArianaReport = {
  install(app: App): void {
    app.component('ReportViewer', ReportViewer);
    app.component('ReportDesigner', ReportDesigner);
  },
};

// Re-export the core API so apps can depend on a single package.
export * from '@ariana-report/core';
