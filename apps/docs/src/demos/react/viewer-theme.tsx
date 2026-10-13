import { useState } from 'react';
import { DARK_THEME, ReportViewer, themeFromMui } from '@ariana-reports/react';
import { salesData, salesTemplate } from '../data';

// Any object shaped like a Material UI theme works, so in a MUI app pass useTheme() directly.
const grape = themeFromMui({
  palette: { mode: 'light', primary: { main: '#7b1fa2' }, background: { default: '#f3e5f5', paper: '#ffffff' } },
  shape: { borderRadius: 14 },
});

const themes = { default: undefined, dark: DARK_THEME, grape } as const;

export default function ViewerTheme() {
  const [name, setName] = useState<keyof typeof themes>('grape');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <label style={{ padding: 8, background: '#fff', font: '13px system-ui' }}>
        Theme{' '}
        <select value={name} onChange={(e) => setName(e.target.value as keyof typeof themes)}>
          {Object.keys(themes).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReportViewer template={salesTemplate} data={salesData} theme={themes[name]} zoomMode="fitWidth" showIssues />
      </div>
    </div>
  );
}
