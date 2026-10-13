<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { ReportDesigner, ReportViewer, type ReportTemplate } from '@ariana-reports/vue';
import { SAMPLES, storageKey, type Sample } from '../../shared/samples';

function loadTemplate(s: Sample): ReportTemplate {
  const saved = localStorage.getItem(storageKey(s.id));
  return (saved ? JSON.parse(saved) : s.template) as ReportTemplate;
}

const sample = shallowRef<Sample>(SAMPLES[0]!);
const template = shallowRef<ReportTemplate>(loadTemplate(sample.value));
const tab = ref<'viewer' | 'designer'>('viewer');
const uiLocale = ref('en');
// Bumped on reset or report change so the designer starts over.
const version = ref(0);

function pick(id: string) {
  sample.value = SAMPLES.find((s) => s.id === id)!;
  template.value = loadTemplate(sample.value);
  version.value++;
}

function onSave(t: ReportTemplate, json: string) {
  // A real app would send `json` to its backend.
  localStorage.setItem(storageKey(sample.value.id), json);
  template.value = t;
}

function reset() {
  localStorage.removeItem(storageKey(sample.value.id));
  template.value = sample.value.template as ReportTemplate;
  version.value++;
}
</script>

<template>
  <div class="demo">
    <nav class="demo-nav" aria-label="Demo">
      <strong>ariana-report · Vue</strong>
      <label>
        Report
        <select :value="sample.id" @change="pick(($event.target as HTMLSelectElement).value)">
          <option v-for="s in SAMPLES" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </label>
      <label>
        Language
        <select v-model="uiLocale">
          <option value="en">English</option>
          <option value="fa">فارسی</option>
        </select>
      </label>
      <button type="button" :aria-pressed="tab === 'viewer'" @click="tab = 'viewer'">Viewer</button>
      <button type="button" :aria-pressed="tab === 'designer'" @click="tab = 'designer'">Designer</button>
      <button type="button" class="demo-reset" @click="reset">Reset sample</button>
    </nav>
    <main class="demo-main">
      <ReportViewer v-if="tab === 'viewer'" :key="sample.id" :template="template" :data="sample.data" zoom-mode="fitWidth" :ui-locale="uiLocale" @error="console.error" />
      <ReportDesigner v-else :key="`${sample.id}:${version}`" :template="template" :sample-data="sample.data" :ui-locale="uiLocale" :on-save="onSave" />
    </main>
  </div>
</template>

<style>
.demo { display: flex; flex-direction: column; height: 100%; }
.demo-nav { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #ddd; font: 14px system-ui; }
.demo-nav strong { margin-right: 16px; }
.demo-reset { margin-left: auto; }
.demo-main { flex: 1; min-height: 0; }
</style>
