import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // Heavy export libraries are loaded lazily with dynamic import() and stay external.
  external: ['pdf-lib', '@pdf-lib/fontkit', '@pdf-lib/standard-fonts', 'exceljs'],
});
