<script setup lang="ts">
import { ReportViewer } from '@ariana-reports/vue';
import { salesData, salesTemplate } from '../data';
</script>

<template>
  <ReportViewer :template="salesTemplate" :data="salesData" zoom-mode="fitWidth" />
</template>
