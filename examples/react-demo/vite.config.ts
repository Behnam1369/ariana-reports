import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the package sources directly so the demo works without building the packages first.
    alias: {
      '@ariana-report/react': src('../../packages/react/src/index.ts'),
      '@ariana-report/core': src('../../packages/core/src/index.ts'),
    },
  },
});
