<script setup lang="ts">
import { ref } from 'vue';
import { ReportDesigner, type ReportTemplate } from '@ariana-reports/vue';
import { salesData, salesTemplate } from '../data';

const template = ref<ReportTemplate>(salesTemplate);

async function save(_template: ReportTemplate, json: string) {
  // Send `json` to your backend here.
  console.log('save', json.length, 'bytes');
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <div style="flex: 1; min-height: 0">
      <!-- The template prop is only the starting point; changes are reported through the change event. -->
      <ReportDesigner :template="salesTemplate" :sample-data="salesData" :on-save="save" @change="template = $event" />
    </div>
    <div style="padding: 4px 10px; background: #fff; font: 12px system-ui; color: #555">
      Template JSON: {{ JSON.stringify(template).length }} characters
    </div>
  </div>
</template>
