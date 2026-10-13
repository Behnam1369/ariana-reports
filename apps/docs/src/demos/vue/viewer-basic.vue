<script setup lang="ts">
import { ReportViewer } from '@ariana-reports/vue';
import { productsData, productsTemplate } from '../data';
</script>

<template>
  <ReportViewer :template="productsTemplate" :data="productsData" zoom-mode="fitWidth" />
</template>
