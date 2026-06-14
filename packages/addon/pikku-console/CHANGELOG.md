## 0.12.13

### Patch Changes

- f95dd07: feat(console): add an HTML tab to the email preview with an inline source editor

  The email preview now has a Desktop | Mobile | HTML toggle. The HTML tab shows the
  raw template source (`templates/<name>.html`) in a CodeMirror editor with a Save
  button that writes the file back via a new `console:updateEmailTemplate` RPC
  (local-dev only, mirrors `updateFunctionBody`), so small edits can be made from the
  console without leaving the preview. Saving invalidates and re-renders the preview.
  - `renderEmailPreview` now returns `source` (the un-rendered template HTML) so the
    editor binds to the source, never the rendered output.

- 409ec80: feat(console): Tests page with live SSE streaming and function test harness
  - `@pikku/addon-console`: add `streamFunctionTests` SSE function that runs the
    cucumber/c8 test harness and streams structured per-scenario events
    (scenario-start, step, scenario-done, done)
  - `@pikku/console`: TestsPage live run view — renders scenario names and step
    status in real time during a test run via SSE; adds `usePikkuSSE` hook and
    `showRunButton` prop
  - `@pikku/fetch`: add `subscribePikkuSSE` helper for typed server-sent event
    streams
  - `@pikku/cli`: wire SSE-returning functions through the console serialiser and
    RPC wrapper so the stream route is included in generated clients

- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.12

### Patch Changes

- 5093725: runFunctionTests throws a descriptive error when tests dir is missing instead of returning null; db-codegen formatting reflow

## 0.12.11

### Patch Changes

- cd237c3: fix(pikku-console): use correct `tests` dir and `.coverage` output path in runFunctionTests

## 0.12.10

### Patch Changes

- fd61eb0: **Database schema visualizer in the OSS console.**

  A new `/database` route renders an interactive flowchart of your local development database directly in the pikku console.

  Changes:
  - `@pikku/addon-console`: new `console:getDbSchema` RPC backed by `DbSchemaService`. Introspects SQLite (Node 22+ built-in `node:sqlite`) or Postgres (`pg`, resolved via `DATABASE_URL` / `POSTGRES_URL`). Foreign-key edges are inferred from `PRAGMA foreign_key_list` (SQLite) or `information_schema` (Postgres). Classification data is merged from `db/annotations.gen.json` when present.
  - `@pikku/console`: new `DatabasePage` with a ReactFlow/ELK layout canvas. Columns are colour-coded by classification (public = teal, private = orange, secret = red). Includes a hide-internal-tables toggle and a refresh button.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.9

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- 9060165: New `pikku tests init` scaffolds a Cucumber BDD test harness in your functions package. The companion `@pikku/cucumber` package provides the world, hooks, step library, and database utilities — wiring real Pikku RPC dispatch against an in-process SQLite copy seeded from migrations. `pikku tests coverage` generates per-function coverage summaries, surfaced in the console.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.12.0

## 0.12.8

### Patch Changes

- fbcf5b9: Console UX improvements: syntax highlighting for all code blocks, schema-aware client usage snippets for HTTP routes, HTTP tab sidebar layout, CLI/channel breadcrumb cleanup, detail panel max-width constraint
- Updated dependencies [fbcf5b9]
  - @pikku/core@0.12.16

## 0.12.7

### Patch Changes

- 624097e: Add deploy pipeline with provider-agnostic architecture
  - Add MetaService with explicit typed API, absorb WiringService reads
  - Add deployment service, traceId propagation, scoped logger
  - Rewrite analyzer: one function = one worker, gateways dispatch via RPC
  - Add Cloudflare deploy provider with plan/apply commands
  - Add per-unit filtered codegen for deploy pipeline
  - Skip missing metadata in wiring registration for deploy units
  - Fix schema coercion crash when schema has no properties
  - Fix E2E codegen: double-pass resolves cross-package Zod type imports

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [7ab3243]
  - @pikku/core@0.12.15

## 0.12.6

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- Updated dependencies [f85c234]
- Updated dependencies [88d3100]
  - @pikku/core@0.12.14

## 0.12.5

### Patch Changes

- Fix publish: ensure dist/.pikku/ generated files are included in the published package

## 0.12.4

### Patch Changes

- Fix `#pikku` import alias: use conditional exports so published package resolves to compiled `dist/.pikku/pikku-types.gen.js` at runtime while keeping `.ts` for types during development

## 0.12.3

### Patch Changes

- Fix publish: exports now point to compiled dist/.pikku/ instead of root .pikku/ (TS-only), ensuring consumers can import .pikku/pikku-bootstrap.gen.js
- Remove redundant cp in build script that was overwriting compiled JS with source TS

## 0.12.2

### Patch Changes

- 387b2ee: Add agent thread/run management functions, workflow run streaming, and refactor services to receive DB services from host app
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.1

### Patch Changes

- 62a8725: Console UI improvements:
  - Add markdown rendering for addon detail pages
  - Add shared `ProjectSecrets` and `ProjectVariables` components to addon detail view
  - Show `Addon Service Not Running` status when an addon RPC endpoint is unreachable
  - Visual polish: unified badges, subtler borders, larger base rem
  - Fix dark mode colours throughout (CLI page, anchor colours, border variables)
  - Hide anonymous middleware/permission instances from the list view; add route table descriptions
  - Update documentation links to point to the correct pikku.dev URLs

- a83efb8: Handle OPTIONS preflight requests automatically in fetchData when no explicit OPTIONS route is matched. Runs global HTTP middleware (e.g. CORS) and returns 204. Remove redundant startWorkflowRun and streamAgentRun pass-through functions from addon-console.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [e04531f]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1
  - @pikku/pg@0.12.1

### New Features

- Initial release of `@pikku/external-console` — backend functions for Pikku Console
- `console:getAllMeta` aggregates all project metadata into a single RPC call
- Workflow run management (start, stream, list, delete)
- Agent thread and run management with streaming support
- Schema introspection service
- External package icon and metadata service
- OAuth2 credential connect/disconnect/status/refresh flows
- Secrets and variables read/write functions
