## 0.12.34

### Patch Changes

- fe70fe0: fix(db): make classified columns usable in Kysely queries and emit real zod

  Two fixes so data-classified DB columns (`@private`/`@pii`/`@secret`, default
  `private`) are usable end-to-end instead of poisoning ordinary app code:
  1. **Brand marker is now optional** (`{ readonly __classification__?: ... }`)
     in both `@pikku/core` and the `pikku db migrate` schema header. A required
     marker made a plain value (e.g. `string`) unassignable to a branded column
     (`Private<string>`), breaking every Kysely `where`/insert/`.set()` operand —
     any project with classified columns failed to type-check. Optional keeps the
     brand structurally present (so the inspector's PKU910 output check still
     detects it) while letting plain values flow IN. The inspector's level read is
     now union-aware (`'pii' | undefined`) so pii/secret no longer silently
     downgrade to private.
  2. **Zod codegen resolves classified `ColumnType<>`** to proper scalars instead
     of `z.unknown()`. `pikku db migrate` emits `<Table>Z`/`InsertZ`/`PatchZ` from
     the Select slot, unwrapping the brand and honoring insert-optionality from the
     Insert slot's `| undefined`. Public `Generated<T>`/bare/nested shapes are
     unchanged.

- Updated dependencies [fe70fe0]
  - @pikku/core@0.12.31
  - @pikku/inspector@0.12.19

## 0.12.33

### Patch Changes

- 4d1f94a: fix(cli): emit global middleware side-effect imports in per-unit codegen

  `addGlobalMiddleware` registrations live only in `middlewareState.instances`
  (keyed `global:middleware:N`) with no associated wire group. The per-unit
  `--names` deploy filter strips the `state.http.files` fallback that
  `add-middleware` relies on, so a globally-registered middleware was never
  imported into deployed per-unit bundles and silently no-opped at runtime.

  `serializeMiddlewareImports` now emits a deduped side-effect import for each
  non-factory global instance into `pikku-middleware.gen.ts`, which the bootstrap
  always imports — guaranteeing global middleware registers in every unit.
  Duplicate imports in full builds are harmless (module bodies evaluate once).

- ccd9e27: Auto-mount the MCP server in PikkuNodeHTTPServer
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

- 20750fd: feat(workflow): decide step dispatch purely per-function

  Workflow step execution (inline vs queue dispatch) is now decided entirely by
  the step's function `inline` flag — the workflow-level / run-level `inline`
  meta no longer participates in per-step dispatch.
  - Steps default to **inline**, so a normally-started (queue-backed) workflow
    runs its whole chain in one orchestrator pass instead of one queue
    round-trip per step.
  - A function marked `inline: false` is dispatched via the queue (its own
    worker, retry isolation). When `inline: false` but no `queueService` is
    configured, the step falls back to inline and emits a `logger.warn` instead
    of silently swallowing the misconfiguration.
  - Removed the now-unused workflow-level `inline` from `WorkflowsMeta` /
    `WorkflowRuntimeMeta`, the inspector's workflow extraction, the DSL→graph
    converter, and the deploy analyzer / service inference (which now key off
    the per-function flag). Run-level `inline` is retained: it still controls
    whether a whole run executes in-process without queue infrastructure.

- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [ccd9e27]
- Updated dependencies [bc28e3b]
- Updated dependencies [409ec80]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30
  - @pikku/node-http-server@0.12.2
  - @pikku/fetch@0.12.3
  - @pikku/inspector@0.12.18

## 0.12.32

### Patch Changes

- 7a4a49d: fix(cli): emit global middleware side-effect imports in per-unit codegen

  `addGlobalMiddleware` registrations live only in `middlewareState.instances`
  (keyed `global:middleware:N`) with no associated wire group. The per-unit
  `--names` deploy filter strips the `state.http.files` fallback that
  `add-middleware` relies on, so a globally-registered middleware was never
  imported into deployed per-unit bundles and silently no-opped at runtime.

  `serializeMiddlewareImports` now emits a deduped side-effect import for each
  non-factory global instance into `pikku-middleware.gen.ts`, which the bootstrap
  always imports — guaranteeing global middleware registers in every unit.
  Duplicate imports in full builds are harmless (module bodies evaluate once).

- Updated dependencies [294e365]
  - @pikku/core@0.12.29

## 0.12.31

### Patch Changes

- cd51724: Default SQLite to `.pikku-runtime/dev.db` when `db/sqlite` directory exists and no db engine is configured in pikku.config.json.

## 0.12.30

### Patch Changes

- e108c30: Fix `pikku dev` startup ordering so generated bootstrap is loaded after `allWorkflow` regeneration instead of before it. This avoids stale bootstrap/module-state hangs during dev startup on projects with heavy generated wiring graphs.
- 5093725: runFunctionTests throws a descriptive error when tests dir is missing instead of returning null; db-codegen formatting reflow

## 0.12.29

### Patch Changes

- b6d3d8f: `pikku fabric validate` now warns when `.pikku/` is not listed in `.gitignore`. Generated codegen artifacts should never be committed as they bloat PRs and can cause stale-codegen issues.
- ec434c4: `pikku fabric validate` now errors when required Cloudflare deploy dependencies are missing from `packages/functions/dependencies` (not devDependencies):
  - `@pikku/schema-cfworker` — always required; injected into every worker entry
  - `@pikku/kysely` — always required; `secretContributor` imports `KyselySecretService` unconditionally
  - `@pikku/ai-vercel` + `@ai-sdk/openai-compatible` — required when the project declares agent units (detected via `.pikku/agent/pikku-agent-wirings-meta.gen.json`)

- 0db854e: Fix workflow DSL extractor treating `x = await workflow.do(...)` as a set-step when `x` was previously declared as `null`. The referenced function is now correctly registered in `invokedFunctions` and `internalFiles`, so it appears in the generated `pikku-functions.gen.ts`.
- 8249f6f: Fix `isStringLike` to unwrap type assertion expressions (`as T` / `<T>expr`) so that `workflow.do('step', 'rpcName' as any, data)` is correctly parsed as an RPC step rather than silently dropped as an inline step. Also removes the `as any` cast from the `Emails` step in `all.workflow.ts` now that the inspector handles it, and ensures `pikku all` generates email template artifacts.
- f373a87: Fix PKU910 classification semantics and Postgres annotation propagation.

  **Inspector (`@pikku/inspector`):**
  - `findPiiPaths()` now returns `ClassifiedField[]` (path + classification level) so `private`/`pii` and `secret` brands are distinguished
  - `Secret<T>` fields are blocked in the output of all exposed functions (sessioned or not)
  - `Private<T>` / `Pii<T>` fields are only blocked in sessionless functions — authenticated (sessioned) functions may return private-classified data to their callers

  **CLI (`@pikku/cli`):**
  - Fix missing `rootDir` in the Postgres `generateSchemaTypes` call — the annotations sidecar file (`db/annotations.gen.json`) was silently ignored during Postgres migrations, causing columns annotated `@public` to remain branded as `Private<T>` in the generated schema

- Updated dependencies [0db854e]
- Updated dependencies [8249f6f]
- Updated dependencies [f373a87]
  - @pikku/inspector@0.12.15

## 0.12.28

### Patch Changes

- abff78a: fix(fabric-validate): align migration path with local-db.ts (db/sqlite/ at project root, not packages/functions/db/migrations/) and warn when no migration creates the audit table. Document createInvocationAudit + createAuditedKysely in the pikku-services skill.
- 4b5c75b: feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry
  - Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
  - Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
  - `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
  - Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.

- ad970f3: Output coverage artifacts to `.coverage/` instead of `coverage/` so the directory is hidden by default and consistent with the `.gitignore` convention for generated outputs.
- 4b5c75b: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- dd53def: **`pikku db migrate` now loads column classification annotations from a `db/annotations.gen.json` sidecar.**

  Projects can annotate database columns with visibility (`public` / `private` / `secret`) and classification (`pii`, `hash`, `token`, `encrypted`, `redact`) in a typed `db/annotations.ts` file. Running `yarn db:types` generates `db/annotations.gen.json` which `pikku db migrate` reads to brand columns in the emitted `schema.d.ts`.

  Changes:
  - `annotation-parser`: `loadAnnotations()` is now synchronous and reads `db/annotations.gen.json` via `readFileSync`/JSON.parse (compiled CLI cannot `import()` `.ts` files). Falls back to SQL comment parsing when the JSON file is absent.
  - `db-codegen`: `bareTableName()` strips schema prefixes (e.g. `app.user` → `user`) before looking up annotations, so postgres schema-qualified tables resolve correctly.
  - `db-codegen`: `Private<T>` and `Secret<T>` are emitted as transparent aliases (`= T`) so Kysely WHERE clause typing works without modification.
  - `annotation-parser`: `parseAnnotations` no longer sets `anonymize: null` when no strategy is present — the field is omitted entirely (it is optional).

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27
  - @pikku/inspector@0.12.14
  - @pikku/kysely@0.12.14

## 0.12.27

### Patch Changes

- 909eb25: Fix db migration directory detection in validators to use db/sqlite/ and db/postgres/ instead of db/migrations/

  Fabric validator now checks db/sqlite/ (Fabric always uses SQLite/libSQL). Workspace validator derives the migrations directory from createConfig — postgresUrl → db/postgres/, sqliteDb → db/sqlite/.

- Updated dependencies [909eb25]
  - @pikku/core@0.12.26
  - @pikku/kysely@0.12.13

## 0.12.26

### Patch Changes

- 665bdb0: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- 3aaed21: Flatten `createConfig` dev fields: replace `dev: { db, content }` with top-level `sqliteDb: string` and `content: { contentPath?, uploadUrlPrefix?, assetUrlPrefix?, sizeLimit? }`.

  **Migration:** update your `createConfig` export:

  ```ts
  // before
  export const createConfig = pikkuConfig(async () => ({
    dev: { db: true, content: true },
  }))

  // after
  export const createConfig = pikkuConfig(async () => ({
    sqliteDb: '.pikku-runtime/dev.db',
    content: {},
  }))
  ```

  For test helpers that override the db path, replace `{ ...config, dev: { db: { file: dbFile } } }` with `{ ...config, sqliteDb: dbFile }`.

- Updated dependencies [665bdb0]
  - @pikku/core@0.12.25
  - @pikku/inspector@0.12.13

## 0.12.25

### Patch Changes

- 0bd0433: Add `db.engine` and `db.pgVersion` to the CLI config types, and make local env-backed secrets fall back to raw strings when JSON parsing fails.
- fbfe592: Fix Bun standalone CLI startup and local DB commands, add workspace-level validate, and verify the native binary against a real starter workspace.
- Updated dependencies [c02275f]
- Updated dependencies [0bd0433]
- Updated dependencies [55ba75a]
  - @pikku/core@0.12.24
  - @pikku/kysely@0.12.12

## 0.12.24

### Patch Changes

- d57a8ef: Fix race condition in `pikku dev` where hot-reload codegen replaced live user services with CLI-internal services.

  During a file-watch triggered re-run of `allWorkflow`, `runAllWithCommandState` unconditionally overwrote `singletonServices` with the CLI's own services object (which has `config` but no `kysely`, no content server, etc.). Any request that arrived during codegen — e.g. an auth callback — would crash because `kysely` was undefined.

  Fix: detect the hot-reload case (`previousSingletonServices` exists and differs from the CLI object), then build a hybrid — spread the live user services and overlay only `config` from the CLI. Codegen gets the paths it needs; concurrent requests continue to see the real services.

- Updated dependencies [8d09f12]
  - @pikku/core@0.12.23

## 0.12.23

### Patch Changes

- 265461b: Improve schema identifier sanitization in the CLI and prefer specific runtime error messages in HTTP error responses.
- Updated dependencies [265461b]
  - @pikku/core@0.12.22

## 0.12.22

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- 9060165: New `pikku db migrate`, `pikku db seed`, and `pikku db reset` commands manage your database using a built-in `node:sqlite` migrator with dev-injection support.
- 9060165: The `pikku fabric` command group gains `deploy plan` and `deploy apply` subcommands (replacing `--dry-run`), plus new read-only commands: `deploy list`, `deploy units`, `status`, `errors`, and `db schema`. `deploy apply` prompts for confirmation before deploying; `--auto-apply` skips it.
- 9060165: New `pikku tests init` scaffolds a Cucumber BDD test harness in your functions package. The companion `@pikku/cucumber` package provides the world, hooks, step library, and database utilities — wiring real Pikku RPC dispatch against an in-process SQLite copy seeded from migrations. `pikku tests coverage` generates per-function coverage summaries, surfaced in the console.
- 9060165: The CLI is now available as a native binary via Homebrew (`brew install pikkujs/tap/pikku`) or as a direct download for macOS and Linux (arm64 + x64). On startup, pikku checks for newer versions and suggests an upgrade when one is available.
- 9060165: New realtime events system: `pikku realtime` generates a typed `PikkuRealtime` client that pairs with `PikkuRPC`. A `/events` channel can be scaffolded to fan out server events to subscribers over SSE. `pikku dev` wires `LocalEventHubService` automatically so realtime works out of the box locally. The React provider exposes `PikkuRealtime` alongside `PikkuRPC`.
- 9060165: Set `startServerFnsFile` in `clientFiles` to generate a typed `makeApi(): PikkuRPC` caller for use in TanStack Start loaders, actions, and components.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
  - @pikku/inspector@0.12.12
  - @pikku/kysely-node-sqlite@0.12.1
  - @pikku/fetch@0.12.2
  - @pikku/node-http-server@0.12.1
  - @pikku/deploy-cloudflare@0.12.3

## 0.12.21

### Patch Changes

- d3bcadc: Emit `pikkuListFunc` and `PikkuListFunction` in generated `pikku-types.gen.ts` so list-style function typing can be expressed without manually wrapping `ListInput`/`ListOutput`.
- a3d041c: Add `--output json`/`--json` CLI support to emit NDJSON logs with timestamped structured entries, including critical errors and redirected command console output.
- 360e594: Fix generated `RPCInvoke` and `RPCRemote` typing to use stricter void-input detection.

  The generated helpers now treat only true voidish inputs (`void | null | undefined`) as omittable and avoid misclassifying `any` inputs as voidish, so non-void RPCs keep a required `data` argument.

- d6e1289: Make `pikku versions update` fail when immutable contract drift is detected (`FUNCTION_VERSION_MODIFIED`) instead of exiting successfully.

  This ensures CI can reliably fail on published-version contract modifications and prevents silent success when the manifest is intentionally not updated.

- b9ed73e: Add deterministic workflow planned-step metadata support and SSE init stream payload generation.
  - Persist `deterministic` and `plannedSteps` on workflow runs in core and service adapters.
  - Expose planned-step metadata on workflow run status responses.
  - Emit an initial `type: 'init'` SSE event for deterministic workflow streams before incremental updates.
  - Add CLI tests covering serialized stream route output for init/update/done event behavior.

- Updated dependencies [033d172]
- Updated dependencies [b9ed73e]
  - @pikku/inspector@0.12.11
  - @pikku/core@0.12.19

## 0.12.0

## 0.12.20

### Patch Changes

- cbefa22: Add `pikku dev` command: an all-in-one local development server that wires
  an HTTP + WebSocket server with in-memory scheduler, queue, workflow,
  trigger, and AI run-state services. Supports file watching with
  regeneration and hot module reload.

  Options:
  - `--port, -p` (default `3000`)
  - `--watch` (default `true`)
  - `--hmr` (default `true`)

- Updated dependencies [ba8d6ff]
- Updated dependencies [d3ace0e]
- Updated dependencies [311c0c4]
  - @pikku/inspector@0.12.10
  - @pikku/core@0.12.18

## 0.12.19

### Patch Changes

- b3a28c9: Convert `pikku all` to run as a workflow with parallelized steps
- d477ea5: Fix RPCInvoke and RPCRemote types to omit data argument for void/null input functions and require it for object inputs

## 0.12.18

### Patch Changes

- 615c0e0: Sanitize function IDs with colons and slashes in deploy directory names
- fbcf5b9: Add React Query hooks generation from RPC map. New `reactQueryFile` option in `clientFiles` config generates typed `usePikkuQuery`, `usePikkuMutation`, and `usePikkuInfiniteQuery` hooks, plus workflow hooks (`useRunWorkflow`, `useStartWorkflow`, `useWorkflowStatus`). Infinite query is type-constrained to RPCs whose output includes `nextCursor`.
- fbcf5b9: Enrich generated workflow status stream with step-level progress. The `/stream` endpoint now sends step names and statuses via `workflowRunService.getRunSteps()`. New `/stream/full` endpoint includes output, error, and childRunId for admin consoles.
- Updated dependencies [2ac6468]
- Updated dependencies [fbcf5b9]
- Updated dependencies [fbcf5b9]
  - @pikku/inspector@0.12.9
  - @pikku/core@0.12.16

## 0.12.17

### Patch Changes

- add5c4e: Remove deploy-azure and deploy-serverless from CLI hard dependencies. Deploy providers are optional and dynamically imported at runtime. Only keep deploy-cloudflare as the default provider.
- f90daa4: Replace workspace:_ protocol with explicit npm version ranges in all package.json files. Fixes broken publishes where workspace:_ was included literally in the npm registry.

## 0.12.16

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

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [02fca80]
- Updated dependencies [7ab3243]
  - @pikku/deploy-cloudflare@0.12.1
  - @pikku/core@0.12.15
  - @pikku/inspector@0.12.8
  - @pikku/openapi-parser@0.12.10

## 0.12.15

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

## 0.12.14

### Patch Changes

- Fix pikkuAddonWireServices return type cast for addon compatibility.

## 0.12.13

### Patch Changes

- a31dc64: Fix pikkuAddonWireServices to wrap variables and secrets with TypedVariablesService and TypedSecretService, matching the same pattern as pikkuAddonServices.

## 0.12.12

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.
- Updated dependencies [2ce0733]
  - @pikku/openapi-parser@0.12.9
  - @pikku/core@0.12.13
  - @pikku/inspector@0.12.7

## 0.12.11

### Patch Changes

- 84f01ad: Add credentialOverrides to wireAddon for remapping credential names, fix credential services template to pass variables argument.
- Updated dependencies [84f01ad]
- Updated dependencies [94ceecd]
  - @pikku/core@0.12.12
  - @pikku/inspector@0.12.6
  - @pikku/openapi-parser@0.12.8

## 0.12.10

### Patch Changes

- 5dd1996: Fix credentials command crash when state.credentials is undefined, and add --credential flag to `pikku new addon` for per-user credential wiring (apikey, bearer, oauth2).
- Updated dependencies [5dd1996]
  - @pikku/openapi-parser@0.12.7

## 0.12.9

### Patch Changes

- 4e52200: Add \_\_raw CLI channel handler for server-side arg parsing. Enables WebSocket CLI clients to send raw args without needing client-side command metadata.
- Updated dependencies [4e52200]
  - @pikku/core@0.12.11

## 0.12.8

### Patch Changes

- e412b4d: Optimize CLI codegen performance: 12x faster `pikku all`
  - Reuse schemas across re-inspections (skip redundant `ts-json-schema-generator` runs)
  - Cache TS schemas to disk (`.pikku/schema-cache.json`) for cross-run reuse
  - Pass `oldProgram` to `ts.createProgram` for incremental TS compilation
  - Cache parsed tsconfig in schema generator between runs
  - Auto-include direct `addPermission`/`addHTTPMiddleware` in bootstrap via side-effect imports
  - Skip `pikkuAuth()` errors when nested inside `addPermission`/`addHTTPPermission`

- b973d44: Add `inline` property to workflow function definitions. When `inline: true` is set on a workflow, it always executes inline without dispatching to the queue service, even when a queue service is available. This is useful for workflows that should run synchronously within the parent process (e.g. scaffolding/setup steps that produce local files).

  The flag flows from the function definition through the inspector, into the serialized workflow graph, and is checked at runtime by the workflow service.

- Updated dependencies [e412b4d]
- Updated dependencies [5866b66]
- Updated dependencies [53dc8c8]
- Updated dependencies [e412b4d]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [e3142ad]
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
  - @pikku/inspector@0.12.4
  - @pikku/openapi-parser@0.12.4

## 0.12.7

### Patch Changes

- e1374fc: Add OpenAPI metadata to pikku.config.json for generated addons

  When an addon is scaffolded with `--openapi`, the config now includes an `openapi` object with `version` (from the spec's `info.version`) and `hash` (a contract hash of paths, methods, params, and schemas). This lets users and tooling know whether an addon was auto-generated and if the upstream API contract has changed.

- c283e87: Add prepublishOnly script to addon scaffold template so changesets only builds packages it publishes
- c077608: Add `globalHTTPPrefix` config option to prefix all generated HTTP route paths (e.g. `/api`), freeing `/` for a frontend or landing page.
- d5f35c5: Rename version manifest from versions.json to versions.pikku.json and place it next to pikku.config.json instead of in .pikku/. Update warning message to say 'pikku versions init'.
- 049d4c3: Add input/output schema support to pikkuWorkflowFunc, pikkuWorkflowComplexFunc, and pikkuAIAgent
- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- b0a81cc: Support sub-workflows in `workflow.do()`: when a string name is passed, it now checks if the name refers to a registered workflow and runs it as a sub-workflow, falling back to RPC invocation if not found. The `TypedWorkflow.do` type now also accepts workflow names with typed input/output. Steps that spawn sub-workflows expose `childRunId` on the step state so clients can stream sub-workflow progress.
- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.6

### Patch Changes

- a0c496f: Fix OpenAPI codegen bugs: use operation description instead of response description, sanitize dots in type names, quote hyphenated property keys, make function input optional in types, and use pikkuServices() in test template.
- 198e68f: Add hot-reload for dev mode: reload functions, middleware, and permissions without server restart.
- Updated dependencies [a0c496f]
- Updated dependencies [198e68f]
  - @pikku/openapi-to-zod-schema@0.12.3
  - @pikku/core@0.12.5

## 0.12.5

### Patch Changes

- Add `pikkuConsoleHasSecret` RPC to generated console functions: check if a secret exists without reading its value

## 0.12.4

### Patch Changes

- e387a68: Add scaffold.console check to console command: error with setup instructions if console is not enabled in pikku.config.json. Update bundled console app.
- Updated dependencies [688b5e8]
  - @pikku/core@0.12.4

## 0.12.3

### Patch Changes

- 387b2ee: Add console app assets, agent serialization, addon type generation, and enhance OpenAPI codegen with error handling, header params, and MCP support
- 6e8777b: Rename `node` config key to `addon` (now accepts boolean or object with metadata) and rename generated file `pikku-nodes-meta.gen.json` to `pikku-addon-meta.gen.json`
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [387b2ee]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3
  - @pikku/inspector@0.12.3

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2
  - @pikku/inspector@0.12.2

## 0.12.1

### Patch Changes

- 62a8725: Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
- 588f52f: Add `pikku new addon <name>` CLI subcommand for scaffolding addon packages:
  - Generates full addon structure: package.json, pikku.config.json, tsconfig.json, API service, types, and README
  - `--secret` flag generates wireSecret with API key schema
  - `--oauth` flag generates wireOAuth2Credential + OAuth2Client-based API service
  - `--variable` flag generates wireVariable definition
  - `--no-test` flag skips test harness generation
  - `--displayName`, `--description`, `--category`, `--dir` options for customization
  - Test harness includes wireAddon, services, test function, and runner

  Also adds `scaffold` config section to pikku.config.json for config-driven default directories across all `new` commands (addonDir, functionDir, wiringDir, middlewareDir, permissionDir).

- ba88295: Add `pikku new` scaffold commands for bootstrapping project files:
  - `pikku new function <name> --type func|sessionless|void`
  - `pikku new wiring <name> --type http|channel|scheduler|queue|mcp|cli|trigger`
  - `pikku new middleware <name> --type simple|factory`
  - `pikku new permission <name> --type simple|factory`

  Templates use correct `#pikku` imports and function signatures. VS Code extension now delegates to the CLI instead of using inline templates.

- a83efb8: Handle OPTIONS preflight requests automatically in fetchData when no explicit OPTIONS route is matched. Runs global HTTP middleware (e.g. CORS) and returns 204. Remove redundant startWorkflowRun and streamAgentRun pass-through functions from addon-console.
- 62a8725: `pikku versions check` now prints rich, human-readable output for all contract version errors instead of raw error codes. Each error type (PKU861–PKU865) shows the function name, separate input/output schema hashes with a `prev → current` arrow, and clear next-step instructions.

  The version manifest now stores separate `inputHash` and `outputHash` per version entry (backward-compatible — old string-hash manifests still load and validate correctly). `VersionValidateError` gains optional detail fields (`functionKey`, `version`, `previousInputHash`, `currentInputHash`, `previousOutputHash`, `currentOutputHash`, `nextVersion`, `latestVersion`, `expectedNextVersion`) for use by tooling.

- 62a8725: Version management commands are now grouped under `pikku versions <subcommand>`:
  - `pikku versions init` — initialise the version manifest (was `pikku init`)
  - `pikku versions check` — validate contracts against the manifest (was `pikku versions-check`)
  - `pikku versions update` — update the manifest with current hashes (newly exposed as a CLI command)

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
  - @pikku/inspector@0.12.1

### New Features

- AI agent code generation (types, public agent endpoints, streaming routes)
- OAuth2 CLI commands: `oauth:connect`, `oauth:status`, `oauth:disconnect`
- `TypedSecretService` and `TypedVariablesService` code generation
- Contract versioning with `versions-check`, `versions-init`, `versions-update` commands
- Trigger and trigger source code generation
- Secret and variable declaration code generation
- HTTP route groups support
- Remote RPC worker generation
- Node metadata generation for visual flow graphs

## 0.11.3

### Patch Changes

- 14a3dcd: fix: nextjs rpc route wasn't working
- db9c7bf: Add workflow graph code generation and fix HTTP routes count
- Updated dependencies [db9c7bf]
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2
  - @pikku/inspector@0.11.2

### Features

- f35e89da: Add workflow graph code generation
  - Workflow graph serialization and type generation
  - DSL to graph conversion for workflow metadata

### Fixes

- ddd87eaf: Make CreateWireServices type compatible with custom Config types
- c42aad80: Correct HTTP routes count in CLI summary (was showing method count instead of route count)

## 0.11.2

### Patch Changes

- 4b811db: chore: updating all dependencies
- ce902b1: feat: serialize json files seperate to pikku meta state calls
- e12a00c: feat: adding initialSession to PikkuWire which is correctly typed (undefined / not depending on function type)
- ce902b1: feat: adding rpcName to rpc url so its nicer in network tabs
- 4579434: breaking: changing the signature of functions
- 28aeb7f: breaking: extract docs in the wiring meta
- ce902b1: feat: adding in pikkuSimpleWorkflowFunc
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/inspector@0.11.1
  - @pikku/core@0.11.1

## 0.11.1

### Patch Changes

- 1d064c5: feat: using pikku cli to drive the pikku cli

### Minor Changes

- Add workflow code generation (types, maps, workers, metadata)
- Add public RPC and remote RPC code generation

# @pikku/cli

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
- Updated dependencies [1967172]
- Updated dependencies [753481a]
- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/inspector@0.10.2
  - @pikku/core@0.10.2

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [778267e]
  - @pikku/inspector@0.10.1
  - @pikku/core@0.10.1

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.16-next.0

### Patch Changes

- feat: running @pikku/cli using pikku
- Updated dependencies
  - @pikku/core@0.9.12-next.0
  - @pikku/inspector@0.9.6-next.0

## 0.9.15

### Patch Changes

- 749d921: chore: intermin combat with new cli changes

## 0.9.14

### Patch Changes

- 798d52c: refactor: move all rpc generated info into rpc and removing rpc-internal

## 0.9.13

### Patch Changes

- ccd2a45: fix: adding functions should always be using func config and not pure functions

## 0.9.12

### Patch Changes

- eb8ed09: feat: only write files if the content changed / file doesn't exist, this stops triggering restarts for development

## 0.9.11

### Patch Changes

- 0181433: fix: fixing cli pikku-types for channels (allowing sessionless as well)

## 0.9.10

### Patch Changes

- 501c120: fix: rpc internal meta file wasn't being imported
- Updated dependencies [501c120]
  - @pikku/inspector@0.9.5

## 0.9.9

### Patch Changes

- 99c2b3a: fix: removing duplicated interaction values from pikku functions
- Updated dependencies [99c2b3a]
  - @pikku/core@0.9.9

## 0.9.8

### Patch Changes

- ea89575: feat: adding the ability for custom schema validation / retrieving schemas to use (for example with openapi json_response)
- Updated dependencies [ea89575]
  - @pikku/core@0.9.8

## 0.9.7

### Patch Changes

- 4fd5e19: fix: removing rpcMeta and duplicate imports
- d1babed: fix: pikkuVoidFunc should use a sessionless function -- Since its used mostly by scheduled tasks

## 0.9.6

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- Updated dependencies [6059c87]
- Updated dependencies [6db63bb]
- Updated dependencies [74f8634]
- Updated dependencies [766fef1]
  - @pikku/inspector@0.9.4
  - @pikku/core@0.9.6

## 0.9.5

### Patch Changes

- b443405: feat: adding middleware and functions by tags
- Updated dependencies [7e1f5b3]
- Updated dependencies [b443405]
  - @pikku/core@0.9.5

## 0.9.4

### Patch Changes

- 92c1926: feat: adding rpc and websocket client cli commands
- c18800d: feat: adding queue and scheduledTask to interactions
- Updated dependencies [c18800d]
  - @pikku/core@0.9.4

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size
- b3c2829: fix (using ai): generating custom types broke imports.. this fixes it, but needs more robust training
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
- Updated dependencies [b3c2829]
  - @pikku/inspector@0.9.3
  - @pikku/core@0.9.3

## 0.9.2

### Patch Changes

- 1256238: feat: pikkufunc in types extends function config to include all the different params
- d3a9a09: refactor: change addMiddleware to addHTTPMiddleware due to route support'

  chore: export addHTTPMiddleware from pikku-types for consistency

- 840e078: refactor: change APIMiddleware type to PikkuMiddleware
- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2
  - @pikku/inspector@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: feat: adding silent option to cli
- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1
  - @pikku/inspector@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.3

### Patch Changes

- 9156577: Fix import path generation to handle same-package files and node_modules paths
  - When files are in the same package directory, skip packageMappings and use relative paths
  - When import paths include node_modules, strip everything before and including node_modules/ for cleaner imports
  - This prevents issues where files within the same package would incorrectly reference themselves via package names
  - Transforms ugly paths like `../../../../node_modules/@pikku/core/dist/types/core.types.d.js` into clean paths like `@pikku/core/dist/types/core.types.d.js`

## 0.8.2

### Patch Changes

- a02347b: fix: only insert package mapping if it's not the same package
- Updated dependencies [0fb4b3d]
  - @pikku/core@0.8.2

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
- Updated dependencies [44e3ff4]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1
  - @pikku/inspector@0.8.1

## 0.8.0

### Major Features

- **Model Context Protocol (MCP) Support**: Complete MCP implementation with automatic generation of MCP JSON specifications, resources, tools, and prompts
- **Queue System**: Added queue support
- **RPC (Remote Procedure Calls)**: Added typed RPC call generation with local and remote procedure support
- **Multiple Bootstrap Files**: Added support for generating different transport-specific bootstrap files
- **Service Destructuring Analysis**: Added service destructuring analysis for better code generation
- **Bootstrap Files**: Added support for generating transport-specific bootstrap files
- **Service Destructuring**: Added service destructuring analysis for better code organization
- **Error Handling**: Improved error handling for complex type generation
- **Performance**: Optimized code generation for large projects with multiple event types

## 0.7.7

### Patch Changes

- a5e3903: fix: PikkuFetch import fix

## 0.7.6

### Patch Changes

- 8b4f52e: refactor: moving schemas in channels to functions
- 1d70184: feat: adding multiple bootstrap files for different transports
- 5c4f56f: fix: adding more options to schema generator to support complex types
- a9427b8: fix: import bootstrap file to include all rpc/function code in nextjs wrapper
- Updated dependencies [8b4f52e]
- Updated dependencies [8b4f52e]
- Updated dependencies [1d70184]
  - @pikku/core@0.7.8
  - @pikku/inspector@0.7.7

## 0.7.5

### Patch Changes

- faa1369: refactor: moving function imports into pikku-fun.gen file
- Updated dependencies [faa1369]
  - @pikku/inspector@0.7.6

## 0.7.4

### Patch Changes

- 6af8a19: fix: always write functions meta data
- Updated dependencies [6af8a19]
  - @pikku/core@0.7.7

## 0.7.3

### Patch Changes

- 46d4458: feat: we now have typed rpc calls inside of functions!
- Updated dependencies [46d4458]
  - @pikku/core@0.7.5

## 0.7.2

### Patch Changes

- 598588f: fix: generating output schemas from function meta
- Updated dependencies [598588f]
  - @pikku/inspector@0.7.4
  - @pikku/core@0.7.4

## 0.7.1

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)
- Updated dependencies [534fdef]
  - @pikku/inspector@0.7.3
  - @pikku/core@0.7.3

## 0.7.0

- Now function first. No breaking changes for end user here, just internals

## 0.6.20

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware
- Updated dependencies [531f4b5]
  - @pikku/core@0.6.24

## 0.6.19

### Patch Changes

- 1c8c470: removing a console
- Updated dependencies [1c8c470]
  - @pikku/core@0.6.23

## 0.6.18

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/inspector@0.6.4
  - @pikku/core@0.6.22

## 0.6.17

### Patch Changes

- 57f5d8c: refactor: moving getSession out of nextjs wrapper since it bundles all routes and only needs middleware
- 141d690: feat: creating a nextJS http wrapper for proxying
- e5a5a12: feat: adding watch command (pikki all --watch)
- 0ad27a2: chore: switching from glon to tinyblobby

## 0.6.16

### Patch Changes

- 9fb2b99: refactor: moving schemas to pikku state
- Updated dependencies [9fb2b99]
  - @pikku/core@0.6.19

## 0.6.15

### Patch Changes

- 93c70b5: feat: make user session service a required service for channels

## 0.6.14

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.13

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/inspector@0.6.3
  - @pikku/core@0.6.14

## 0.6.12

### Patch Changes

- f0a905d: fix: fixing optional data if no arguments present

## 0.6.11

### Patch Changes

- 3062086: fix: renaming AbstractFetch/Websocket to core
- eb8a8b4: fix: updating schema and cli build issue due to tsconfig settings
- Updated dependencies [eb8a8b4]
  - @pikku/core@0.6.13

## 0.6.10

### Patch Changes

- 06e71be: fix: use readFile instead of import for json file

## 0.6.9

### Patch Changes

- 7e7ec0c: chore: show packageVersion in cli header

## 0.6.8

### Patch Changes

- bdcc89a: feat: adding intro logo to cli based commands

## 0.6.7

### Patch Changes

- 7859b28: breaking: changing overrides for addRoute to wrap instead due to random conflict override errors
- 269a532: fix: fixing some typing issues
- Updated dependencies [7859b28]
- Updated dependencies [269a532]
  - @pikku/core@0.6.11

## 0.6.6

### Patch Changes

- 780d7c2: revert: using import for json
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.5

### Patch Changes

- 4357bca: feat: fixing up nextjs apis
- Updated dependencies [4357bca]
  - @pikku/core@0.6.6

## 0.6.4

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- a40a508: fix: Fixing some generation bugs and other minors
- 4855e68: refactor: changing all generated files to have a .gen in the default name suffix
- Updated dependencies [a40a508]
  - @pikku/inspector@0.6.2
  - @pikku/core@0.6.5

## 0.6.3

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references
- Updated dependencies [f26880f]
  - @pikku/inspector@0.6.1
  - @pikku/core@0.6.4

## 0.6.2

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3

## 0.6.1

### Patch Changes

- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches
- Updated dependencies [ed45ca9]
- Updated dependencies [adeb392]
  - @pikku/core@0.6.2

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.43

### Patch Changes

- 662a6cf: feat: adding scheduled tasks names
- c8578ea: fix: getting websocket auth to work on individual messages
- d2f8edf: feat: adding channelId to channels for serverless compatability
- Updated dependencies [662a6cf]
- Updated dependencies [c8578ea]
- Updated dependencies [d2f8edf]
  - @pikku/core@0.5.29

## 0.5.42

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.41

### Patch Changes

- 3f2e365: fix: create custom types if one object thats not a valid alias

## 0.5.40

### Patch Changes

- 57731ed: fix: deleting a deadline in serializer

## 0.5.39

### Patch Changes

- 75a828d: feat: create schemas for custom types extracted from apis

## 0.5.38

### Patch Changes

- 6dc72d5: feat: add support for import attributes to cli options

## 0.5.37

### Patch Changes

- 5d03fac: refactor: removing some dead code

## 0.5.36

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations
- Updated dependencies [aa8435c]
  - @pikku/core@0.5.27

## 0.5.35

### Patch Changes

- 2160039: fix: fixing alias issue with generated types
- ab42f18: chore: upgrading to next15 and dropping pages support
- Updated dependencies [ab42f18]
  - @pikku/core@0.5.26

## 0.5.34

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.33

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- 9deb482: refactor: finalizing stream api
- f37042d: fix: always print out core schema register file
- ee0c6ea: feat: adding ws server
- d97e952: refactor: removing requirement of config method outside of nextjs
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24

## 0.5.32

### Patch Changes

- e9a9968: refactor: completing rename of stream to channel
- Updated dependencies [7fa64a0]
- Updated dependencies [539937e]
- Updated dependencies [e9a9968]
  - @pikku/core@0.5.23

## 0.5.31

### Patch Changes

- 73973ec: fix: data type for methods is optional
- Updated dependencies [73973ec]
  - @pikku/core@0.5.22

## 0.5.30

### Patch Changes

- 179b9c2: fix: fixing stream types
- Updated dependencies [179b9c2]
  - @pikku/core@0.5.21

## 0.5.29

### Patch Changes

- b20ef35: fix: generate stream types from message array

## 0.5.28

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)
- Updated dependencies [5be6da1]
  - @pikku/core@0.5.20

## 0.5.27

### Patch Changes

- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli
- Updated dependencies [cbcc75b]
- Updated dependencies [d58c440]
- Updated dependencies [11c50d4]
  - @pikku/core@0.5.19

## 0.5.26

### Patch Changes

- b7b78bb: fix: add '& {}' to openapi interfaces as a workaround for not directly refering to a type since it confuses typescript

## 0.5.25

### Patch Changes

- 69d388d: refactor: switching to use config async creator

## 0.5.24

### Patch Changes

- 2307831: fix: removing unused import

## 0.5.23

### Patch Changes

- 30b46aa: fix: looks like using patch lowercase breaks the node fetch client sometimes
- Updated dependencies [30b46aa]
  - @pikku/core@0.5.13

## 0.5.22

### Patch Changes

- f8aa99f: feat: export pikkuFetch instance to avoid needing a singleton class
- Updated dependencies [ff8a563]
  - @pikku/core@0.5.12

## 0.5.21

### Patch Changes

- 5295380: refactor: changing config object a getConfig function
- f24a653: feat: coerce types in ajv for correct validation / usage later on
- Updated dependencies [be68efb]
- Updated dependencies [5295380]
- Updated dependencies [f24a653]
  - @pikku/core@0.5.11

## 0.5.20

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/core@0.5.10

## 0.5.19

### Patch Changes

- 3541ab7: refactor: rename nextDeclarationFile to nextJSFile
- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9

## 0.5.18

### Patch Changes

- b237ace: feat: adding core errors to openapi error specs
- 1876d7a: feat: add error return codes to doc generation
- fda3869: fix: dont ignore decleration files when looking for types
- Updated dependencies [1876d7a]
- Updated dependencies [8d85f7e]
  - @pikku/core@0.5.8

## 0.5.17

### Patch Changes

- 25c6637: fix: fixing a type import for meta types

## 0.5.16

### Patch Changes

- 2654ef1: fix: testing relative files

## 0.5.15

### Patch Changes

- 707b26a: feat: save openapi as yml if needed

## 0.5.14

### Patch Changes

- 0883f00: fix: schema generation error
- Updated dependencies [0883f00]
  - @pikku/core@0.5.6

## 0.5.13

### Patch Changes

- 93b80a3: feat: adding a beta openapi standard
- Updated dependencies [93b80a3]
  - @pikku/core@0.5.5

## 0.5.12

### Patch Changes

- 473ac6a: fix: correcting name of schema root file
  refactor: removing time change in generated files

## 0.5.11

### Patch Changes

- b3dcfc4: feat: adding a bootstrap file to simplify usage

## 0.5.10

### Patch Changes

- 2c0e940: fix: reinspecting after type file is created

## 0.5.9

### Patch Changes

- 0e1f01c: fix: inccorect string replacement

## 0.5.8

### Patch Changes

- 2841fce: fix: create empty schema directory

## 0.5.7

### Patch Changes

- 3724449: fix: fixing a cli path issue

## 0.5.6

### Patch Changes

- 58a510a: refactor: moving routes map into a declaration file

## 0.5.5

### Patch Changes

- 6cac8ab: feat: adding a do not edit to cli generated files
- Updated dependencies [6cac8ab]
  - @pikku/core@0.5.4

## 0.5.4

### Patch Changes

- 8065e48: refactor: large cli refactor for a better dev experience
- Updated dependencies [8065e48]
  - @pikku/core@0.5.3

## 0.5.3

### Patch Changes

- 5e0f033: feat: adding a routes map output file to support frontend sdks in the future
- Updated dependencies [5e0f033]
  - @pikku/core@0.5.2

## 0.5.2

### Patch Changes

- 8712f25: fix: relative paths need to start with ./ for imports to work

## 0.5.1

### Patch Changes

- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1

## 0.4.7

### Patch Changes

- c382ed3: putting glob back to 10 again for node 18 support

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong
- Updated dependencies [2a2402b]
  - @pikku/core@0.4.6

## 0.4.5

### Patch Changes

- 0650348: fix: export schemas using \*
- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- 3019265: fix: ensuring node 18 compatability
- 642d370: fix: adding schema error logs on fail
- Updated dependencies [0650348]
- Updated dependencies [1a708a7]
- Updated dependencies [642d370]
  - @pikku/core@0.4.4

## 0.4.4

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages

## 0.4.3

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them

## 0.4.2

### Patch Changes

- 5a012d9: Fixing typedoc generation
