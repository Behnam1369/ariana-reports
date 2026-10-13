import { ReportViewer, useViewer } from '@ariana-reports/react';
import { productsData, productsTemplate } from '../data';

// Hide the built-in toolbar and drive the viewer from your own UI through its controller.
export default function ViewerController() {
  const { controller, state } = useViewer();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, background: '#fff', font: '13px system-ui' }}>
        <button onClick={() => controller.previousPage()}>Previous</button>
        <span>
          Page {state.pageIndex + 1} of {state.pageCount}
        </span>
        <button onClick={() => controller.nextPage()}>Next</button>
        <button onClick={() => controller.zoomIn()}>Zoom in</button>
        <button onClick={() => controller.zoomOut()}>Zoom out</button>
        <button onClick={() => controller.downloadPdf()} disabled={state.busy}>
          Download PDF
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReportViewer controller={controller} template={productsTemplate} data={productsData} toolbar={false} zoomMode="fitWidth" />
      </div>
    </div>
  );
}
