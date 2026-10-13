// Runs before `npm publish` (prepublishOnly). Stops a release that still has placeholders or no build.
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const problems = [];
for (const file of ['package.json', 'README.md', 'LICENSE']) {
  if (existsSync(file) && /__(OWNER|AUTHOR|SITE_URL)__/.test(readFileSync(file, 'utf8'))) {
    problems.push(`${file} still contains a placeholder. Run: corepack pnpm configure --owner <github-user> --author "<Name>" --site <url>`);
  }
}
for (const out of ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts']) {
  if (!existsSync(out)) problems.push(`${out} is missing. Run: corepack pnpm build`);
}
if (problems.length) {
  console.error(`Cannot publish ${pkg.name}@${pkg.version}:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
