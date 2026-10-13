import { ReportViewer } from '@ariana-reports/react';
import { productsData, productsTemplate } from '../data';

export default function ViewerBasic() {
  return <ReportViewer template={productsTemplate} data={productsData} zoomMode="fitWidth" />;
}
