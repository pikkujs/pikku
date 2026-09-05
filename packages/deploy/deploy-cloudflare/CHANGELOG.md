# @pikku/deploy-cloudflare

## 0.12.14

### Patch Changes

- 265df92: Lift `PlatformServiceContributor` into `@pikku/deploy` so any provider adapter
  can accept the same service contributors.

  A contributor now declares the binding sources its emitted code reads from
  (`requires`, defaulting to `env`). An adapter that cannot provide one of them
  refuses the contributor by name at construction instead of silently emitting
  code that reads bindings the runtime never has.

  `@pikku/deploy-cloudflare` keeps its entry output unchanged and re-exports the
  type from the core package. The container entry it generates now runs only the
  contributors that live on `env`. `@pikku/deploy-standalone` gains a
  `contributors` option: both the node and bun entries build the contributed
  services from `process.env` and spread them last into
  `createSingletonServices`, so a contributed service overrides the in-process
  default.

- Updated dependencies [265df92]
  - @pikku/deploy@0.12.6

## 0.12.13

### Patch Changes

- 32616af: Give the deploy pipeline one shared contract instead of a copy per adapter

  `DeploymentManifest`, `DeploymentUnit`, `EntryGenerationContext` and
  `ProviderAdapter` were hand-copied into eleven source files across the four
  provider adapters and the CLI — three copies inside `@pikku/deploy-cloudflare`
  alone. Nothing compared the copies, so they had already drifted: several typed
  `role` as a bare `string`, and none carried the manifest's addon-scoping fields.

  They now live in a new zero-dependency `@pikku/deploy` package that every
  adapter and the CLI import, and each adapter declares `implements
ProviderAdapter` so the compiler checks it against the contract it claims to
  satisfy. That check immediately caught a real disagreement: the deploy result's
  `workersDeployed` and `resourcesCreated` were `string[]` from Cloudflare — the
  shape the result file and the generated SDK types already record — but
  `Array<{ name: string }>` from the standalone adapter. Both are now `string[]`.

  The Lambda and Azure adapters also derived their esbuild externals from a
  hand-written list of 25 node builtins, so anything outside it (`async_hooks`,
  `perf_hooks`, `timers`, `http2`, …) was bundled instead of resolved from the
  runtime. They now use `nodeBuiltinExternals()`, which reads `builtinModules`
  from the running Node and cannot fall behind it.

- Updated dependencies [32616af]
  - @pikku/deploy@0.12.1

## 0.12.12

### Patch Changes

- f25f4a2: Fix seven defects found taking one project through `pikku fabric` to deploy

  **`deploy plan` rewrote the project's own scaffold.** Per-unit codegen re-runs
  `pikku all` with `--outDir` pointed at a unit's `.pikku`, and scaffold imports
  are computed against `config.outDir` — so `console.gen.ts` came back importing
  `../../../../../.deploy/cloudflare/units/<unit>/.pikku/pikku-types.gen.js` and
  the source stopped typechecking until the next ordinary `pikku all`.

  A guard for this already existed in four generators and had never once fired:
  `LocalVariablesService.get` runs values through `JSON.parse`, so
  `PIKKU_DEPLOY_CODEGEN=1` arrived as the number `1` and every `=== '1'` test
  was false. The comparison is fixed behind a shared `isDeployCodegen`, and the
  real guard now sits in the file writer, which refuses writes _and removals_
  under the scaffold directory for the duration of a per-unit run. Guarding the
  writer rather than each generator matters here: seven further generators had no
  guard at all, several write scaffold source and `.pikku` artifacts in the same
  pass (so an early return would skip too much), and the legacy-scaffold pruners
  delete from the source tree without going through a generator.

  **`fabric validate` passed on a project that could not deploy.** Deploy clones
  the repository, so a `pikkufabric.config.json` that exists only in the working
  tree is absent exactly when it is needed, and the build container aborts with
  `pikkufabric.config.json not found in repository root`. Validate now reports
  that as an error, and its success line distinguishes "can be linked" from
  "will deploy" instead of reporting unqualified success at a project that is not
  linked yet.

  **`description` reached `infra.json` as raw source.** `getPropertyValue` fell
  back to `node.getText()`, which is indistinguishable from the value for a lone
  literal — so nobody noticed that a description written as `'a ' + 'b'` arrived
  with the quotes and the `+` still in it, and rendered that way in the console.
  Compile-time constant strings are now folded, checker-free, so a node that
  cannot be resolved statically still takes the old path.

  **A wired addon that was not installed failed silently.** A missing package
  makes `resolveAddonMeta` return null, which was caught and downgraded to a
  warning; every `ref('<namespace>:…')` then resolved to nothing and the surface
  was dead at runtime with nothing in the build output saying why. The generated
  console is the common case. `wireAddon` now requires its package to be
  installed (`PKU340`), the mirror of the existing `wireRemoteAddon` check whose
  own docs already described this half as if it existed.

  **The audit-table check demanded an unquoted identifier.** Kysely's schema
  builder always quotes, so `create table "audit"` read as missing on the
  projects most likely to have it. Both this and the better-auth table checks now
  share one matcher that accepts each dialect's quoting — matched pairs only, so
  `"audit'` is not a hit — plus an optional schema qualifier.

  **Cloudflare bundles kept `pg`.** `getStubModules()` named `postgres` and
  `kysely-postgres-js` but not `pg`, which is the more common driver in
  application code, equally unreachable on a Worker, and additionally pulls at
  `net`/`tls` and `pg-native`, which a Worker build cannot resolve at all.

  **The deploy plan listed one secret twice.** Two `defineSecret` calls may
  legally share a `secretId` under different local names — the auth scaffold's
  `betterAuthSecret` alongside a hand-written one is the everyday case — and the
  manifest mapped them straight through, so the plan printed two identical
  `create` lines for one resource and `countUnchanged` counted it twice. Secrets
  and variables are now deduplicated in the manifest itself, where variables were
  already being collapsed by accident downstream.

## 0.12.11

### Patch Changes

- 7406bfe: Rename the agent runtime from `AI*` to `Agent*` (#596)

  `AI` described the model provider, not the thing being named. Every symbol that
  belongs to the agent runtime now says `Agent`; the symbols that genuinely wrap a
  model provider — `AIEmbeddingService`, `AIProviderOptions`, `AIEmbedParams`,
  `AITranscriptionParams`, `AIGenerateImageParams` and their siblings, and the
  `@pikku/ai-vercel` / `@pikku/ai-deepinfra` / `@pikku/ai-voice` packages — keep
  their names.

  **Wiring**
  - `pikkuAIAgent` → `pikkuAgent`, `pikkuAIScorer` → `pikkuAgentScorer`,
    `pikkuAIJudge` → `pikkuAgentJudge`
  - `CoreAIAgent` → `CoreAgent`, `AIAgentInput` → `AgentInput`, `AIAgentStep` →
    `AgentStep`, `AIMessage` → `AgentMessage`, and the rest of the agent types
  - `AIAgentRunnerService` → `AgentRunnerService`, `AIStorageService` →
    `AgentStorageService`, `AIRunStateService` → `AgentRunStateService`

  **Entry points**

  `@pikku/core/agent` → `@pikku/core/agent`, `@pikku/core/agent-scorer` →
  `@pikku/core/agent-scorer`.

  **Queues**

  The scorer queues are now `agent-score-fast` and `agent-score-slow`. Drain the
  old `ai-score-fast` / `ai-score-slow` queues before deploying — jobs still
  sitting on them when the new workers start will never be picked up.

  **Scaffolds**

  The agent scaffold pikku wrote for your project — `<scaffold>/agent/agent.gen.ts`
  and its schemas file — imports `@pikku/core/ai-agent`, which no longer exists. A
  scaffold is normally written once and then left alone, so `pikku all` would find
  it present and leave the broken import in place. It now deletes an agent scaffold
  importing either removed entry point and regenerates it in the same run. Anything
  you added to that file goes with it, so move local edits out first.

  **Database**

  The agent tables are renamed: `ai_threads`, `ai_message`, `ai_tool_call`,
  `ai_working_memory`, `ai_run` and `ai_run_score` become `agent_threads`,
  `agent_message`, `agent_tool_call`, `agent_working_memory`, `agent_run` and
  `agent_run_score`, along with their indexes and the `ai_working_memory_pk`
  constraint. The same rename applies to the MongoDB collections.

  `ensurePikkuSchema` creates tables it cannot find, so an existing database will
  get empty `agent_*` tables and leave the old data stranded in `ai_*`. Rename
  them before the first boot on the new version:

  ```sql
  ALTER TABLE ai_threads        RENAME TO agent_threads;
  ALTER TABLE ai_message        RENAME TO agent_message;
  ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
  ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
  ALTER TABLE ai_run            RENAME TO agent_run;
  ALTER TABLE ai_run_score      RENAME TO agent_run_score;
  ```

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

## 0.12.10

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.

## 0.12.9

### Patch Changes

- 637e668: State every package's license in the package itself.

  Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

  `@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.

## 0.12.8

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.7

### Patch Changes

- d720ae8: Expose `serviceNames` (each unit-service's `sourceServiceName`) on `PlatformImports`, so a `PlatformServiceContributor` can gate its imports/emit on a custom platform-specific service being required by the unit — without the OSS adapter needing to know that service by name.

## 0.12.6

### Patch Changes

- e6bb2d6: feat(node-http-server): dispatch cron + queue jobs into the server-target container

  A `deploy: 'server'` unit runs in a long-lived Node container and is never
  uploaded as a CF script, so its scheduled tasks and queue workers previously
  had no way to fire — dispatch only reached CF scripts. `PikkuNodeHTTPServer`
  now mounts two authenticated dispatch routes when `dispatchJobs` is enabled:
  `POST /__pikku/scheduler-job` (`runScheduledTask`) and `POST /__pikku/queue-job`
  (`runQueueJob`), gated by a `dispatchSecret` checked with `timingSafeEqual`
  against an `x-pikku-dispatch` header. The cloudflare adapter's generated server
  entry now passes `{ dispatchJobs: true, dispatchSecret: process.env.PIKKU_DISPATCH_SECRET }`,
  so a fabric proxy can forward `/__pikku/*` dispatch to the container exactly
  like it forwards HTTP — one dispatch primitive for both runtimes.

## 0.12.5

### Patch Changes

- d76d50f: feat(deploy): inject platform services into `target: 'server'` container entries

  The generic server (container) entry booted the user's
  `createSingletonServices(config)` with no platform injection, so a container
  that relies on a platform-provided service (kysely from `DATABASE_URL`, secrets
  from `PIKKU_SECRET_KEK`, …) 500s on first access — the provider's contributors
  only ran in the serverless worker entries.

  The provider adapter gains an optional `generateServerEntrySource(ctx)`; the
  build pipeline now prefers it over the provider-agnostic generator for server
  units. The Cloudflare adapter implements it to emit a `@pikku/node-http-server`
  entry that runs the same contributor-driven `createPlatformServices` as its
  workers — sourcing bindings from `process.env` and merging the result into
  `createSingletonServices` exactly like `setupServices` does on the worker. The
  CF-runtime service blocks (queue/workflow/AI) are omitted since a Node
  container carries no such Worker bindings. Providers that don't implement the
  hook fall back to the unchanged generic generator.

## 0.12.4

### Patch Changes

- 5905864: perf(deploy): stub the Postgres driver out of Cloudflare worker bundles

  Templates construct their Kysely instance from `DATABASE_URL`, branching on the
  URL scheme: a `postgres://` URL pulls in `postgres` + `kysely-postgres-js`, any
  other URL uses the libsql/Turso dialect. On Cloudflare the URL is always libsql,
  so the Postgres branch is never taken — yet esbuild still inlined the Postgres
  driver (~40KB+) into every worker bundle as dead weight.

  Adds a `getStubModules()` provider hook (mirroring `getExternals()`): regex
  sources for modules the provider's runtime never executes, stubbed to `export {}`
  during bundling. The Cloudflare adapter returns `^postgres$` + `^kysely-postgres-js$`.
  Unlike `getExternals`, a stub removes the bytes entirely instead of leaving a
  bare runtime import to resolve. Applied to worker units only (the server
  container keeps Postgres, since it's a real Node process that may use it).
  Verified: cloudflare deploy verifier 21/21; a `postgres` import bundles to 48
  bytes (was 38,032) once stubbed.

## 0.12.3

### Patch Changes

- 9060165: Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.

## 0.12.2

### Patch Changes

- b1b2681: fix(cloudflare): channel unit bundle was missing the `WebSocketHibernationServer` named re-export

  Two issues blocked Workers-for-Platforms channel deploys:
  1. The CF deploy adapter generated `entry.ts` with
     `export { PikkuWebSocketHibernationServer ... } from '@pikku/cloudflare/websocket'`,
     but `PikkuWebSocketHibernationServer` actually lives in
     `@pikku/cloudflare/handler` (`/websocket` exports the abstract base
     `CloudflareWebSocketHibernationServer`). Switched the adapter import to
     `/handler`.
  2. With `bundle: true, format: 'esm'`, esbuild tree-shook the named
     re-export because nothing inside the bundle used it — leaving CF to
     reject the upload with `10070: Cannot apply new-class migration to
class 'WebSocketHibernationServer' that is not exported by script`.
     Added `sideEffects` to `@pikku/cloudflare`'s package.json marking
     `handler-factories.js` and `cloudflare-hibernation-websocket-server.js`
     as side-effectful so esbuild preserves the export.

  Together these let `wireChannel(...)` units deploy to a Workers-for-Platforms
  dispatch namespace with the DO migration accepted.

## 0.12.1

### Patch Changes

- 9e8605f: Add Workers for Platforms dispatch namespace support and AI agent fixes.
  - deploy-cloudflare: Thread dispatchNamespace through deploy pipeline, reads CF_DISPATCH_NAMESPACE env var
  - core: Fix auth-gated tools visible to unauthenticated sessions (null session now hides permission-gated items)
  - core: Recursive null stripping in AI agent tool call resume path
  - ai-vercel: Handle anyOf/oneOf/array types when making optional fields nullable for strict providers

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.
