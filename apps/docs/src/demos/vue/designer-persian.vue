<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { createFontMeasurer, type FontRegistration, type TextMeasurer } from '@ariana-reports/core';
import { ReportDesigner } from '@ariana-reports/vue';
import { persianData, persianTemplate } from '../data';
import { loadPersianFonts } from '../fonts';

// The preview's PDF export needs the font files (`preview.pdf.fonts`); they also add Vazirmatn to the font list.
const fonts = shallowRef<{ fonts: FontRegistration[]; measurer: TextMeasurer }>();
onMounted(async () => {
  const files = await loadPersianFonts();
  fonts.value = { fonts: files, measurer: await createFontMeasurer(files) };
});
</script>

<template>
  <!-- ui-locale translates the toolbar, panels and dialogs and switches them to right-to-left. -->
  <ReportDesigner
    v-if="fonts"
    :template="persianTemplate"
    :sample-data="persianData"
    ui-locale="fa"
    :preview="{ measurer: fonts.measurer, pdf: { fonts: fonts.fonts } }"
  />
</template>
