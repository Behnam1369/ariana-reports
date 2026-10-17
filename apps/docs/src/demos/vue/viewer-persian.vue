<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { createFontMeasurer, type FontRegistration, type TextMeasurer } from '@ariana-reports/core';
import { ReportViewer } from '@ariana-reports/vue';
import { persianData, persianTemplate } from '../data';
import { loadPersianFonts } from '../fonts';

// The PDF needs the font files: register them in `pdf.fonts`, and measure text with them so line breaks match.
const fonts = shallowRef<{ fonts: FontRegistration[]; measurer: TextMeasurer }>();
onMounted(async () => {
  const files = await loadPersianFonts();
  fonts.value = { fonts: files, measurer: await createFontMeasurer(files) };
});
</script>

<template>
  <ReportViewer
    v-if="fonts"
    :template="persianTemplate"
    :data="persianData"
    zoom-mode="fitWidth"
    ui-locale="fa"
    :measurer="fonts.measurer"
    :pdf="{ fonts: fonts.fonts }"
  />
</template>
