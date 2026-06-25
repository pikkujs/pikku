## 0.12.26

### Patch Changes

- 49b1eeb: feat(console): cleaner email preview & editor design

  Redesign the EmailsPage preview/editor:
  - Replace the Popover/SegmentedControl template + mode selectors with `Select`
    dropdowns and a `PikkuSwitch` for preview mode (desktop/mobile/html/text),
    with matching i18n strings.
  - Add a syntax-highlighted, theme-aware HTML source view using
    `@codemirror/lang-html` + `@codemirror/theme-one-dark`, following the app
    colour-scheme tokens.
  - Add a vite resolver so generated `pikku-fetch`/`pikku-rpc` client imports
    resolve to their `.ts` sources in the console dev build.

## 0.12.25

### Patch Changes

- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.
- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
  - @pikku/core@0.12.37

## 0.12.24

### Patch Changes

- 5783ff5: Extract `getServerUrl`/`setServerUrl` into a standalone, unit-tested `serverUrl` module (now defaults to the current origin instead of hardcoded localhost) and move test-stream error handling into a tested `testsStreamError` helper. Adds a clearer empty state + `pikku tests init` hint when no function-test harness is found, and proxies `/function-tests` and `/workflow-run` in the console dev server.
- Updated dependencies [f6adc1c]
- Updated dependencies [ade6f0b]
  - @pikku/core@0.12.36
  - @pikku/fetch@0.12.4

## 0.12.23

### Patch Changes

- e11a963: PikkuHTTPProvider: add a `credentials` prop (default `'include'`) that flows
  through to the underlying pikku instance, including the `usePikkuSSE` fetch.
  Cross-origin bearer-token setups (e.g. Fabric's sandbox runtime, served behind
  wildcard CORS without `Access-Control-Allow-Credentials`) can now pass
  `credentials="omit"` so the SSE/HTTP fetch isn't rejected at the CORS preflight.
  Same-origin cookie-auth consumers are unaffected by the default.
- 7be656f: Fix the email HTML tab overflowing its parent: CodeMirror had no width constraint, so long lines sized the editor to content and grew the preview panel past its container. Set CodeMirror `width="100%"` and add `minWidth: 0` down the flex chain so the editor scrolls internally instead of widening the layout.

## 0.12.22

### Patch Changes

- 5283434: Redesign the Addons → Community tab as a card gallery: a hero banner, a category rail derived from addon metadata, a sort bar, and addon cards (category icon, publisher badge, tags, function/agent stats, install action). Selecting a card opens a right-hand detail drawer with an Overview ("What's included" surface tiles + publisher) and Functions tab, replacing the full-page navigation. Installed and APIs tabs are unchanged.

  The community catalog now reads from the Fabric registry API (`FABRIC_API_URL`, default `https://api.pikkufabric.com`) via `/registry/packages` instead of the standalone registry.

- 5283434: Add `ShellHeader`: a responsive single-bar page header that replaces the tall title + action-bar block. Title (first to collapse) and count on the left; filters, search, selection switch and actions on the right. Filters that don't fit collapse into a funnel → drawer (search is the last to fold), action labels degrade to icons, and the selection switch becomes a cycling button when narrow — all measured, not breakpointed. Also exports `PikkuSwitch`/`PikkuSwitchOption`.
- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.21

### Patch Changes

- a027a8e: feat: emit auth provider + plugin metadata as `auth-meta.gen.json` for the console SSO page

  The enabled social providers and Better Auth plugins are now extracted statically
  and written to a generated `auth-meta.gen.json`, replacing the runtime
  `setAuthRegistry`/`getAuthRegistry` approach — so the console can show them without
  evaluating the Better Auth factory.
  - **inspector**: the `pikkuBetterAuth` inspector now reads the `plugins` array from
    the `betterAuth({ ... })` config and records each plugin id (the callee name of
    each `plugins: [organization(), bearer()]` entry) on the auth definition.
  - **cli**: `pikku auth` (and `pikku all`) emit `auth/pikku-auth-meta.gen.json` (path
    configurable via `authMetaJsonFile`) containing `basePath`, `hasCredentials`, the
    enabled `providers` (`id` + `displayName` + `secretId`), and the enabled `plugins`
    (`id` + `displayName`). The previous `setAuthRegistry(...)` runtime wiring is
    removed from the generated `auth.gen.ts`.
  - **better-auth**: exports a `PLUGIN_REGISTRY` and `pluginDisplayName(id)` helper so
    plugin ids resolve to human-readable names.
  - **core**: removes the unreleased `setAuthRegistry`/`getAuthRegistry` runtime auth
    registry (now superseded by `auth-meta.gen.json`).
  - **addon-console**: `getAuthProviders` reads `auth-meta.gen.json` and returns the
    configured providers, plugins, and `hasCredentials` flag.
  - **console**: the Auth Providers (SSO) page fetches `console:getAuthProviders` and
    marks each provider configured/unconfigured, lists email+password credentials as a
    provider, and shows the enabled Better Auth plugins.

- a027a8e: fix: address Better Auth review findings (secret/variable batch typing, auth init, guards)
  - **core**: `SecretService.getSecrets` / `VariablesService.getVariables` (and the
    Local/Typed/Scoped/AWS implementations) now return `Partial<T>`, honestly
    reflecting that missing keys are omitted at runtime rather than typing partial
    data as fully populated. `ScopedSecretService.getSecrets` now throws on a
    disallowed key instead of silently filtering it out.
  - **cli**: the generated `services.auth()` thunk clears its memoised promise on
    rejection, so a transient Better Auth/Kysely startup failure no longer
    permanently poisons auth for the process lifetime.
  - **inspector**: the `pikkuBetterAuth` export guard now requires an exported
    `const` (rejects `export let`/`export var`), matching its error message.
  - **console**: the Microsoft auth provider's `callbackId` is `microsoft` (the
    Better Auth provider id) rather than `microsoft-entra-id`.

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/core@0.12.32

## 0.12.20

### Patch Changes

- 4a7fc67: fix(console): use the shared ResizablePanelLayout + ListPageHeader for the selected-template email view instead of a bespoke flexColumn/100vh shell, so it gets the standard page header (and headerRight action) and fills its container when embedded
- d984ce3: fix(console): fill parent container instead of forcing 100vh in ResizablePanelLayout and ThreePaneLayout so the layouts work when embedded
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
- Updated dependencies [409ec80]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30
  - @pikku/fetch@0.12.3

## 0.12.19

### Patch Changes

- 6180ddb: Add `headerRight` prop to `EmailsPage` so callers can inject a refresh button or other controls into the page header.
- Updated dependencies [f4f7046]
  - @pikku/assistant-ui@0.12.6

## 0.12.18

### Patch Changes

- fd61eb0: **Database schema visualizer in the OSS console.**

  A new `/database` route renders an interactive flowchart of your local development database directly in the pikku console.

  Changes:
  - `@pikku/addon-console`: new `console:getDbSchema` RPC backed by `DbSchemaService`. Introspects SQLite (Node 22+ built-in `node:sqlite`) or Postgres (`pg`, resolved via `DATABASE_URL` / `POSTGRES_URL`). Foreign-key edges are inferred from `PRAGMA foreign_key_list` (SQLite) or `information_schema` (Postgres). Classification data is merged from `db/annotations.gen.json` when present.
  - `@pikku/console`: new `DatabasePage` with a ReactFlow/ELK layout canvas. Columns are colour-coded by classification (public = teal, private = orange, secret = red). Includes a hide-internal-tables toggle and a refresh button.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.17

### Patch Changes

- 6da42b8: Add consistent empty state system, responsive list page header, and WebSocket routing for console RPCs
- Updated dependencies [909eb25]
  - @pikku/core@0.12.26

## 0.12.16

### Patch Changes

- 9060165: The console now shows function version history, live queue depths with a Failed column, and scheduler last-run status with run history. Workflow canvas and run selector have been polished. The console build is ~6.5× faster thanks to a switch to rolldown-vite (Vite 7 + Oxc React transform).
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
  - @pikku/assistant-ui@0.12.5
  - @pikku/fetch@0.12.2

## 0.12.0

## 0.12.15

### Patch Changes

- 5c98fd1: Show the empty-state placeholder on `AgentsPage` and `WorkflowPage` when the project has no agents or workflows, instead of rendering the panel layout with a blank detail pane. Placeholder also gets a `minHeight` so it renders consistently.
- Updated dependencies [424c777]
- Updated dependencies [311c0c4]
  - @pikku/assistant-ui@0.12.4
  - @pikku/core@0.12.18

## 0.12.14

### Patch Changes

- c5c8975: Highlight MCP tools, resources, and prompts missing descriptions

## 0.12.13

### Patch Changes

- fbcf5b9: Extract shared UI components (MetaRow, SectionLabel, ListDetailLayout, GridHeader, ListItem, DetailHeader, EmptyState, SearchInput, TagBadge, ValText) with CSS module for composability. Rename PageClient components to TabContent and move to tabs/. All shared components exported from package index.
- fbcf5b9: Major console redesign: icon rail sidebar, split-panel layouts for all tabs (Functions, MCP, Schedulers, Triggers, Queues, HTTP, Channels, CLI), theme overhaul with consistent badges/schema tables, tabbed API explorer with code snippets, and streamlined page headers.
- Updated dependencies [fbcf5b9]
  - @pikku/core@0.12.16

## 0.12.12

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
  - @pikku/assistant-ui@0.12.3

## 0.12.11

### Patch Changes

- f94afcc: Fix console hook RPC names to match scaffolded function names. Update pikku.config.json to use scaffold entries for console and workflow instead of addons config.
- 57a27ec: Fix secrets and variables RPC calls to use console: prefix
- 9da8d0f: Publish @pikku/console as a source-only package for consumers to build with their own Vite config. Adds customizable branding via VITE_CONSOLE_TITLE and VITE_CONSOLE_LOGO env vars.
- Updated dependencies [cc4a8e0]
- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/assistant-ui@0.12.2
  - @pikku/core@0.12.10

## 0.12.10

### Patch Changes

- 87433f0: Add schema name validation in SchemaService to prevent path traversal attacks.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [3fbd05c]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9
  - @pikku/fetch@0.12.1

## 0.12.9

### Patch Changes

- Updated dependencies [09491c6]
  - @pikku/core@0.12.8

## 0.12.8

### Patch Changes

- Updated dependencies [66519c9]
  - @pikku/core@0.12.7

## 0.12.7

### Patch Changes

- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.6

### Patch Changes

- Updated dependencies [198e68f]
  - @pikku/core@0.12.5

## 0.12.5

### Patch Changes

- Updated dependencies [688b5e8]
  - @pikku/core@0.12.4

## 0.12.4

### Patch Changes

- Make console components reusable across different frameworks (Next.js, Vite, etc.)
- Add router abstraction layer (`ConsoleRouter` context) replacing direct `react-router-dom` imports across all 26 component files
- Export all components, providers, hooks, and pages from package entry point
- Add `reactRouterAdapter` for Vite/React Router consumers
- Make `Sidebar` configurable with `sections`, `branding`, and `footer` props (defaults to existing nav)
- Make `AppLayout` accept `sidebar` prop for customization
- Add `PikkuHTTPProvider` `serverUrl` prop to allow host apps to provide the backend URL
- Move `react-router-dom` to optional peer dependency
- Add `./styles` and `./adapters/react-router` package exports

## 0.12.3

### Patch Changes

- e9672a0: Add `@pikku/addon-workflow-screenshot` addon — renders workflow diagrams as images using Playwright and the Pikku Console's React Flow renderer. Add `/render/workflow` route to the console for headless screenshot capture. Increase node label spacing in FlowNode.
- 387b2ee: Add agent playground with model/temperature overrides, installed/community addon tabs, and workflow canvas improvements
- Updated dependencies [387b2ee]
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/assistant-ui@0.12.1
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

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
  - @pikku/websocket@0.12.1

### New Features

- Initial release of `@pikku/console` — visual explorer for Pikku project metadata
- Browse functions, workflows, agents, APIs, jobs, runtime services, and configuration
- Dark/light theme support
- Spotlight search across all resources
- Workflow and channel canvas visualizations
- Agent playground with streaming chat
- OAuth2 credential management UI
- Secrets and variables management
