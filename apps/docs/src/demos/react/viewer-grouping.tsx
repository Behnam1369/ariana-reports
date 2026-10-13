import { ReportViewer } from '@ariana-reports/react';
import { salesData, salesTemplate } from '../data';

export default function ViewerGrouping() {
  return <ReportViewer template={salesTemplate} data={salesData} zoomMode="fitWidth" />;
}
