# ariana-report

[![CI](https://github.com/Behnam1369/ariana-reports/actions/workflows/ci.yml/badge.svg)](https://github.com/Behnam1369/ariana-reports/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ariana-reports/core?label=npm)](https://www.npmjs.com/package/@ariana-reports/core)
[![license](https://img.shields.io/npm/l/@ariana-reports/core)](LICENSE)

**[Documentation](https://ariana-reports.netlify.app)** · **[Playground](https://ariana-reports.netlify.app/playground/)** · **[Live demos](https://ariana-reports.netlify.app/demos/)**

An open-source, frontend-only reporting toolkit for React and Vue.

- **Banded reports**: report header/footer, page header/footer, data bands, groups and master-detail.
- **JSON templates**: a report is a plain JSON file you can store anywhere.
- **JSON data**: pass any JSON object; data sources are paths into it.
- **JavaScript expressions**: `{{ sum(rows, r => r.total) }}`, evaluated in a sandbox.
- **Viewer** with page navigation, zoom, print, and **PDF** and **Excel (.xlsx)** export, all in the browser.
- **Designer** with drag and drop, snapping, properties, field binding, expression checking, undo/redo and preview.

| Package | Description |
| --- | --- |
| [`@ariana-reports/core`](packages/core) | Engine: template model, validation, expressions, layout, PDF/Excel export, viewer and designer logic |
| [`@ariana-reports/react`](packages/react) | React 19 `<ReportViewer>` and `<ReportDesigner>` |
| [`@ariana-reports/vue`](packages/vue) | Vue 3 `<ReportViewer>` and `<ReportDesigner>` |

The React and Vue packages re-export the whole core API, so an app only needs one of them.

## Quick start

### React

```bash
npm install @ariana-reports/react
```

```tsx
import { ReportDesigner, ReportViewer, type ReportTemplate } from '@ariana-reports/react';
import template from './sales.template.json';

export function SalesReport({ data }: { data: unknown }) {
  return (
    <div style={{ height: 600 }}>
      <ReportViewer template={template as ReportTemplate} data={data} params={{ title: 'Q1 sales' }} />
    </div>
  );
}

export function SalesDesigner({ data }: { data: unknown }) {
  return (
    <div style={{ height: '100vh' }}>
      <ReportDesigner
        template={template as ReportTemplate}
        sampleData={data}
        onSave={async (_template, json) => {
          await fetch('/api/reports/sales', { method: 'PUT', body: json });
        }}
      />
    </div>
  );
}
```

### Vue

```bash
npm install @ariana-reports/vue
```

```vue
<script setup lang="ts">
import { ReportDesigner, ReportViewer } from '@ariana-reports/vue';
import template from './sales.template.json';
defineProps<{ data: unknown }>();

async function save(_template: unknown, json: string) {
  await fetch('/api/reports/sales', { method: 'PUT', body: json });
}
</script>

<template>
  <ReportViewer :template="template" :data="data" :params="{ title: 'Q1 sales' }" style="height: 600px" />
  <ReportDesigner :template="template" :sample-data="data" :on-save="save" style="height: 100vh" />
</template>
```

Or register both components globally: `app.use(ArianaReport)`.

The components fill their parent, so give the parent a height. They add a default stylesheet once (set `injectStyles` to `false` to provide your own; all classes start with `ar-`).

### Without a framework

```ts
import { downloadBytes, exportPdf, generateReport, renderDocument } from '@ariana-reports/core';

const doc = generateReport(template, data, { params: { title: 'Q1' } });
renderDocument(doc, document.getElementById('report')!); // HTML pages
const pdf = await exportPdf(doc); // Uint8Array
downloadBytes(pdf, 'sales.pdf', 'application/pdf');
```

## How it works

```
template (JSON) + data (JSON)
          │
          ▼  generateReport()
   layout document  ──►  DOM viewer (renderPage)
   (pages, bands,   ──►  PDF (exportPdf, pdf-lib)
    positioned items)──► Excel (exportExcel, exceljs)
```

The engine resolves bands, evaluates expressions, wraps text with real font metrics and paginates. Every output reads the same layout document, so the screen, the PDF and the Excel file show the same report. pdf-lib and exceljs are loaded with dynamic `import()` the first time you export.

## Template format

A template is JSON. Lengths use the template `unit` (`mm`, `cm`, `in`, `pt` or `px`); font sizes and border widths are always points. See [`examples/shared/sales.template.json`](examples/shared/sales.template.json) for a complete report.

```jsonc
{
  "schemaVersion": 1,
  "name": "Sales",
  "unit": "mm",
  "locale": "en-US",
  "page": { "size": "A4", "orientation": "portrait", "margins": { "top": 10, "right": 10, "bottom": 10, "left": 10 } },
  "dataSources": [{ "name": "orders", "path": "sales.orders" }],
  "parameters": [{ "name": "title", "type": "string", "defaultValue": "Sales" }],
  "styles": { "heading": { "fontSize": 16, "fontWeight": "bold" } },
  "reportHeader": { "id": "rh", "height": 15, "components": [
    { "id": "title", "type": "text", "x": 0, "y": 0, "width": 190, "height": 10, "styleName": "heading", "text": "{{ params.title }}" }
  ]},
  "pageFooter": { "id": "pf", "height": 8, "components": [
    { "id": "pn", "type": "text", "x": 150, "y": 1, "width": 40, "height": 6, "style": { "textAlign": "right" }, "text": "Page {{ page.number }} of {{ page.count }}" }
  ]},
  "body": [{
    "kind": "dataRegion",
    "id": "orders_region",
    "dataSource": "orders",
    "sort": [{ "expression": "row.date", "direction": "asc" }],
    "groups": [{ "id": "by_customer", "expression": "row.customer", "header": { "id": "gh", "height": 8, "components": [] } }],
    "detail": { "id": "row", "height": 6, "components": [
      { "id": "total", "type": "text", "x": 150, "y": 0, "width": 40, "height": 6, "format": { "type": "currency", "currency": "USD" }, "text": "{{ row.total }}" }
    ]},
    "children": [{ "kind": "dataRegion", "id": "items", "relation": "items", "detail": { "id": "item", "height": 5, "components": [] } }]
  }]
}
```

### Bands

| Band | Printed |
| --- | --- |
| `reportHeader` / `reportFooter` | once, at the start / end of the report |
| `pageHeader` / `pageFooter` | on every page (`printOnFirstPage`, `printOnLastPage` to skip) |
| `body[]` static band (`"kind": "band"`) | once, in order |
| data region `header` / `footer` | before / after the rows (`repeatHeaderOnEachPage`) |
| group `header` / `footer` | when the group value changes (`pageBreakBefore` per group) |
| region `detail` | once per row |
| region `children[]` | nested regions after each row: `relation` (array field of the row) or another `dataSource` with a `filter` |

Band options: `height`, `canGrow` (default true), `canShrink`, `visible` (expression), `pageBreakBefore`, `pageBreakAfter`, `style` (`backgroundColor`, `border`). Region options: `filter`, `sort`. Groups sort rows by their key (`sortDirection`: `asc`, `desc`, or `none` to group consecutive rows).

### Components

All components have `id`, `x`, `y`, `width`, `height`, optional `name`, `styleName`, `style`, `conditions`, `visible` and `growToHeight`. With `growToHeight: true` a component stretches to the bottom of its band once the band height is known, so bordered table cells stay aligned when one cell grows.

| Type | Properties |
| --- | --- |
| `text` | `text` with `{{ }}` placeholders (`\{{` for a literal), `format`, `canGrow`, `wordWrap`, `allowHtml` |
| `image` | `src` (URL or data URI, may contain placeholders), `fit`: `contain`, `cover`, `fill`, `none` |
| `line` | `orientation`: `horizontal` or `vertical`; width, color and dash come from `style.border` |
| `rectangle` | `cornerRadius`; fill from `backgroundColor`, outline from `border` |

**Style** properties: `fontFamily`, `fontSize`, `fontWeight` (`normal`, `bold`), `fontStyle` (`normal`, `italic`), `textDecoration` (`none`, `underline`, `line-through`), `color`, `backgroundColor`, `textAlign` (`left`, `center`, `right`, `justify`), `verticalAlign` (`top`, `middle`, `bottom`), `padding`, `border` (`{ width, color, style: solid|dashed|dotted, sides }`). Colors are `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` or `transparent`. Named styles are applied first, then `style`, then each matching entry of `conditions: [{ expression, style }]`.

**Formats**: `{ "type": "number", "decimals", "thousandsSeparator", "prefix", "suffix" }`, `{ "type": "currency", "currency": "EUR", "decimals" }`, `{ "type": "percent", "decimals" }`, `{ "type": "date", "pattern": "dd/MM/yyyy HH:mm" }`. Date patterns support `yyyy yy MMMM MMM MM M dd d EEEE EEE HH H hh h mm m ss s SSS a` and `'quoted text'`. Add `"calendar": "persian"` (also `islamic`, `hebrew`, `buddhist`, `japanese`, `roc`) for non-Gregorian dates; numbers and dates use the locale's digits (۱۲۳ with `fa-IR`).

### HTML formatting in text

With `"allowHtml": true` a text component understands a small set of formatting tags, after placeholders are filled in (so data values may contain them too):

| Tags | Effect |
| --- | --- |
| `<b>`, `<strong>` | bold |
| `<i>`, `<em>` | italic |
| `<u>`, `<ins>` | underline |
| `<s>`, `<strike>`, `<del>` | line-through |
| `<br>` | line break |
| `<font color="red">` | text color (named, `#hex`, `rgb()`) |
| `<span style="…">` | `color`, `background-color`, `font-weight`, `font-style`, `text-decoration` |

```json
{ "id": "note", "type": "text", "allowHtml": true, "text": "Total: <b>{{ row.total }}</b><br><font color=\"#b91c1c\">overdue</font>" }
```

Entities (`&amp;`, `&lt;`, `&nbsp;`, `&#…;`) are decoded. Any other tag (`<script>`, `<img>`, `<a>`, …) is removed together with its attributes and only its text is kept. The markup is parsed into styled text runs, which the viewer renders as text nodes, so it is never inserted as HTML. The same runs drive line wrapping, the PDF (bold/italic fonts per run) and Excel (rich text cells).

### Validation

```ts
import { parseTemplate, validateTemplate } from '@ariana-reports/core';

const { valid, errors } = validateTemplate(json); // [{ path: 'body[0].detail.components[2].x', message: 'must be at least 0' }]
const template = parseTemplate(text); // throws TemplateValidationError
```

Validation checks structure, references (data sources, named styles), unique ids and the syntax of every expression.

## Expressions

Expressions are JavaScript, evaluated by a built-in interpreter. They never run through `eval` or `new Function`.

Supported: literals, template literals, arrays and objects, `.` / `[]` / `?.`, calls, arrow functions with expression bodies, `! - + typeof`, arithmetic, comparison, `&& || ??` and `? :`.

Not supported: assignment, statements, `new`, `this`, `function`, `class`, loops, regular expressions.

**Variables**

| Name | Meaning |
| --- | --- |
| `row` | current row (detail, group and child bands) |
| `rowNumber` | 1-based row number within the region |
| `rows` | all rows of the region, after filter and sort |
| `group` | `{ key, rows, count, index, level }` of the innermost group |
| `groups` | all active groups, outermost first |
| `parent` | the parent row inside a child region |
| `params` | parameter values |
| `page` | `{ number, count, regions }`; `page.regions.<regionId>` has `rows` (detail rows on this page), `before` (on earlier pages) and `through` (up to and including this page) |
| `report` | `{ name, description }` |
| `<dataSource>` | every data source by name, e.g. `orders` |

**Functions**: `sum avg min max count first last distinct` (each takes an array plus an optional field name or `r => …` selector), `round floor ceil abs`, `upper lower trim len left right`, `string number isNull isEmpty coalesce iif`, `now today date year month day addDays addMonths dateDiff`, `format formatNumber formatCurrency formatPercent formatDate`, `toWords(n)` and `toCurrencyWords(amount, currencyName, centsName)` (English, e.g. "Twelve Dollars And Fifty Cents"), and a safe `Math`. Strings, numbers, arrays and dates expose the usual read-only methods (`map`, `filter`, `reduce`, `join`, `toUpperCase`, `padStart`, `toFixed`, `getFullYear`, …); `sort` and `reverse` return copies.

**Safety**: expressions can only read own properties of your data. `window`, globals, prototypes and `constructor` are unreachable, functions found in the data cannot be called, and every evaluation has limits on steps, call depth, string length and array size. Your own functions can be added with the `functions` option:

```ts
generateReport(template, data, { functions: { vat: (n: number) => n * 0.09 } }); // {{ vat(row.total) }}
```

**Running totals per page**: `page.regions` makes brought-forward and carried-forward lines possible. Put the brought-forward line in a region header with `repeatHeaderOnEachPage` and `canShrink`, and the carried-forward line in the page footer:

```text
region header:  {{ sum(page.regions.lines.before, 'debit') }}   visible: page.number > 1
page footer:    {{ sum(page.regions.lines.through, 'debit') }}  visible: page.number < page.count
```

In body bands, `rows` and `through` only include rows placed so far on the current page; page headers and footers see the complete page. [`examples/shared/journal-entry.template.json`](examples/shared/journal-entry.template.json) is a full example.

An expression that fails at runtime shows `#ERROR` in its text box and is listed in `document.issues` (and in the viewer's Issues panel); the rest of the report still renders.

## Export

```ts
const doc = generateReport(template, data);
const pdf = await exportPdf(doc, { title: 'Sales', author: 'Finance' });
const xlsx = await exportExcel(doc, { sheets: 'single' }); // or 'perPage'
```

- **PDF** uses vector text and shapes. Without custom fonts it uses the 14 standard PDF fonts (Helvetica, Times, Courier), which cover Latin text. For other scripts, register a TTF/OTF font and use the same metrics for layout:

  ```ts
  const fonts = [{ family: 'Vazirmatn', data: await (await fetch('/fonts/Vazirmatn.ttf')).arrayBuffer() }];
  const measurer = await createFontMeasurer(fonts);
  const doc = generateReport(template, data, { measurer });
  const pdf = await exportPdf(doc, { fonts });
  ```

- **Excel** keeps numbers, currencies, percentages and dates as typed cells with matching number formats. In `single` mode all pages flow into one sheet without page headers/footers or repeated headers.
- **Images**: PNG and JPEG, from data URIs or URLs (fetched with `fetch`). Pass `loadImage` to control loading.

## Viewer and designer API

Both components are thin views over framework-neutral controllers in core, which you can also drive yourself:

- `ViewerController`: `load(template, data)`, `goToPage`, `nextPage`, `zoomIn`, `setZoomMode('fitWidth')`, `downloadPdf()`, `downloadExcel()`, `print()`, `subscribe()`.
- `DesignerController`: `addComponent`, `insertField`, `moveComponents`, `resizeComponent`, `align`, `distribute`, `addDataRegion`, `addGroup`, `addChildRegion`, `setPageBand`, `inferDataSourceFields`, `undo`, `redo`, `copy`, `paste`, `toJSON`, `load`, `preview`, `handleKey`, `subscribe()`.

Pass your own controller to a component with the `controller` prop, or use the `useViewer` / `useDesigner` hooks (React) and composables (Vue).

**Viewer pages**: the viewer shows all pages in one scrollable column (`viewMode="continuous"`, the default). Only the pages near the visible area are rendered, the page number follows the scroll position, and the navigation buttons and PageUp/PageDown/Home/End scroll to a page. Use `viewMode="single"` to show one page at a time. Without a framework, `new PageList(scrollElement, hostElement, { onPageChange })` gives you the same continuous view.

**Design surface**: page margins are drawn around the bands (toggle with the Margins button or `settings.showMargins`). Every band has an empty strip below it, so you can start a rubber-band selection even when components cover the whole band. Dragging components (one or a multi-selection) over another band moves them into that band; the target band is highlighted, and the move is one undo step.

Selected components show eight resize handles centered on their edges. With several components selected, every one shows its handles, and dragging any handle resizes all of them by the same amount (for example to make a whole table row taller). Double-click a text (or use the expand button next to the Text property) to edit it in a large dialog with formatting buttons and a searchable list of fields, variables and functions; Ctrl+Enter applies, Esc cancels, and the change is one undo step.

The alignment buttons in the designer toolbar align the content of the selected text boxes (left, center, right, justify; top, middle, bottom) and show the current alignment. Box positions can still be aligned and distributed with `controller.align()` / `distribute()`. A rubber-band selection can also start in the page margin or around the page; it selects in the band with the most hits.

**Fonts**: the font list shows Helvetica, Times and Courier, every family already used in the template, the families of `preview.pdf.fonts`, and anything passed in the designer's `fonts` prop:

```tsx
const fonts = [{ family: 'Vazirmatn', data: await (await fetch('/fonts/Vazirmatn.ttf')).arrayBuffer() }];
<ReportDesigner fonts={['Roboto']} preview={{ pdf: { fonts }, measurer: await createFontMeasurer(fonts) }} />
```

Listing a family only makes it selectable. The browser needs it (via `@font-face` in your app) to show it in the designer and viewer, and PDF export needs its file in `pdf.fonts`; without a file the PDF falls back to Helvetica.

Band captions use a dark color and the band area a light tint of it. Change it per band with the "Band color" property (stored as `designColor` on the band; it only affects the designer) or for all bands with the theme's `bandColor`.

### Theming (Material UI and others)

Every color, the corner radius and the font of the viewer and designer come from CSS custom properties. Pass a `theme` prop, or set the variables yourself in CSS (`.ar-root { --ar-primary: #6750a4; }`):

| Theme property | CSS variable | Used for |
| --- | --- | --- |
| `primary`, `onPrimary` | `--ar-primary`, `--ar-on-primary` | selection, focus rings, active buttons |
| `background` | `--ar-bg` | workspace behind pages |
| `surface`, `surfaceVariant` | `--ar-surface`, `--ar-surface-2` | toolbars, panels, section headers |
| `inputBackground`, `border` | `--ar-input-bg`, `--ar-border` | inputs and dividers |
| `text`, `textMuted`, `danger` | `--ar-text`, `--ar-muted`, `--ar-danger` | text, labels, errors |
| `radius`, `fontFamily`, `fontSize` | `--ar-radius`, `--ar-font`, `--ar-font-size` | shape and typography |
| `bandColor` | `--ar-band-color` | default band caption color in the designer |

In a MUI app, `themeFromMui` converts your MUI theme (palette, dark mode, `shape.borderRadius`, typography), so the report UI follows theme and dark-mode switches automatically:

```tsx
import { useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import { ReportDesigner, themeFromMui } from '@ariana-reports/react';

function Designer() {
  const muiTheme = useTheme();
  const theme = useMemo(() => themeFromMui(muiTheme, { bandColor: muiTheme.palette.grey[700] }), [muiTheme]);
  return <ReportDesigner theme={theme} template={template} sampleData={data} />;
}
```

`themeFromMui` reads only plain values from the theme object, so the packages do not depend on MUI. `DARK_THEME` is a ready-made dark preset for apps without MUI. Pages and the design surface stay white like paper in every theme.

### Languages

All UI text can be changed with the `labels` prop. For a complete translation pass `uiLocale` to the viewer and the designer. A Persian (Farsi) translation is built in; it also switches the toolbar and panels to right-to-left:

```tsx
<ReportDesigner uiLocale="fa" />
<ReportViewer uiLocale="fa" template={template} data={data} />
```

`uiLocale` accepts a code (`"fa"`, `"fa-IR"`) or a locale object. Register more languages once, then use them by code:

```ts
import { registerUiLocale, type UiLocale } from '@ariana-reports/core';

const de: UiLocale = {
  code: 'de',
  dir: 'ltr',
  labels: { print: 'Drucken', nextPage: 'Nächste Seite' /* … missing labels fall back to English */ },
  values: { bold: 'fett', portrait: 'Hochformat' }, // option values shown in select boxes
};
registerUiLocale(de);
```

`labels` overrides win over the locale. `uiLocale` only affects the UI; the report's number and date formatting comes from the template `locale` (or the viewer's `locale` prop). The design surface and the report pages stay left to right.

**Designer shortcuts**: arrows move (Shift or Alt for fine steps), Delete removes, Ctrl/Cmd+Z / Shift+Z / Y undo and redo, Ctrl/Cmd+C / X / V / D copy, cut, paste and duplicate, Ctrl/Cmd+A selects the band, Escape cancels a drag or clears the selection. Drag components and data fields onto bands; drag a band's bottom edge to resize it.

## Security notes

- Templates are validated and expressions are sandboxed, so templates from users cannot run code in your page.
- The viewer only renders text with `textContent` (including `allowHtml` text, which is parsed into styled runs, never inserted as HTML) and only loads images from `http(s)`, `blob:`, raster `data:image/…` and relative URLs (`allowImageSrc` to customize). SVG data URIs and `javascript:` URLs are rejected.
- Image URLs in templates are fetched by the browser during viewing and export. If templates come from untrusted users, restrict them with `allowImageSrc` and `loadImage`.
- Everything runs in the browser. Nothing is sent to a server unless your `onSave` handler does it.

## Known limitations (v1)

- A band that does not fit on a page moves to the next page; bands taller than a page are clipped (with a warning).
- Standard PDF fonts cover Latin text only; other scripts need a custom font. Arabic-script text (Persian, Arabic) shows correctly on screen but is not shaped or reordered in PDF files yet, and right-to-left text layout inside reports is not supported yet (the viewer and designer UI do support right-to-left with `uiLocale`).
- Images must be PNG or JPEG.
- The standard font metrics (about 130 kB) are bundled with the layout engine, because text is measured during layout.

## Development

Requires Node.js 22.12+. pnpm runs through corepack:

```bash
corepack pnpm install
corepack pnpm check        # build, typecheck and test every package
corepack pnpm dev:react    # React demo (examples/react-demo)
corepack pnpm dev:vue      # Vue demo (examples/vue-demo)
```

The demos use the package sources directly, so they run without a build. Both offer two sample reports: "Sales by customer" and a multi-page "Journal entry".

### Publishing

See [RELEASING.md](RELEASING.md).

## License

MIT
