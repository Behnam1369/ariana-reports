# @ariana-reports/vue

Vue 3 report viewer and report designer for ariana-report.

```bash
npm install @ariana-reports/vue
```

```vue
<script setup lang="ts">
import { ReportDesigner, ReportViewer } from '@ariana-reports/vue';
</script>

<template>
  <ReportViewer :template="template" :data="data" :params="{ title: 'Q1' }" />
  <ReportDesigner :template="template" :sample-data="data" :on-save="(t, json) => saveToServer(json)" />
  <ReportViewer ui-locale="fa" :template="template" :data="data" /><!-- Persian, right-to-left UI -->
</template>
```

Or register both globally with `app.use(ArianaReport)`. This package re-exports everything from `@ariana-reports/core`. See the [documentation](https://ariana-reports.netlify.app) for the template format and expression reference.

[Documentation](https://ariana-reports.netlify.app) · [Playground](https://ariana-reports.netlify.app/playground/) · [GitHub](https://github.com/Behnam1369/ariana-reports) · [MIT license](https://github.com/Behnam1369/ariana-reports/blob/main/LICENSE)
