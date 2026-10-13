export type Framework = 'react' | 'vue';
export type ThemeName = 'auto' | 'light' | 'dark' | 'grape';

export interface CodeOptions {
  framework: Framework;
  uiLocale: string;
  theme: ThemeName;
  /** Whether the Persian font is listed in the designer. */
  fonts: boolean;
}

/** Source for the theme the playground applies, written as a user would. */
function themeCode(theme: ThemeName): { imports: string[]; setup: string; expression: string } | null {
  if (theme === 'dark') return { imports: ['DARK_THEME'], setup: '', expression: 'DARK_THEME' };
  if (theme === 'grape') {
    return {
      imports: ['themeFromMui'],
      setup: `// In a Material UI app: themeFromMui(useTheme())
const theme = themeFromMui({
  palette: { mode: 'light', primary: { main: '#7b1fa2' }, background: { default: '#f3e5f5', paper: '#ffffff' } },
  shape: { borderRadius: 14 },
});
`,
      expression: 'theme',
    };
  }
  return null;
}

/** Starter code for the current playground settings, as a React or Vue component. */
export function generateCode({ framework, uiLocale, theme, fonts }: CodeOptions): string {
  const t = themeCode(theme);
  const react = framework === 'react';
  const imports = ['ReportDesigner', 'ReportViewer', ...(t?.imports ?? [])].sort();
  const setup = t?.setup ? `\n${t.setup}` : '';

  // Optional props, one per line, written for the chosen framework.
  const options: string[] = [];
  if (uiLocale !== 'en') options.push(react ? `uiLocale="${uiLocale}"` : `ui-locale="${uiLocale}"`);
  if (t) options.push(react ? `theme={${t.expression}}` : `:theme="${t.expression}"`);
  const designerOptions = [...options, ...(fonts ? [react ? `fonts={['Vazirmatn']}` : `:fonts="['Vazirmatn']"`] : [])];

  if (react) {
    const lines = (list: string[], indent: string) => list.map((o) => `\n${indent}${o}`).join('');
    return `import { ${imports.join(', ')} } from '@ariana-reports/react';
import template from './report.template.json';
import data from './report.data.json';
${setup}
// Edit templates visually and save them to your backend.
export function Designer() {
  return (
    <div style={{ height: '100vh' }}>
      <ReportDesigner
        template={template as never}
        sampleData={data}${lines(designerOptions, '        ')}
        onSave={async (_template, json) => {
          await fetch('/api/reports/my-report', { method: 'PUT', body: json });
        }}
      />
    </div>
  );
}

// Show a report with the stored template and fresh data.
export function Viewer() {
  return (
    <div style={{ height: '100vh' }}>
      <ReportViewer
        template={template as never}
        data={data}${lines(options, '        ')}
      />
    </div>
  );
}
`;
  }

  const lines = (list: string[]) => list.map((o) => `\n      ${o}`).join('');
  return `<script setup lang="ts">
import { ${imports.join(', ')} } from '@ariana-reports/vue';
import template from './report.template.json';
import data from './report.data.json';
${setup}
async function save(_template: unknown, json: string) {
  await fetch('/api/reports/my-report', { method: 'PUT', body: json });
}
</script>

<template>
  <!-- Edit templates visually and save them to your backend. -->
  <div style="height: 100vh">
    <ReportDesigner
      :template="template"
      :sample-data="data"${lines(designerOptions)}
      :on-save="save"
    />
  </div>

  <!-- Show a report with the stored template and fresh data. -->
  <div style="height: 100vh">
    <ReportViewer
      :template="template"
      :data="data"${lines(options)}
    />
  </div>
</template>
`;
}
