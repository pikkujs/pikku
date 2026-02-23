## 0.12.0

## 1.0.0

### Patch Changes

- 7dd13cc: Remote RPCs, deployment service, workflow improvements, and credential-to-secret rename

  **@pikku/core:**

  - Added `DeploymentService` interface and `rpc.remote()` for cross-server RPC calls
  - Added `workflow()`, `workflowStart()`, `workflowStatus()`, and `graphStart()` HTTP helpers for wiring workflows to routes
  - Added `WorkflowRunNotFoundError` with 404 status mapping
  - Added `defineCLICommands` and `defineChannelRoutes` for external composition
  - Renamed all `forge` naming to `node` across the codebase
  - Renamed `credential` to `secret` across core types
  - Added variable wiring system with `pikkuExternalConfig`
  - Made `createWireServices` and `createConfig` optional across all runtimes
  - Enforced auth by default for `pikkuFunc` based on sessionless metadata
  - Merged `wireForgeNode` into `pikkuFunc`/`pikkuSessionlessFunc` as inline `node` config
  - Added `disabled: true` support to all wirings and functions
  - Excluded trigger/channel functions from `addFunction` registration
  - Removed precomputed workflow wires index from state

  **@pikku/inspector:**

  - Fixed `workflow()` helper generating wrong `pikkuFuncId` (used raw name instead of `workflow_` prefix)
  - Added support for extracting `disabled`, `node` config, and workflow helper function names
  - Split trigger meta into separate meta and sourceMeta structures

  **@pikku/cli:**

  - Added remote-rpc workers generation
  - Extracted external types into `external/pikku-external-types.gen.ts`
  - Removed service metadata generation (`.pikku/services/`)
  - Added `TypedVariablesService`/`TypedSecretService` generation
  - Fixed optional `existingServices` handling in `pikkuExternalConfig`/`pikkuExternalServices`
  - Handled `z.date()` in Zod JSON Schema generation

  **@pikku/pg:**

  - Added `PgDeploymentService` for PostgreSQL-based service discovery
  - Retry init on failure

  **@pikku/redis:**

  - Added `RedisDeploymentService` with sorted-set-based function indexing and heartbeat TTL

  **Runtimes (all):**

  - Made `createWireServices` and `createConfig` optional

- Updated dependencies [6cb7e98]
- Updated dependencies [7c1f909]
- Updated dependencies [6cb7e98]
- Updated dependencies [6cb7e98]
- Updated dependencies [7dd13cc]
- Updated dependencies [581fe3c]
  - @pikku/core@0.12.0

### New Features

- `createWireServices` and `createConfig` are now optional

## 0.11.0

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Workflow support

# @pikku/cloudflare

## 0.10.1

### Patch Changes

- 730adb6: Update runtime adapters for channel middleware support

  **Updates:**

  - Update Cloudflare hibernation WebSocket server for middleware changes
  - Update Fastify response convertor for improved channel handling
  - Update MCP server for channel middleware support
  - Update Next.js runtime adapter for channel improvements

- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.2

### Patch Changes

- 906ab7e: feat: giving eventhub service a namespace to allow multiple ones
- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.7

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.6

### Patch Changes

- a234e33: fix: regressions in channels due to user session changes

## 0.6.5

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- 8a14f3a: refactor: removing user session from channel object
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.4

### Patch Changes

- 1c7dfb6: fix: fixing some import issues
- Updated dependencies [1c7dfb6]
  - @pikku/core@0.6.15

## 0.6.3

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3
