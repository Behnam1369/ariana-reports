<script setup lang="ts">
import { computed, ref } from 'vue';
import { DARK_THEME, ReportViewer, themeFromMui } from '@ariana-reports/vue';
import { salesData, salesTemplate } from '../data';

// Any object shaped like a Material UI theme works.
const grape = themeFromMui({
  palette: { mode: 'light', primary: { main: '#7b1fa2' }, background: { default: '#f3e5f5', paper: '#ffffff' } },
  shape: { borderRadius: 14 },
});

const themes = { default: undefined, dark: DARK_THEME, grape } as const;
const name = ref<keyof typeof themes>('grape');
const theme = computed(() => themes[name.value]);
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <label style="padding: 8px; background: #fff; font: 13px system-ui">
      Theme
      <select v-model="name">
        <option v-for="t in Object.keys(themes)" :key="t">{{ t }}</option>
      </select>
    </label>
    <div style="flex: 1; min-height: 0">
      <ReportViewer :template="salesTemplate" :data="salesData" :theme="theme" zoom-mode="fitWidth" show-issues />
    </div>
  </div>
</template>
