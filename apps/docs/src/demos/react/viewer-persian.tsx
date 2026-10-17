import { useEffect, useState } from 'react';
import { createFontMeasurer, type FontRegistration, type TextMeasurer } from '@ariana-reports/core';
import { ReportViewer } from '@ariana-reports/react';
import { persianData, persianTemplate } from '../data';
import { loadPersianFonts } from '../fonts';

export default function ViewerPersian() {
  // The PDF needs the font files: register them in `pdf.fonts`, and measure text with them so line breaks match.
  const [fonts, setFonts] = useState<{ fonts: FontRegistration[]; measurer: TextMeasurer }>();
  useEffect(() => {
    loadPersianFonts().then(async (fonts) => setFonts({ fonts, measurer: await createFontMeasurer(fonts) }));
  }, []);
  if (!fonts) return null;
  return <ReportViewer template={persianTemplate} data={persianData} zoomMode="fitWidth" uiLocale="fa" measurer={fonts.measurer} pdf={{ fonts: fonts.fonts }} />;
}
