## 0.12.16

### Patch Changes

- 6afdfcb: refactor: rip plan layer, replace with branch-based diff view + new CLI commands
  - Removes the `AiPlanV1` JSON plan-layer scaffolding (`pikku plan
ingest/update/validate`, `LocalPlanStoreService`, `/plans` console
    pages).
  - Replaces with a `StateDiffService` that diffs two `.pikku/`
    directories' meta JSONs (typically a worktree at `main` vs. the
    current branch), exposed via `console:getStateDiff` and a new
    `/changes` console page with per-category tabs and field-level diff.
  - New `pikku meta` and `pikku skills` CLI commands.
  - `cli-logger` json output goes to stderr so command data piping
    (e.g. `pikku meta --json | jq`) stays clean.
  - `templates/functions/pikku.config.json` declares `metaService`,
    `stateDiffService`, and `codeEditService` as
    `serverlessIncompatible` so they're filtered from serverless bundles.

- Updated dependencies [f72a820]
- Updated dependencies [d484d0c]
  - @pikku/fetch@0.12.2
  - @pikku/core@0.12.21

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
