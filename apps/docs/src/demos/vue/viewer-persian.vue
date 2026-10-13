<script setup lang="ts">
import { ReportViewer } from '@ariana-reports/vue';
import { persianData, persianTemplate } from '../data';
</script>

<template>
  <ReportViewer :template="persianTemplate" :data="persianData" zoom-mode="fitWidth" ui-locale="fa" />
</template>
