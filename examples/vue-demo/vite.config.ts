import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Use the package sources directly so the demo works without building the packages first.
    alias: {
      '@ariana-reports/vue': src('../../packages/vue/src/index.ts'),
      '@ariana-reports/core': src('../../packages/core/src/index.ts'),
    },
  },
});
