import { ReportViewer } from '@ariana-reports/react';
import { persianData, persianTemplate } from '../data';

export default function ViewerPersian() {
  return <ReportViewer template={persianTemplate} data={persianData} zoomMode="fitWidth" uiLocale="fa" />;
}
