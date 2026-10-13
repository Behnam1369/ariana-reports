import { ReportDesigner } from '@ariana-reports/react';
import { persianData, persianTemplate } from '../data';

// uiLocale translates the toolbar, panels and dialogs and switches them to right-to-left.
export default function DesignerPersian() {
  return <ReportDesigner template={persianTemplate} sampleData={persianData} uiLocale="fa" fonts={['Vazirmatn']} />;
}
