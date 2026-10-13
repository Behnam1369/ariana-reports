import { ReportViewer } from '@ariana-reports/react';
import { invoicesData, invoicesTemplate } from '../data';

export default function ViewerConditional() {
  return <ReportViewer template={invoicesTemplate} data={invoicesData} zoomMode="fitWidth" />;
}
