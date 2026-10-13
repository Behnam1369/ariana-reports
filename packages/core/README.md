# @ariana-reports/core

Framework-agnostic banded reporting engine for the browser: JSON templates, JSON data, sandboxed JavaScript expressions, HTML rendering, PDF and Excel export, plus the viewer and designer logic used by `@ariana-reports/react` and `@ariana-reports/vue`.

```bash
npm install @ariana-reports/core
```

```ts
import { exportPdf, generateReport, renderDocument } from '@ariana-reports/core';

const doc = generateReport(template, data);
renderDocument(doc, document.getElementById('report')!);
const pdf = await exportPdf(doc);
```

See the [documentation](https://ariana-reports.netlify.app) for the template format, expressions and API.

[Documentation](https://ariana-reports.netlify.app) · [Playground](https://ariana-reports.netlify.app/playground/) · [GitHub](https://github.com/Behnam1369/ariana-reports) · [MIT license](https://github.com/Behnam1369/ariana-reports/blob/main/LICENSE)
