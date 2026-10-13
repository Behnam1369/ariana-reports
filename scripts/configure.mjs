// Fills in the repository placeholders once the GitHub account and site URL are known:
//   corepack pnpm configure --owner <github-user> --author "Your Name" --site https://your-site.netlify.app
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const tokens = { __OWNER__: args.owner, __AUTHOR__: args.author, __SITE_URL__: args.site?.replace(/\/+$/, '') };
const given = Object.entries(tokens).filter(([, v]) => v);
if (given.length === 0) {
  console.error('Usage: pnpm configure --owner <github-user> [--author "Name"] [--site https://x.netlify.app]');
  process.exit(1);
}

const skip = new Set(['node_modules', 'dist', '.git', '.astro', 'coverage']);
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(json|md|mdx|ts|tsx|mjs|astro|toml|yml|yaml|html|vue)$|^LICENSE$/.test(name) && name !== 'pnpm-lock.yaml' && path !== 'scripts/configure.mjs') yield path;
  }
}

let changed = 0;
for (const file of walk('.')) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [token, value] of given) after = after.split(token).join(value);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log('updated', file);
  }
}
console.log(`${changed} files updated`);
