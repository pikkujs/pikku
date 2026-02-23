## 0.12.0

## 1.0.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [6cb7e98]
- Updated dependencies [7c1f909]
- Updated dependencies [6cb7e98]
- Updated dependencies [6cb7e98]
- Updated dependencies [7dd13cc]
- Updated dependencies [581fe3c]
  - @pikku/core@0.12.0

### New Features

- `PgAIStorageService` for AI thread, message, and working memory persistence
- `PgDeploymentService` for PostgreSQL-based service discovery
- Workflow version tracking with `upsertWorkflowVersion` / `getWorkflowVersion`

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph support to PgWorkflowService
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2

### Features

- f35e89da: Add workflow graph support to PgWorkflowService
  - Add `inline` and `state` columns to workflow_runs table
  - Add `branch_taken` column to workflow_step table
  - Add `setBranchTaken` method for graph branching

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- ce902b1: fix: using a reserved connection for locks
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Initial release with PostgreSQL-backed channel, eventhub, and workflow stores

## 0.11.0

# @pikku-workflows/pg

## 0.10.0

### Major Changes

- Initial release of @pikku-workflows/pg
- PostgreSQL-based PikkuWorkflowService implementation
- Auto-initialization of schema and tables
- Row-level locking with PostgreSQL advisory locks
- Configurable schema names
