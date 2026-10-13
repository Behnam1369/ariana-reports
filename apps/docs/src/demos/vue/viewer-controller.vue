<script setup lang="ts">
import { ReportViewer, useViewer } from '@ariana-reports/vue';
import { productsData, productsTemplate } from '../data';

// Hide the built-in toolbar and drive the viewer from your own UI through its controller.
const { controller, state } = useViewer();
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <div style="display: flex; gap: 8px; align-items: center; padding: 8px; background: #fff; font: 13px system-ui">
      <button @click="controller.previousPage()">Previous</button>
      <span>Page {{ state.pageIndex + 1 }} of {{ state.pageCount }}</span>
      <button @click="controller.nextPage()">Next</button>
      <button @click="controller.zoomIn()">Zoom in</button>
      <button @click="controller.zoomOut()">Zoom out</button>
      <button :disabled="state.busy" @click="controller.downloadPdf()">Download PDF</button>
    </div>
    <div style="flex: 1; min-height: 0">
      <ReportViewer :controller="controller" :template="productsTemplate" :data="productsData" :toolbar="false" zoom-mode="fitWidth" />
    </div>
  </div>
</template>
