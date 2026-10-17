import { useEffect, useState } from 'react';
import { createFontMeasurer, type FontRegistration, type TextMeasurer } from '@ariana-reports/core';
import { ReportDesigner } from '@ariana-reports/react';
import { persianData, persianTemplate } from '../data';
import { loadPersianFonts } from '../fonts';

// uiLocale translates the toolbar, panels and dialogs and switches them to right-to-left.
export default function DesignerPersian() {
  // The preview's PDF export needs the font files (`preview.pdf.fonts`); they also add Vazirmatn to the font list.
  const [fonts, setFonts] = useState<{ fonts: FontRegistration[]; measurer: TextMeasurer }>();
  useEffect(() => {
    loadPersianFonts().then(async (fonts) => setFonts({ fonts, measurer: await createFontMeasurer(fonts) }));
  }, []);
  if (!fonts) return null;
  return <ReportDesigner template={persianTemplate} sampleData={persianData} uiLocale="fa" preview={{ measurer: fonts.measurer, pdf: { fonts: fonts.fonts } }} />;
}
