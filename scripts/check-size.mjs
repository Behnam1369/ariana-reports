// Fails when a package's gzipped ESM bundle grows past its budget. Run after `pnpm build`.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = [
  // [file, max gzipped kB]. core includes the standard font metrics (~130 kB raw); budgets are ~20% above the current size; pdf-lib and exceljs are not bundled.
  ['packages/core/dist/index.js', 90],
  ['packages/react/dist/index.js', 25],
  ['packages/vue/dist/index.js', 25],
];

let failed = false;
for (const [file, max] of budgets) {
  const kb = gzipSync(readFileSync(file)).length / 1024;
  const ok = kb <= max;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${kb.toFixed(1)} kB gzip (budget ${max} kB)`);
}
if (failed) process.exit(1);
