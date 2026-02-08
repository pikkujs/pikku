---
'@pikku/core': minor
'@pikku/cli': minor
'@pikku/inspector': minor
'@pikku/lambda': patch
'@pikku/cloudflare': patch
'@pikku/express-middleware': patch
'@pikku/express': patch
'@pikku/fastify-plugin': patch
'@pikku/fastify': patch
'@pikku/next': patch
'@pikku/uws-handler': patch
'@pikku/uws': patch
'@pikku/pg': minor
'@pikku/redis': minor
'create-pikku': patch
---

Remote RPCs, deployment service, workflow improvements, and credential-to-secret rename

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

- Fixed `workflow()` helper generating wrong `pikkuFuncName` (used raw name instead of `workflow_` prefix)
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
