// Generates the API reference pages (src/content/docs/api) from the TypeScript sources of @ariana-reports/core
// with TypeDoc, and adapts the markdown for Starlight: front matter, no duplicate titles, working links.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.api-tmp');
const out = join(root, 'src/content/docs/api');
const require = createRequire(import.meta.url);

rmSync(tmp, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const typedoc = join(dirname(require.resolve('typedoc/package.json')), 'bin/typedoc');
try {
  execFileSync(process.execPath, [typedoc, '--options', 'typedoc.json'], { cwd: root, stdio: 'pipe' });
} catch (error) {
  process.stderr.write(String(error.stdout ?? '') + String(error.stderr ?? ''));
  throw error;
}

// /api/classes/ViewerController.md#hash -> /api/classes/viewercontroller/#hash (Starlight lower-cases slugs)
const fixLinks = (text) =>
  text.replace(/\]\((\/api\/[^)\s#]*?)\.md(#[^)\s]*)?\)/g, (_m, path, hash = '') => `](${path.toLowerCase()}/${hash})`);

const KIND_LABEL = { Class: 'Classes', Interface: 'Interfaces', Function: 'Functions', 'Type Alias': 'Type aliases', Variable: 'Variables' };

function convert(file, relative) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const heading = lines.findIndex((l) => l.startsWith('# '));
  const rawTitle = heading >= 0 ? lines[heading].slice(2).trim() : relative;
  const match = /^(Class|Interface|Function|Type Alias|Variable|Enumeration): (.+)$/.exec(rawTitle);
  const title = match ? match[2] : rawTitle === '@ariana-reports/core' ? 'API overview' : rawTitle;
  const body = lines.filter((_, i) => i !== heading).join('\n').trim();
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const firstParagraph = prose.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('|') && !l.startsWith('-'));
  const description = (firstParagraph ?? `${match ? KIND_LABEL[match[1]] : 'API'} reference of @ariana-reports/core.`).replace(/[`*_\\]/g, '').slice(0, 200);
  const frontmatter = ['---', `title: ${JSON.stringify(title)}`, `description: ${JSON.stringify(description)}`, '---', ''].join('\n');
  return `${frontmatter}${fixLinks(body)}\n`;
}

function walk(dir, base = '') {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const relative = join(base, name.name);
    if (name.isDirectory()) {
      mkdirSync(join(out, relative), { recursive: true });
      walk(join(dir, name.name), relative);
    } else if (name.name.endsWith('.md')) {
      writeFileSync(join(out, relative), convert(join(dir, name.name), relative));
    }
  }
}
walk(tmp);

// The overview page: say what is documented here before the generated list.
const indexPath = join(out, 'index.md');
const index = readFileSync(indexPath, 'utf8').replace(
  /^(---[\s\S]*?---\n)/,
  `---\ntitle: "API overview"\ndescription: "Reference for the exports of @ariana-reports/core."\n---\n\nThis reference is generated from the TypeScript sources of \`@ariana-reports/core\`. The React and Vue packages re-export all of it, so everything below can be imported from \`@ariana-reports/react\` or \`@ariana-reports/vue\` too.\n\nThe components have their own pages: the props of \`ReportViewer\` are in [The viewer](/guides/viewer/#props) and those of \`ReportDesigner\` in [The designer](/guides/designer/#props). Both packages also export \`useViewer\` / \`useDesigner\` for the controllers, and \`ReportPage\`.\n`,
);
writeFileSync(indexPath, index);

rmSync(tmp, { recursive: true, force: true });
console.log(`API reference generated in ${out}`);
