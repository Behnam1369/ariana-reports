<script setup lang="ts">
import { ReportDesigner } from '@ariana-reports/vue';
import { persianData, persianTemplate } from '../data';
</script>

<template>
  <!-- ui-locale translates the toolbar, panels and dialogs and switches them to right-to-left. -->
  <ReportDesigner :template="persianTemplate" :sample-data="persianData" ui-locale="fa" :fonts="['Vazirmatn']" />
</template>
