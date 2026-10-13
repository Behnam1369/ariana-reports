import { ReportViewer } from '@ariana-reports/react';
import { ordersData, ordersTemplate } from '../data';

export default function ViewerMasterDetail() {
  return <ReportViewer template={ordersTemplate} data={ordersData} zoomMode="fitWidth" />;
}
