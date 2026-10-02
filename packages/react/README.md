# @ariana-report/react

React 19 report viewer and report designer for ariana-report.

```bash
npm install @ariana-report/react
```

```tsx
import { ReportDesigner, ReportViewer } from '@ariana-report/react';

<ReportViewer template={template} data={data} params={{ title: 'Q1' }} />
<ReportDesigner template={template} sampleData={data} onSave={(t, json) => saveToServer(json)} />
```

This package re-exports everything from `@ariana-report/core`. See the [project README](../../README.md) for the template format and expression reference.
