// Keeps the VERSION constant of @ariana-reports/core in sync with its package.json (run by `pnpm version`).
import { readFileSync, writeFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
const file = 'packages/core/src/index.ts';
const source = readFileSync(file, 'utf8');
const next = source.replace(/export const VERSION = '[^']*';/, `export const VERSION = '${version}';`);
if (next === source && !source.includes(`'${version}'`)) throw new Error('VERSION constant not found in ' + file);
writeFileSync(file, next);
console.log(`VERSION = ${version}`);
