# Releasing

The three packages (`@ariana-reports/core`, `/react`, `/vue`) are versioned together with [Changesets](https://github.com/changesets/changesets).

## One-time setup

1. Create a free npm organization named `ariana-reports` (npmjs.com → profile → Add Organization → free plan, public packages). Your personal account becomes its owner and can publish to it.
2. Fill in the placeholders (GitHub user, author name, site URL):
   ```bash
   corepack pnpm configure --owner <github-user> --author "Your Name" --site https://<site>.netlify.app
   ```
3. Create the GitHub repository and push.
4. After the first manual publish, turn on **trusted publishing** for each package (`core`, `react`, `vue`), so the release workflow can publish without a token: npmjs.com → the package → **Settings** → **Trusted Publisher** → GitHub Actions, with user `Behnam1369`, repository `ariana-reports`, workflow `release.yml`, environment empty. The workflow installs npm 11 (trusted publishing needs npm 11.5.1 or later) and has the `id-token: write` permission. No `NPM_TOKEN` secret is needed.

## First release (0.1.0), by hand

Log in to npm first (see "If `npm login` fails" below), then:

```bash
npm whoami                           # must print your npm user name
corepack pnpm verify                 # build, typecheck, tests, publint, attw, size budget
corepack pnpm -r --filter "./packages/**" publish --access public --dry-run
corepack pnpm -r --filter "./packages/**" publish --access public
```

Provenance (the verified badge on npm) only works from GitHub Actions, so the release workflow turns it on; a manual publish does not use it.

`prepublishOnly` refuses to publish while placeholders remain or `dist` is missing. pnpm replaces `workspace:*` with the real version.

## Staged publishing: approve the release on npmjs.com

npm now holds new releases in a stage queue. `publish` finishing without an error does **not** make the version installable: until you approve it, only a placeholder version `0.0.0-stage` is public. Approve each package with 2FA:

1. Open npmjs.com → your profile or the `ariana-reports` organization → the package → **Staged Packages** tab.
2. Check the version and files, then click **Approve** (2FA code required). Do this for `core`, `react` and `vue`.
3. Confirm: `npm view @ariana-reports/core version` should print the new version.

With npm CLI 11.15 or newer you can also run `npm stage list` and `npm stage approve <stage-id>`. The same approval step applies to releases published from GitHub Actions.

## Later releases

1. In each pull request that changes behavior run `corepack pnpm changeset` and commit the file.
2. Merging to `main` makes the release workflow open a "Version packages" pull request (versions, changelog, `VERSION` constant; script `version-packages`).
3. Merging that pull request publishes all three packages to npm with provenance.

The documentation site deploys from `main` on Netlify; see `apps/docs/README.md`.

## If `npm login` fails

`npm login` opens a browser for the login. In WSL or a remote shell there is no browser, so the command fails when you press ENTER. Either:

- copy the login URL that npm prints, open it in any browser, finish the login there, and leave the terminal waiting; or
- skip `npm login` and use a token: on npmjs.com open *Access Tokens → Generate New Token → Granular Access Token*, give it **Read and write** access to the `@ariana-reports` scope (and enable "Bypass 2FA" if you use two-factor authentication), then run
  ```bash
  npm config set //registry.npmjs.org/:_authToken=PASTE_THE_TOKEN
  npm whoami
  ```
  The token is stored in `~/.npmrc` on your machine only. Never commit it or paste it into a chat; delete the token on npmjs.com when you are done.
