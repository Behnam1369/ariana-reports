# ariana-report

A frontend-only, open-source banded reporting toolkit.

- Report templates are plain **JSON** files.
- Data sources are **JSON** (arrays/objects).
- Expressions are **JavaScript**, evaluated in a safe sandbox.
- Includes a **report viewer** and a **report designer**.
- Exports to **PDF** and **Excel (.xlsx)** entirely in the browser.
- Works with **React 19** and **Vue 3**.

## Packages

| Package | Description |
| --- | --- |
| `@ariana-report/core` | Framework-agnostic engine: template model, expressions, layout, PDF/Excel export |
| `@ariana-report/react` | React 19 viewer and designer components |
| `@ariana-report/vue` | Vue 3 viewer and designer components |

## Development

Requires Node.js 22.12+. pnpm is used through corepack:

```bash
corepack enable          # or prefix commands with `corepack pnpm`
pnpm install
pnpm build               # build all packages
pnpm typecheck           # type-check all packages
pnpm test                # run all tests
```

## License

MIT
