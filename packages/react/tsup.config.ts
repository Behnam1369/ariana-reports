import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // Next.js App Router: the components use hooks, so they must be treated as client components.
  banner: { js: '"use client";' },
  external: ['react', 'react-dom', 'react/jsx-runtime', '@ariana-reports/core'],
});
