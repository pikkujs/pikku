## 0.12.0

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
