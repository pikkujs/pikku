## 0.12.0

## 0.12.5

### Patch Changes

- 65eccc6: Cache Zod schema generation between re-inspection passes and batch imports by source file. Schemas are cached using a fingerprint of schemaLookup entries + file mtimes, so reinspections skip Zod generation entirely when schemas haven't changed. Source file imports are grouped so each file is imported once instead of per-schema. Reduces `pikku all` from ~5 minutes to ~13 seconds on projects with many Zod schemas.
- 0f59432: Add per-user credential system with CredentialService, OAuth2 route handlers, and KyselyCredentialService with envelope encryption
- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/core@0.12.10

## 0.12.4

### Patch Changes

- 5866b66: Add critical error (PKU490) when Zod schemas and wiring calls (wireHTTPRoutes, addPermission, addHTTPMiddleware) coexist in the same file. The CLI uses tsImport to extract Zod schemas at runtime, which executes all top-level code — wiring side-effects crash in this context because pikku state metadata doesn't exist. Schemas and wirings must be in separate files.
- e412b4d: Optimize CLI codegen performance: 12x faster `pikku all`

  - Reuse schemas across re-inspections (skip redundant `ts-json-schema-generator` runs)
  - Cache TS schemas to disk (`.pikku/schema-cache.json`) for cross-run reuse
  - Pass `oldProgram` to `ts.createProgram` for incremental TS compilation
  - Cache parsed tsconfig in schema generator between runs
  - Auto-include direct `addPermission`/`addHTTPMiddleware` in bootstrap via side-effect imports
  - Skip `pikkuAuth()` errors when nested inside `addPermission`/`addHTTPPermission`

- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
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

## 0.12.3

### Patch Changes

- 508a796: Fix MCP server not exposing addon tools: resolve namespaced function IDs in MCP runner, load addon schemas after schema generation, and use resolveFunctionMeta for MCP JSON serialization
- 387b2ee: Add approval description inspection, track packageName on wire metadata, and resolve addon package names in channel/RPC wirings
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- 62a8725: Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
- 8eed717: Add `readonly` flag to function config and runtime enforcement. Functions can be marked `readonly: true` in their config. At runtime, if a session has `readonly: true`, only functions marked as readonly can be called — otherwise a `ReadonlySessionError` (403) is thrown.
- 62a8725: `pikku versions check` now prints rich, human-readable output for all contract version errors instead of raw error codes. Each error type (PKU861–PKU865) shows the function name, separate input/output schema hashes with a `prev → current` arrow, and clear next-step instructions.

  The version manifest now stores separate `inputHash` and `outputHash` per version entry (backward-compatible — old string-hash manifests still load and validate correctly). `VersionValidateError` gains optional detail fields (`functionKey`, `version`, `previousInputHash`, `currentInputHash`, `previousOutputHash`, `currentOutputHash`, `nextVersion`, `latestVersion`, `expectedNextVersion`) for use by tooling.

- 62a8725: Replace config-based addon declarations with the new `wireAddon()` code-based API. Addons are now declared directly in wiring files using `wireAddon({ name, package, rpcEndpoint?, auth?, tags? })` instead of the `addons` field in `pikku.config.json`. The inspector reads these declarations from the TypeScript AST at build time.
- 62a8725: Add `secretOverrides` and `variableOverrides` support to `wireAddon()`. These optional maps allow an app to remap an addon's secret/variable keys to its own names (e.g. `secretOverrides: { SENDGRID_API_KEY: 'MY_EMAIL_API_KEY' }`). The inspector validates that all override keys exist in the app's own secrets/variables definitions.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1

### New Features

- AI agent metadata extraction
- HTTP route groups analysis
- Trigger and trigger source analysis
- Secret and variable declaration extraction
- Workflow graph inspection and DSL extraction
- Contract hashing for change detection
- OpenAPI spec generation (moved from CLI)

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph inspection and DSL extraction
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2

### Features

- f35e89da: Add workflow graph inspection and DSL extraction
  - Workflow graph inspection with `add-workflow-graph.ts`
  - DSL workflow extraction utilities (extract, deserialize, validate)
  - DSL to graph conversion for metadata generation

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- 28aeb7f: breaking: extract docs in the wiring meta
- ce902b1: feat: adding in pikkuSimpleWorkflowFunc
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Add workflow inspection and analysis
- Add enhanced type extraction utilities

# @pikku/inspector

## 0.10.2

### Patch Changes

- 1967172: Update code generation to support channel middleware enhancements

  **Code Generation Updates:**

  - Update channel type serialization to include middleware support
  - Improve WebSocket wrapper generation for middleware handling
  - Update CLI channel client generation with better type support
  - Enhance services and schema generation for channel configurations

  **Inspector Updates:**

  - Improve channel metadata extraction for middleware
  - Better type analysis for channel lifecycle functions
  - Enhanced post-processing for channel configurations

- 753481a: Add bootstrap command, performance optimizations, and CLI improvements

  **New Features:**

  - Add `pikku bootstrap` command for type-only generation (~13.5% faster than `pikku all`)
  - Add configurable `ignoreFiles` option to pikku.config.json with sensible defaults (_.gen.ts, _.test.ts, \*.spec.ts)
  - Export pikkuCLIRender helper from serialize-cli-types.ts with JSDoc documentation

  **Performance Improvements:**

  - Add aggressive TypeScript compiler options (skipDefaultLibCheck, types: []) - ~37% faster TypeScript setup
  - Add detailed performance timing to inspector phases (--logLevel=debug)
  - Optimize file inspection with ignore patterns - ~10-20% faster overall

  **Enhancements:**

  - Fix --logLevel flag to properly apply log level to logger
  - Update middleware logging to use structured log format
  - Improve CLI renderers to consistently use destructured logger service
  - Fix middleware file generation when middleware groups exist

- 44d71a8: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [778267e]
  - @pikku/core@0.10.1

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.6-next.0

### Patch Changes

- feat: running @pikku/cli using pikku
- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.5

### Patch Changes

- 501c120: fix: rpc internal meta file wasn't being imported

## 0.9.4

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- Updated dependencies [6059c87]
- Updated dependencies [6db63bb]
- Updated dependencies [74f8634]
- Updated dependencies [766fef1]
  - @pikku/core@0.9.6

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size
- b3c2829: fix (using ai): generating custom types broke imports.. this fixes it, but needs more robust training
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
  - @pikku/core@0.9.3

## 0.9.2

### Patch Changes

- 6cf8efd: feat: Adding PikkuDocs to function definition

  refactor: renaming APIDocs to PikkuDocs

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

## 0.8.1

### Patch Changes

- 44e3ff4: feat: enhance CLI filtering with type and directory filters

  - Add --types filter to filter by PikkuEventTypes (http, channel, queue, scheduler, rpc, mcp)
  - Add --directories filter to filter by file paths/directories
  - All filters (tags, types, directories) now work together with AND logic
  - Add comprehensive logging interface to inspector package
  - Add comprehensive test suite for matchesFilters function
  - Support cross-platform path handling

- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:

  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- Updated dependencies [3261090]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1

## 0.8.0

### Major Features

- **Model Context Protocol (MCP) Analysis**: Added comprehensive MCP endpoint analysis
- **Queue Worker Analysis**: Added queue analysis
- **Enhanced Service Analysis**: Added service destructuring analysis for better code generation and type safety

## 0.7.7

### Patch Changes

- 8b4f52e: refactor: moving schemas in channels to functions
- Updated dependencies [8b4f52e]
- Updated dependencies [8b4f52e]
- Updated dependencies [1d70184]
  - @pikku/core@0.7.8

## 0.7.6

### Patch Changes

- faa1369: refactor: moving function imports into pikku-fun.gen file

## 0.7.5

### Patch Changes

- c5e724c: fix: rerelease as previous publish is missing something

## 0.7.4

### Patch Changes

- 598588f: fix: generating output schemas from function meta
- Updated dependencies [598588f]
  - @pikku/core@0.7.4

## 0.7.3

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)
- Updated dependencies [534fdef]
  - @pikku/core@0.7.3

## 0.7.2

### Patch Changes

- 7acd53a: fix: ignore return type if it's void
- Updated dependencies [bb59874]
  - @pikku/core@0.7.2

## 0.7.1

### Patch Changes

- ebfb786: fix: only inspect function calls with pikku\*func in name

## 0.7.0

This has changed significantly. The inspector now finds all functions and then links them to events.

This means we can now get:

- RPCs out of the box
- Schemas are per function, not event
- Supports inline functions, external functions, anonymous functions

## 0.6.4

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.3

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references
- Updated dependencies [f26880f]
  - @pikku/core@0.6.4
