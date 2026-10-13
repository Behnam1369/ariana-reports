import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import vue from '@astrojs/vue';
import { defineConfig } from 'astro/config';

const src = (p) => fileURLToPath(new URL(p, import.meta.url));
const repo = 'https://github.com/Behnam1369/ariana-reports';

export default defineConfig({
  // Netlify sets URL to the primary site URL during builds; SITE_URL overrides it.
  site: process.env.SITE_URL ?? process.env.URL ?? 'http://localhost:4321',
  integrations: [
    starlight({
      title: 'ariana-report',
      description: 'Banded reports for React and Vue: JSON templates, a visual designer, a viewer, and PDF and Excel export. Runs entirely in the browser.',
      logo: { src: './src/assets/logo.svg' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: repo }],
      editLink: { baseUrl: `${repo}/edit/main/apps/docs/` },
      lastUpdated: false,
      customCss: ['@fontsource/vazirmatn/400.css', '@fontsource/vazirmatn/700.css', './src/styles/site.css'],
      components: { SocialIcons: './src/components/SocialIcons.astro' },
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { slug: 'getting-started/introduction' },
            { slug: 'getting-started/installation' },
            { slug: 'getting-started/first-report' },
            { slug: 'getting-started/first-designer' },
            { slug: 'getting-started/frameworks' },
            { slug: 'getting-started/material-ui' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { slug: 'guides/templates' },
            { slug: 'guides/bands' },
            { slug: 'guides/grouping' },
            { slug: 'guides/expressions' },
            { slug: 'guides/formatting' },
            { slug: 'guides/styling' },
            { slug: 'guides/html-text' },
            { slug: 'guides/page-totals' },
            { slug: 'guides/export' },
            { slug: 'guides/fonts' },
            { slug: 'guides/viewer' },
            { slug: 'guides/designer' },
            { slug: 'guides/theming' },
            { slug: 'guides/languages' },
            { slug: 'guides/saving' },
            { slug: 'guides/security' },
          ],
        },
        { label: 'Demos', items: [{ slug: 'demos' }, { slug: 'examples' }] },
        { label: 'API reference', collapsed: true, items: [{ autogenerate: { directory: 'api' } }] },
        { label: 'Project', items: [{ slug: 'project/limitations' }, { slug: 'project/contributing' }] },
      ],
    }),
    react(),
    vue(),
  ],
  vite: {
    resolve: {
      // Always run the packages from source, so the site documents exactly the code in this repository.
      alias: {
        '@ariana-reports/react': src('../../packages/react/src/index.ts'),
        '@ariana-reports/vue': src('../../packages/vue/src/index.ts'),
        '@ariana-reports/core': src('../../packages/core/src/index.ts'),
      },
    },
    ssr: { noExternal: ['@ariana-reports/core', '@ariana-reports/react', '@ariana-reports/vue'] },
  },
});
