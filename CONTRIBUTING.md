# Contributing

Thanks for helping! Bug reports, documentation fixes and features are all welcome.

## Setup

Requires Node.js 22.12+. pnpm runs through corepack:

```bash
corepack pnpm install
corepack pnpm check          # build, typecheck and test every package
corepack pnpm dev:react      # React demo
corepack pnpm dev:vue        # Vue demo
corepack pnpm --filter docs dev   # documentation site and playground
```

## Layout

- `packages/core`: engine, viewer/designer controllers, shared UI styles. Framework independent.
- `packages/react`, `packages/vue`: thin views over the core controllers. A UI change usually needs both.
- `apps/docs`: documentation site (Astro Starlight) with live React and Vue demos and the playground.
- `examples`: small Vite demo apps and the shared sample reports.

## Pull requests

- Keep React and Vue in step: same props, same labels, same behavior, and tests in both.
- Add or update tests. Run `corepack pnpm verify` before pushing.
- New user-facing text goes into `packages/core/src/ui/labels.ts` and the Persian translation in `ui/locales/fa.ts` (the test suite checks that both have the same keys).
- Run `corepack pnpm changeset` for changes that should appear in the changelog.
- Documentation examples must show both React and Vue.

## Security

Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).
