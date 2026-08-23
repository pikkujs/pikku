## 0.12.6

### Patch Changes

- 6ff72d3: Raise the supported Bun version to 1.4.

  `@pikku/bun-server` and `@pikku/kysely-bun-sqlite` now declare `engines.bun: >=1.4.0`
  and build against `@types/bun@^1.4.0`. `create-pikku` scaffolds
  `"packageManager": "bun@1.4.0"`, and the fabric `smoke`/`validate` commands default to
  and recommend the same version. CI pins `oven-sh/setup-bun` to 1.4.0 instead of
  tracking `latest`.

## 0.12.5

### Patch Changes

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 0c93a37: fix(create): retry a template download that failed on a blip

  `create-pikku` asked api.github.com for a template tarball exactly once. A 504
  from it — which that endpoint returns often enough to matter — ended the
  scaffold with "Failed to download templates", and in CI that reads as a broken
  pull request rather than as the weather.

  Transient failures (5xx, 429, connection resets, `fetch failed`) are now
  retried three times with backoff. A 404 is not transient: a template or branch
  that is genuinely gone still fails on the first attempt, so a deleted branch
  reports immediately instead of after a round of retries.

- 26b29e1: Scaffold every template onto the `#pikku` alias

  Templates are the one tree copied verbatim into a user's project, so whatever
  they import is what every new Pikku app starts life importing. They reached
  generated output through relative paths — `../../functions/.pikku/…` in a
  runtime template, `../../.pikku/…` inside the functions template — which taught
  the wrong habit and broke as soon as `create-pikku` relocated the directory,
  as it does for StackBlitz.

  Those specifiers now go through `#pikku/…`, resolved by tsconfig `paths`. A
  runtime template points at the functions template next door, and `paths` is the
  only mechanism that reaches it: Node rejects an internal-imports target that is
  not `./`-relative or a bare package specifier, so a `../` target throws
  `ERR_INVALID_PACKAGE_TARGET` rather than resolving. Only `functions` and
  `function-addon`, which own the `.pikku` they point at, carry an `imports` map.

  `templates/bun` keeps its relative path. Bun treats a `#`-prefixed specifier as
  a Node subpath import and does not apply `paths` to it, so neither half of the
  alias reaches next door; it needs a workspace dependency on the functions
  template to make a bare specifier a legal target, which is a separate change.

  Two guards in `template-alias-surface.test.ts` hold the shape: no template
  reaches generated output through a relative path, and no template declares an
  `imports` target Node will reject.

## 0.12.4

### Patch Changes

- 637e668: State every package's license in the package itself.

  Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

  `@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.

- def0f17: Stop stamping today's date into a scaffolded project's `wrangler.toml`.

  `wranglerChanges` rewrote `compatibility_date` to the current date, which a released `workerd` can never honour — it lags the calendar, and answers `This Worker requires compatibility date "<today>", but the newest date supported by this server binary is "<earlier>"`, then fails to start. So `wrangler dev` was broken in every freshly created cloudflare project, and pikku's own cloudflare template CI jobs failed for the same reason.

  The template's pinned `compatibility_date` is now left alone, matching how `@pikku/deploy-cloudflare` pins its own `COMPAT_DATE`. Bumping it stays a deliberate act, which is what a compatibility date is for.

## 0.12.3

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.2

### Patch Changes

- f3f3031: Add `fabric` template — clones `pikkujs/starter-template` verbatim, then prompts for the frontend scaffold to keep (react-vite-mantine static or nextjs-tailwind SSR) and removes the others. Backend (functions + sdk + sql) is always retained.

## 0.12.0

## 0.12.1

### Patch Changes

- 4e52200: Add \_\_raw CLI channel handler for server-side arg parsing. Enables WebSocket CLI clients to send raw args without needing client-side command metadata.

### New Features

- New templates for AI agents, workflows, and remote RPCs

## 0.11.0

## 0.11.2

### Patch Changes

- db9c7bf: Fix srcDirectories paths and config cleanup for workflow templates

### Fixes

- ddd87eaf: Fix srcDirectories paths and config cleanup for workflow templates

## 0.11.1

### Patch Changes

- 1d064c5: feat: using pikku cli to drive the pikku cli

### Minor Changes

- Add workflows-bullmq and workflows-pg-boss templates

# create-pikku

## 0.10.1

### Patch Changes

- c6f9bb9: Update WebSocket client and create-pikku for channel middleware

  **Updates:**
  - Update WebSocket client to handle channel middleware properly
  - Update create-pikku template generation for channel configurations
  - Improve template utilities and tests

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.5

### Patch Changes

- 7e1f9a2: create: run pikku silently on start to reduce noise

## 0.9.4

### Patch Changes

- a5c2eff: feat: run sse and other tests on initial start to ensure setup correctly

## 0.9.3

### Patch Changes

- 6ff2f99: fix: stackblitz doesnt like hidden folders, so generate pikku in another

## 0.9.2

### Patch Changes

- fdb1593: feat: adding silent option to cli
- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- 22a1d7a: feat: adding remaining templates

## 0.9.1

### Patch Changes

- bb5803b: feat: adding stackblitz compatability

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updated for 0.8.0 compatibility with new project templates

## 0.0.12

### Patch Changes

- 378e46c: fix: invalid yarnlink check

## 0.0.11

### Patch Changes

- 2a000ea: fix: include the .pikku folder in the root directory in tsconfig to pickup schemas

## 0.0.10

### Patch Changes

- 412f136: updating local content service

## 0.0.9

### Patch Changes

- 60b2265: refactor: supporting request and response objects

## 0.0.8

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels

## 0.0.7

### Patch Changes

- d037fa1: fix: create dir for non templates
- de4a36b: refactor: renaming serverless templates to aws-lambda

## 0.0.6

### Patch Changes

- 49182d6: refactor: allowing nextjs-app to be created via create cli

## 0.0.5

### Patch Changes

- f8881ee: fix: run @pikku/cli correctly after create

## 0.0.4

### Patch Changes

- 615740e: fix: only ask for the version via the cli line

## 0.0.3

### Patch Changes

- dbbd304: feat: better support of yarn monorepo

## 0.0.2

### Patch Changes

- bdcc89a: feat: adding intro logo to cli based commands
- cb7bfdc: chore: remove ncu and tsc from packages

## 0.0.1

### Patch Changes

- 4a4a55d: fix: adding missing commander package
