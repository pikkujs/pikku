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
  - @pikku/express-middleware@1.0.0

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
  - @pikku/express-middleware@0.11.1

### Minor Changes

- Workflow support

# @pikku/express

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0
  - @pikku/express-middleware@0.9.3-next.0

## 0.9.2

### Patch Changes

- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2
  - @pikku/express-middleware@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1
  - @pikku/express-middleware@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.6

### Patch Changes

- d0968d2: fix: fixing content uploads for s3
- Updated dependencies [8658745]
- Updated dependencies [d0968d2]
  - @pikku/core@0.6.27

## 0.6.5

### Patch Changes

- 6da4870: moving body parser to middleware to avoid conflicts
- Updated dependencies [412f136]
  - @pikku/core@0.6.26

## 0.6.4

### Patch Changes

- b774c7d: fix: coerce top level data from schema now includes date strings
- Updated dependencies [b774c7d]
  - @pikku/express-middleware@0.6.7
  - @pikku/core@0.6.25

## 0.6.3

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/express-middleware@0.6.5
  - @pikku/core@0.6.22

## 0.6.2

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- c459ef5: fix: provide the express-middleware as part of server dependencies
- Updated dependencies [dee2e9f]
  - @pikku/core@0.6.1

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.9

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28
  - @pikku/express-middleware@0.5.12

## 0.5.8

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25
  - @pikku/express-middleware@0.5.10

## 0.5.7

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24
  - @pikku/express-middleware@0.5.9

## 0.5.6

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/express-middleware@0.5.6
  - @pikku/core@0.5.10

## 0.5.5

### Patch Changes

- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9
  - @pikku/express-middleware@0.5.5

## 0.5.4

### Patch Changes

- 8d85f7e: feat: load all schemas on start optionally instead of validating they were loaded
- Updated dependencies [1876d7a]
- Updated dependencies [8d85f7e]
  - @pikku/core@0.5.8
  - @pikku/express-middleware@0.5.4

## 0.5.3

### Patch Changes

- 3b51762: refactor: not using initialize call to core
- Updated dependencies [3b51762]
  - @pikku/express-middleware@0.5.3

## 0.5.2

### Patch Changes

- 0e1f01c: refactor: removing cli config from servers entirely'

## 0.5.1

### Patch Changes

- 97900d2: fix: exporting plugins from default barrel files
- d939d46: refactor: extracting nextjs and fastify to plugins
- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1
  - @pikku/express-middleware@0.5.1
