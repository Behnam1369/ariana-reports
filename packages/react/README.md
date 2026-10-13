# @ariana-reports/react

React 19 report viewer and report designer for ariana-report.

```bash
npm install @ariana-reports/react
```

```tsx
import { ReportDesigner, ReportViewer } from '@ariana-reports/react';

<ReportViewer template={template} data={data} params={{ title: 'Q1' }} />
<ReportDesigner template={template} sampleData={data} onSave={(t, json) => saveToServer(json)} />
<ReportViewer uiLocale="fa" template={template} data={data} /> {/* Persian, right-to-left UI */}
```

This package re-exports everything from `@ariana-reports/core`. See the [documentation](https://ariana-reports.netlify.app) for the template format and expression reference.

[Documentation](https://ariana-reports.netlify.app) · [Playground](https://ariana-reports.netlify.app/playground/) · [GitHub](https://github.com/Behnam1369/ariana-reports) · [MIT license](https://github.com/Behnam1369/ariana-reports/blob/main/LICENSE)
