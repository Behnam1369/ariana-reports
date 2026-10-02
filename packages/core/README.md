# @ariana-report/core

Framework-agnostic banded reporting engine for the browser: JSON templates, JSON data, sandboxed JavaScript expressions, HTML rendering, PDF and Excel export, plus the viewer and designer logic used by `@ariana-report/react` and `@ariana-report/vue`.

```bash
npm install @ariana-report/core
```

```ts
import { exportPdf, generateReport, renderDocument } from '@ariana-report/core';

const doc = generateReport(template, data);
renderDocument(doc, document.getElementById('report')!);
const pdf = await exportPdf(doc);
```

See the [project README](../../README.md) for the template format, expressions and API.
