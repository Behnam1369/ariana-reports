<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { ReportDesigner, ReportViewer, type ReportTemplate } from '@ariana-report/vue';
import data from '../../shared/sales.data.json';
import initialTemplate from '../../shared/sales.template.json';

const STORAGE_KEY = 'ariana-report-demo-template';

const saved = localStorage.getItem(STORAGE_KEY);
const template = shallowRef<ReportTemplate>(saved ? JSON.parse(saved) : (initialTemplate as ReportTemplate));
const tab = ref<'viewer' | 'designer'>('viewer');
// Bumped on reset so the designer starts over with the sample template.
const version = ref(0);

function onSave(t: ReportTemplate, json: string) {
  // A real app would send `json` to its backend.
  localStorage.setItem(STORAGE_KEY, json);
  template.value = t;
}

function reset() {
  localStorage.removeItem(STORAGE_KEY);
  template.value = initialTemplate as ReportTemplate;
  version.value++;
}
</script>

<template>
  <div class="demo">
    <nav class="demo-nav" aria-label="Demo">
      <strong>ariana-report · Vue</strong>
      <button type="button" :aria-pressed="tab === 'viewer'" @click="tab = 'viewer'">Viewer</button>
      <button type="button" :aria-pressed="tab === 'designer'" @click="tab = 'designer'">Designer</button>
      <button type="button" class="demo-reset" @click="reset">Reset sample</button>
    </nav>
    <main class="demo-main">
      <ReportViewer v-if="tab === 'viewer'" :template="template" :data="data" zoom-mode="fitWidth" @error="console.error" />
      <ReportDesigner v-else :key="version" :template="template" :sample-data="data" :on-save="onSave" />
    </main>
  </div>
</template>

<style>
.demo { display: flex; flex-direction: column; height: 100%; }
.demo-nav { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #ddd; font: 14px system-ui; }
.demo-nav strong { margin-right: 16px; }
.demo-reset { margin-left: auto; }
.demo-main { flex: 1; min-height: 0; }
</style>
