import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against the core sources so a core build is not required.
    alias: { '@ariana-report/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
