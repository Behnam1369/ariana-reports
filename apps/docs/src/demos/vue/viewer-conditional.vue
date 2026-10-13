<script setup lang="ts">
import { ReportViewer } from '@ariana-reports/vue';
import { invoicesData, invoicesTemplate } from '../data';
</script>

<template>
  <ReportViewer :template="invoicesTemplate" :data="invoicesData" zoom-mode="fitWidth" />
</template>
