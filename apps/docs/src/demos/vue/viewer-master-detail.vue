<script setup lang="ts">
import { ReportViewer } from '@ariana-reports/vue';
import { ordersData, ordersTemplate } from '../data';
</script>

<template>
  <ReportViewer :template="ordersTemplate" :data="ordersData" zoom-mode="fitWidth" />
</template>
