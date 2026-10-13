<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, shallowRef, watchEffect, type Component } from 'vue';

// Every file in demos/vue is a demo; they load on demand, when the demo scrolls into view.
const demos = import.meta.glob<{ default: Component }>('../demos/vue/*.vue');

const props = defineProps<{ name: string }>();
const host = ref<HTMLElement>();
const seen = ref(false);
const error = ref<string | null>(null);
const Demo = shallowRef<Component | null>(null);

watchEffect(() => {
  const load = demos[`../demos/vue/${props.name}.vue`];
  Demo.value = load ? defineAsyncComponent({ loader: load, onError: (e) => (error.value = e.message) }) : null;
});

// Elements in a hidden tab never intersect, so the demo loads when its tab opens.
let io: IntersectionObserver | undefined;
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    seen.value = true;
    return;
  }
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.value = true;
        io?.disconnect();
      }
    },
    { rootMargin: '200px' },
  );
  if (host.value) io.observe(host.value);
});
onBeforeUnmount(() => io?.disconnect());
</script>

<template>
  <div ref="host" class="demo-mount" style="height: 100%">
    <div v-if="!Demo" class="demo-loading">Unknown demo "{{ name }}"</div>
    <div v-else-if="error" class="demo-loading">Demo failed: {{ error }}</div>
    <component :is="Demo" v-else-if="seen" />
    <div v-else class="demo-loading">Vue demo</div>
  </div>
</template>
