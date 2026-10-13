<script setup lang="ts">
import { ReportViewer } from '@ariana-reports/vue';
import { notesData, notesTemplate } from '../data';
</script>

<template>
  <ReportViewer :template="notesTemplate" :data="notesData" zoom-mode="fitWidth" />
</template>
