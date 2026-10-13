import { ReportViewer } from '@ariana-reports/react';
import { notesData, notesTemplate } from '../data';

export default function ViewerHtml() {
  return <ReportViewer template={notesTemplate} data={notesData} zoomMode="fitWidth" />;
}
