# @ariana-report/vue

Vue 3 report viewer and report designer for ariana-report.

```bash
npm install @ariana-report/vue
```

```vue
<script setup lang="ts">
import { ReportDesigner, ReportViewer } from '@ariana-report/vue';
</script>

<template>
  <ReportViewer :template="template" :data="data" :params="{ title: 'Q1' }" />
  <ReportDesigner :template="template" :sample-data="data" :on-save="(t, json) => saveToServer(json)" />
</template>
```

Or register both globally with `app.use(ArianaReport)`. This package re-exports everything from `@ariana-report/core`. See the [project README](../../README.md) for the template format and expression reference.
