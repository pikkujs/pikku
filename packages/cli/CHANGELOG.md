## 0.12.65

### Patch Changes

- 194a3e7: fabric validate: error when scaffold.console is enabled but the functions package does not declare @pikku/addon-console — the generated bootstrap imports it, so pikku dev crash-loops in the sandbox without it
- 4c17f7e: user flows: actors move onto the workflow wire + `pikku userflow` command
  - Actors are no longer a singleton service: `startWorkflow(..., { actors })`
    registers them per run and they arrive on the wire —
    `func: async ({ logger }, input, { workflow, actors })`.
  - Inspector enforces user flows are pure remote stories (PKU673): a
    pikkuUserFlow func may only destructure `logger`/`config` from services.
  - New `pikku userflow run <environment> [--flows a,b] [--tags x,y]` runs flows
    against `userFlows.environments` from pikku.config.json (secret from
    USER_FLOW_ACTOR_SECRET env), refusing internal (non-actor) steps so runs
    against staging/production never touch local services; non-zero exit on
    failure. `pikku userflow list` prints names, descriptions and tags.
  - Workflow meta now carries `title` (parity with HTTP routes/functions).

- Updated dependencies [4c17f7e]
  - @pikku/core@0.12.49
  - @pikku/inspector@0.12.33

## 0.12.64

### Patch Changes

- d9e0082: User-flow actor registry in pikku.config.json: `userFlows.actors` (email,
  jobTitle, personality per actor) generates a typed
  `.pikku/workflow/pikku-user-flow-actors.gen.ts` with `userFlowActorConfigs`
  and `createUserFlowActors({ apiUrl, secret })` — wire the result as the
  `actors` singleton service for pikkuUserFlow.
- 8dfddc3: pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
  as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
  effects. Actor steps never queue and never dispatch internally, so auth
  middleware/permissions are exercised end-to-end; flows double as e2e tests and
  staged/production health checks. Ships UserFlowActor types +
  createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
  server-held secret), inspector source `'user-flow'`, and a console badge.
- Updated dependencies [5f2c566]
- Updated dependencies [8dfddc3]
  - @pikku/better-auth@0.12.14
  - @pikku/core@0.12.48
  - @pikku/inspector@0.12.32

## 0.12.63

### Patch Changes

- 59bbef5: fix(cli): default the scaffold directory beside `srcDirectories[0]` (e.g.
  `packages/functions/src/scaffold`) instead of the rootDir-relative
  `src/scaffold`. In a monorepo the old default silently mis-placed generated
  scaffold files (auth.gen.ts, auth-secrets.gen.ts) at the repo root where their
  imports — e.g. `zod` — don't resolve, causing PKU489. Single-package layouts
  (`srcDirectories: ["./src"]`) are unaffected: the derived default is still
  `src/scaffold`. Set `scaffold.pikkuDir` explicitly to override.
- b14df13: `pikku fabric validate`: flag the deprecated Next.js pikku client. Codegen no
  longer emits `nextHTTPFile`/`nextBackendFile` (`nextjs-http.gen` /
  `nextjs-backend.gen`), but a frontend left over from a Next→TanStack migration
  still imports it. That file is gitignored (so `git add -A` never pushes it) AND
  `pikku all` never regenerates it — so it lingers on the dev's disk (validate/tsc
  pass locally) yet is absent in the clean build container, where tsc dies with
  "Cannot find module './nextjs-http.gen'" and aborts the deploy. Validate now
  errors on both the dead config keys and any surviving `nextjs-*.gen` import,
  pointing at the fetch client (`PikkuFetch`/`PikkuRPC` + `createPikku`) generated
  into the functions-sdk.
- 59bbef5: feat(cli): `pikku validate` now checks that `packages/functions` declares
  `zod` v4. pikku's generated schemas and the auth scaffold (auth-secrets.gen.ts)
  both `import { z } from 'zod'`; a missing or non-v4 zod fails codegen (PKU489)
  or type-checking, so surface it as a validation error with a fix hint.
- Updated dependencies [1cd0b2f]
  - @pikku/core@0.12.47

## 0.12.62

### Patch Changes

- 029fe2c: Fail `pikku all` when more than one `@pikku/core` version is installed. A split
  `@pikku/core` produces two separate `pikkuState` registries at runtime, so wirings
  (workflows, RPCs, queue workers, middleware) register into one copy while the runner
  reads the other and they silently fail to resolve (e.g. `WorkflowNotFoundError` for a
  workflow that is clearly registered). The preflight scans the project's `node_modules`,
  and errors (`PKU717`) with the offending versions/paths. Override with
  `PIKKU_ALLOW_DUPLICATE_CORE=1` to downgrade to a warning.
- 7243fec: Add the `pikku-audit` skill documenting the built-in audit runtime: the AuditService sink (Noop / KyselyAuditService / platform-injected), the per-invocation `auditLog` buffer via `createInvocationAudit` in `pikkuWireServices`, the `audit: true` function flag, explicit `auditLog.write()` domain events, and automatic query-level capture via `createAuditedKysely`.
- Updated dependencies [029fe2c]
- Updated dependencies [e9a778f]
  - @pikku/inspector@0.12.31
  - @pikku/core@0.12.45

## 0.12.61

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/better-auth@0.12.13
  - @pikku/bun-server@0.12.2
  - @pikku/core@0.12.44
  - @pikku/deploy-cloudflare@0.12.8
  - @pikku/fetch@0.12.6
  - @pikku/inspector@0.12.30
  - @pikku/kysely-node-sqlite@0.12.3
  - @pikku/node-http-server@0.12.4
  - @pikku/openapi-parser@0.12.11
  - @pikku/schedule@0.12.3
  - @pikku/ws@0.12.3

## 0.12.60

### Patch Changes

- d720ae8: feat(cli): add `pikku audit` — dependency security audit written to `.pikku/audit.json`

  `pikku audit` reports dependency **security advisories** (always) and, with
  `--outdated`, **available dependency updates**. The normalised result is written
  to `.pikku/audit.json` (the config `outDir`) so it rides the same meta pipeline
  as every other generated artifact — uploaded on deploy, readable by tooling.

  Bun is fully supported (`bun audit --json` + `bun outdated`, normalised into a
  single `SecurityAuditReport` with per-severity/per-update-level counts). Other
  package managers are detected but currently stubbed with a `note` field until
  their audit/outdated shapes are normalised. The command never fails a build:
  advisories are informational and a missing/failed audit yields an empty-but-valid
  report.

- d720ae8: `pikku fabric validate`: when a workspace package depends on `@pikku/browser`, verify its `puppeteer` pin matches the version `@pikku/browser` requires (the exact core `@cloudflare/puppeteer` vendors) — error on a mismatch (local rendering would diverge from Cloudflare Browser Rendering), warn when `puppeteer` is absent entirely.
- d720ae8: `pikku fabric validate`: add an undeclared-dependency check. Every external module imported from a workspace package's `src/` must be declared in that package's own dependencies/devDependencies/peerDependencies. Such imports type-check locally (via tsconfig `paths` or root workspace hoisting) but the deploy bundle (esbuild / Bun.build) resolves each package independently and fails with "Could not resolve <pkg>" — aborting the deploy. The check flags these before they reach CI (tsconfig path aliases and workspace package names are excluded to avoid false positives).
- Updated dependencies [d720ae8]
  - @pikku/deploy-cloudflare@0.12.7

## 0.12.59

### Patch Changes

- 249c21d: fix(db): emit `db/schema.gen.ts` instead of `db/schema.gen.d.ts`

  The 0.12.58 rename of `db/schema.d.ts` → `db/schema.gen.d.ts` was half-finished:
  the validate rules and templates were updated to import `#pikku/db/schema.gen.js`,
  but the generated file kept the `.d.ts` extension. With the standard subpath
  import map (`"#pikku/*.gen.js": "./.pikku/*.gen.ts"`), `#pikku/db/schema.gen.js`
  resolves to `schema.gen.ts` — which never existed, so the import failed with
  `Cannot find module '#pikku/db/schema.gen.js'` and every project's `services.ts`
  (`import type { DB } from '#pikku/db/schema.gen.js'`) broke under Node16
  resolution.

  The schema body is type-only (an `import type` from kysely plus interfaces and
  type aliases), so it is valid as a regular `.ts` module — genuinely matching the
  `coercion.gen.ts` / `classification.gen.ts` convention the rename cited. The
  generator now writes `schema.gen.ts`; the zod codegen reads it from the same
  descriptor, so both stay in lockstep.

- Updated dependencies [7b5b10a]
  - @pikku/core@0.12.42
  - @pikku/inspector@0.12.29

## 0.12.58

### Patch Changes

- 9702d8e: fix(deploy): surface Bun.build AggregateError details in bundle failure messages

  Bun.build() throws an AggregateError with per-file resolution errors in its
  `errors` array (not in `.message`). The bundler now includes those messages
  so build logs show the actual "Could not resolve: X" reason instead of a
  bare "Bundle failed".

- 3d5ffda: Rename the generated `db/schema.d.ts` output file to `db/schema.gen.d.ts` to match the naming convention of `coercion.gen.ts` and `classification.gen.ts`.
- Updated dependencies [04db6a2]
  - @pikku/core@0.12.41

## 0.12.57

### Patch Changes

- b49082b: fix(deploy): per-unit bootstrap files use relative imports instead of package names

  When `pikku all --outDir=.deploy/...` runs for per-unit deploy codegen, generated
  bootstrap files now always emit relative imports rather than package-name imports
  (e.g. `../../../../packages/functions/src/...` instead of `@perauset/functions/src/...`).

  Package-name imports from inside `.deploy/` fail in bun workspace projects because
  the deploy directory is not a workspace member, so bun never creates the necessary
  symlinks for package resolution from that location.

  The new `--force-relative-imports` flag on `pikku all` enables this behaviour and is
  passed automatically by the per-unit deploy codegen step.

- 7f0a375: fabric validate: warn when db/annotations.ts and knowledge/\*.md are missing from the project

## 0.12.56

### Patch Changes

- 80141af: feat(cli): native Bun.build bundler + runtime DI split for deploy & dev

  Deploys and `pikku dev` now use a runtime-appropriate implementation chosen once
  via dependency injection, instead of inline `typeof Bun` checks.
  - **Bundler**: a `Bundler` interface with a shared `BaseBundler` (dead-module
    stubbing, dependency extraction, package.json + hashing) and two backends —
    `NodeBundler` (esbuild) and `BunBundler` (native `Bun.build`). Under bun the
    deploy bundle now resolves bun's `.bun` store / per-workspace symlinks natively
    (esbuild's `nodePaths` walk assumes a hoisted root and failed there). Bun's
    metafile omits external imports, so externals are captured via the resolve
    plugin to drive per-unit dependency extraction. Full identifier minification is
    used under bun (safe — pikku's error→status reflection compares same-class
    instances and workflow exceptions hardcode `.name`).
  - **Dev server**: a `DevServerRunner` interface with `NodeServerRunner`
    (`@pikku/node-http-server` + `ws`) and `BunServerRunner` (`@pikku/bun-server`),
    each also supplying the runtime's EventHub.
  - The runtime is resolved once in `services.ts`; `bundler` and `devServerRunner`
    are injected singletons. No `typeof Bun` branches remain in the pipeline or the
    dev command.
  - Also removes a redundant `as` cast on an `rpc.invoke()` result (PKU940) now
    that the generated map types the output.

- c4505d6: build(cli): publish a Windows binary on each release

  The native binary build now compiles a `bun-windows-x64` target alongside the
  existing linux/darwin x64+arm64 builds, producing `pikku-windows-x64.exe`. The
  release job already globs `release/binaries/*` and uploads everything to the
  GitHub release, so the Windows binary is attached to every CLI release with no
  further CI changes.

- 66d43d1: Add `deploy.defaultTarget` to `pikku.config.json` to override the default deploy target ('serverless') for functions without an explicit `deploy` flag.
- d8c34fa: feat(inspector): warn (non-blocking) when a JSON/JSONB column has no concrete tsType

  DB codegen typed every JSON/JSONB column as `unknown` unless a `tsType`
  annotation was set, silently erasing type-safety at every call site. The
  codegen now emits a non-blocking warning (via the existing `warnings[]`
  channel) whenever a JSON/JSONB column resolves to `unknown`/`any` — including
  when it is only annotated `kind: 'json'`, or explicitly `tsType: 'unknown'`
  (allowed but discouraged). The message names the column, the resolved type, and
  the exact annotation to add, so it is actionable by a developer or an AI. A
  concrete `tsType` (e.g. `TicketSpec`) silences it.

- 47f5b35: docs(skills): trim always-loaded skill context by splitting bulky reference material on demand

  The `skill` tool injects the whole `SKILL.md` into the agent's context on every
  load, so large rarely-needed reference blocks were paid for on every invocation.
  Carved the nine heaviest skills: kept the Agent Operating Procedure, decision
  rules, common-path guidance and one canonical example inline; moved exhaustive
  option tables, full API/manifest references, and off-common-path recipes into
  `references/*.md` that the agent reads on demand, each linked by an explicit
  pointer line so no knowledge becomes invisible. Net knowledge loss is zero —
  only location and verbosity changed.
  - pikku-testing 636→328 (cucumber/BDD reference split out)
  - pikku-workflow 334→168 (also reconciled a substantial drift between the OSS
    and bundled copies — merged the union of unique facts before deduping)
  - pikku-services 293→210, pikku-http 318→226, pikku-addon 331→238,
    pikku-middleware 283→226, pikku-realtime 286→236, pikku-cli 281→195,
    pikku-concepts 286→229 (wired the previously-dead `concept-mapping.md`)

  Also makes Zod the only _documented_ function form: the generic
  `pikkuFunc<In,Out>` overload still exists in code but is dropped from the
  generated function-type JSDoc and the concept skills, so generated scaffolds and
  docs show only the `input:`/`output:` Zod-schema form.

- ba1ab08: refactor(workflow): replace `inline: false` with `workflowQueued: true` on function meta

  The per-function workflow dispatch flag has been renamed from the confusing
  negative `inline: false` to the explicit positive `workflowQueued: true`.
  Two companion fields are also added: `workflowRetries` and `workflowTimeout`
  as function-level equivalents of the per-call-site `NodeOptions` fields.

  **Breaking change (patch — flag was undocumented):** rename `inline: false`
  to `workflowQueued: true` on any `pikkuSessionlessFunc` / `pikkuFunc` that
  dispatches its workflow steps via the queue.

  **Behaviour change:** a step marked `workflowQueued: true` now throws if no
  queue service is configured, instead of silently falling back to inline
  execution.

  **Bug fix:** `post-process.ts` was registering `wf-step-*` queues for every
  workflow step node; it now only registers them for steps that are actually
  `workflowQueued: true`, avoiding spurious queue resource allocation.

- Updated dependencies [66d43d1]
- Updated dependencies [a8c9e6d]
- Updated dependencies [ba1ab08]
  - @pikku/inspector@0.12.28
  - @pikku/core@0.12.40

## 0.12.55

### Patch Changes

- 49f738b: Fix `pikkuBetterAuth` codegen fragility on cold bootstrap. The `#pikku` hub
  re-exported `auth/auth.types.js` only after a full inspect, so a cold
  `pikku bootstrap` followed by `pikku db generate` (or the first full inspect)
  crashed importing the user's auth file with `does not provide an export named
'pikkuBetterAuth'`. Bootstrap now detects `pikkuBetterAuth(...)` via a cheap
  AST-free source scan and pre-writes a stub `auth.types.ts` (raw re-export from
  `@pikku/better-auth`) so the import resolves immediately; the typed wrapper still
  overwrites it on the post-inspect pass.
- 9269567: Fix two `pikku dev`/`pikku db seed` failures under the Bun runtime.
  - **IPv4 bind:** `pikku dev` passed `hostname: 'localhost'`, which `Bun.serve`
    resolves to IPv6 `[::1]` only — unreachable from an IPv4 `127.0.0.1` reverse
    proxy. Both the Bun and Node dev servers now bind explicit `127.0.0.1`
    (works on both runtimes; Node previously relied on `--dns-result-order=ipv4first`).
    The user-facing content URL still shows `localhost`.
  - **Seed tolerance:** the Bun sqlite runtime's `exec` threw
    `no valid SQL statement` on comment-only/empty input (e.g. a placeholder
    `seed.sql`), whereas `node:sqlite` silently no-ops. It now skips when nothing
    executable remains after stripping comments; real SQL still runs verbatim.

- 41ff485: fix(inspector): register functions in a dedicated pass before wiring resolution

  The deterministic-codegen change sorted `program.getSourceFiles()` so generated
  output is byte-identical across runs. But function registration (`addFunctions`)
  ran in the same sweep as wiring resolution (`visitRoutes`), so once traversal
  became alphabetical, a wiring file could be visited before the file that defines
  the function it references — e.g. an addon contract (`hello.contracts.ts`)
  before `hello.functions.ts` — producing a spurious `PKU559` ("No function
  metadata found for channel handler").

  Function registration now runs in its own pass (`visitFunctions`) over the
  sorted files, completing before any transport/wiring resolution, so resolution
  no longer depends on source-file order. Also sort the `register.gen.ts` schema
  imports (driven by a `Set`) so that file is stable too, and opt the PII-check
  tests into the now-opt-in classification scan.

- 061c717: fix(cli): log just the message for expected failures, keep the stack for uncaught errors

  A deliberate, expected failure — e.g. `pikku all` aborting because a build gate
  (blocking diagnostics) tripped — was dumping a full workflow stack trace, burying
  the one line that matters. Errors are now classified: a `PikkuError` (or any error
  carrying an `expected` marker) prints its message alone, while a genuinely uncaught
  error still prints the full stack so it can be debugged.
  - New `isExpectedError(error)` helper (exported from `@pikku/core`): true for a
    `PikkuError` or an error flagged `expected`.
  - The `expected` flag is threaded through `SerializedError` and the in-memory
    workflow step store so it survives the step-boundary rehydration that strips the
    error's class.
  - The CLI runner's top-level catch, the `CLILogger`, and the workflow runner's
    failure log all honour it.
  - The blocking-diagnostics abort now throws a `PikkuError` subclass so it is
    treated as expected.

- 6367f47: feat(cli): gate the remote internal RPC scaffold behind `scaffold.remoteRpc`

  The remote internal RPC handler (`rpc-remote.gen.ts` — a `pikku-remote-internal-rpc`
  queue worker plus a `/remote/rpc/:rpcName` HTTP endpoint) was generated for
  **every** project unconditionally, because `remoteRpcWorkersFile` defaulted to
  `<scaffoldDir>/rpc-remote.gen.ts` with no guard. Projects that never invoke RPCs
  across a deployable boundary (the call resolves inline, or service-to-service
  goes through a generated `PikkuRPC`/`PikkuFetch` HTTP client) ended up
  registering an idle queue worker they never dispatch to.

  Remote RPC is now an opt-in scaffold feature, consistent with `rpc`, `agent`,
  `workflow`, `console`, and `events`:

  ```jsonc
  // pikku.config.json
  "scaffold": { "remoteRpc": "no-auth" }
  ```

  or via the CLI: `pikku enable remote-rpc`.

  When `scaffold.remoteRpc` is unset, `remoteRpcWorkersFile` is left undefined and
  `pikkuRemoteRPC` skips generation (same guard the other scaffolds already use) —
  no `pikku-remote-internal-rpc` queue worker, no `/remote/rpc/:rpcName` endpoint.

  **Migration:** projects that rely on pikku's cross-deployable remote RPC
  transport must add `"scaffold": { "remoteRpc": "no-auth" }` (or run
  `pikku enable remote-rpc`) to keep the handler. The `remote-rpc-pg` /
  `remote-rpc-redis` templates (via the shared `functions` template) are updated
  accordingly.

- e6fd12b: perf(inspector,cli): persist generated TS schemas to disk across runs

  `generateAllSchemas` already cached its `ts-json-schema-generator` output
  in-memory (keyed by the generated custom-types content), so the 2nd and 3rd
  inspector passes within a single `pikku all` were near-free. But the cache
  never survived the process, so every fresh `pikku all` paid the full cold cost
  of building a second TS program + running ts-json-schema-generator — on a
  331-function project that's ~2.2s, the single largest line item of a run.

  The cache is now also persisted to disk (`node_modules/.cache/pikku/ts-schemas.json`,
  gitignored by convention), keyed by a hash of the custom-types content plus the
  generator options that affect output. A warm `pikku all` whose function types
  are unchanged loads the schemas from disk and skips schema generation entirely;
  the cold first pass drops by ~3.4s in practice (it also primes the in-memory
  cache for the re-inspect passes). Zod schemas are still regenerated every run
  (already ~1ms each). Output is byte-identical to a cold run (verified across the
  full generated tree). The key is derived from the same content the in-memory
  cache uses, so any type change busts it. It also folds in the `@pikku/inspector`
  package version, so upgrading the inspector (the channel a schema-format change
  ships through) auto-invalidates every cache; `SCHEMA_CACHE_VERSION` remains a
  manual lever for in-development format changes between releases.

  Opt-out: omit `schemaConfig.cacheDir` (the CLI sets it by default).

- 244d892: perf(cli,inspector): make the data-classification scan opt-in (`pikku all --security`)

  `pikku all` was spending the bulk of its wall-clock on the data-classification
  leak check. For every function, on every inspector pass, it called
  `checker.getReturnTypeOfSignature` to infer the handler's return type and scan it
  for `Private`/`Pii`/`Secret` brands — the single most expensive type-checker
  operation. On a 331-function project that was ~7.3s (≈half the total), repeated
  across all three inspector passes, even though the scan only emits diagnostics
  and never affects generated output.

  The scan is a security lint, not codegen, so it's now **off by default** and gated
  behind a new `--security` flag (or `security: true` in the config). A plain
  `pikku all` skips return-type inference entirely; run `pikku all --security`
  (optionally with `--fail-on-error`) in CI/pre-deploy to enforce it. On the
  331-function project this cut `pikku all` from ~15.3s to ~9.6s.

  Also: the `all` command now reads back the run's recorded per-step durations and,
  under `PIKKU_TIMING=1`, prints a slowest-first timing table — making it easy to
  see where codegen time goes without adding any hot-path instrumentation.

- 04604fa: Mount /mcp in generated server/standalone entries when the unit has a non-empty mcp.gen.json. Previously only the dev server (`tsx src/server.ts`) mounted MCP; the deployed bundle (`pikku deploy plan`) never imported mcp.gen.json or passed `mcpJson` to `PikkuNodeHTTPServer`, so MCP tools/resources/prompts silently never served in production or standalone runtimes.
- Updated dependencies [4be205f]
- Updated dependencies [41ff485]
- Updated dependencies [d2078c8]
- Updated dependencies [061c717]
- Updated dependencies [5c0ff0f]
- Updated dependencies [2c55e13]
- Updated dependencies [c745c26]
- Updated dependencies [e6fd12b]
- Updated dependencies [244d892]
- Updated dependencies [940c253]
- Updated dependencies [57900b5]
- Updated dependencies [72694f6]
  - @pikku/core@0.12.39
  - @pikku/inspector@0.12.27
  - @pikku/kysely@0.12.18

## 0.12.54

### Patch Changes

- 5d25125: feat(dev): `pikku dev` serves over the bun runtime when the CLI runs under bun

  When the Pikku CLI itself runs under bun (e.g. the compiled `brew install`
  binary), `pikku dev` now serves over `@pikku/bun-server` (native `Bun.serve`
  WebSockets) instead of the node http server + `ws` package. The bun server is
  dynamically imported and gated on `typeof Bun !== 'undefined'`, so a node-run
  CLI is unaffected and keeps using `@pikku/node-http-server`. The dev server
  shares one `BunEventHubService` between the singleton services and the
  WebSocket transport so channel broadcasts reach connected sockets.

- e443e94: feat(deploy): standalone provider can target the bun runtime

  `pikku deploy plan|apply --provider standalone --runtime bun` now generates a
  `@pikku/bun-server` entry (native `Bun.serve` WebSockets, no `ws` package) and
  compiles the bundle into a single self-contained executable via
  `bun build --compile` — no runtime needed on the target host. The default
  remains `--runtime node`, which is unchanged (ships `bundle.js`, run with
  `node bundle.js`).

  `PikkuBunServer` now accepts an injectable `eventHub` in its options. Inject the
  same `BunEventHubService` you pass to `createSingletonServices` so functions and
  the WebSocket transport share one hub — otherwise a function's
  `eventHub.publish(...)` targets a different hub than the one holding the live
  sockets and broadcasts never reach connected clients. The standalone bun entry
  and the `bun` template now wire this shared hub, fixing cross-connection /
  cross-transport channel pub-sub on bun.

  Also removes the unused `@yao-pkg/pkg` dependency and its stale type shim from
  `@pikku/deploy-standalone` (the pkg-based binary path was dropped in #489).

- Updated dependencies [d5c3c85]
- Updated dependencies [e443e94]
- Updated dependencies [92cd5b1]
  - @pikku/bun-server@0.12.1
  - @pikku/core@0.12.38
  - @pikku/kysely@0.12.17

## 0.12.53

### Patch Changes

- 14ee8e4: fix(react-query): usePikkuInfiniteQuery feeds the page cursor back as `cursor`

  The generated `usePikkuInfiniteQuery` injected the next-page cursor into the
  request under the key `nextCursor`, but a list function built with
  `pikkuListFunc` accepts the cursor as `cursor` (the `ListInput` field) and only
  returns `nextCursor` on the output. So every page re-sent `cursor: undefined`
  and the hook re-fetched page 1 forever. Feed `pageParam` back in as `cursor`
  (and omit `cursor` from the caller's `data` arg) so it lines up with
  `ListInput`/`ListOutput`. The output read in `getNextPageParam` is unchanged.

- 2989738: docs(skills): add negative-trigger scoping to the two n8n skills

  `pikku-n8n-addon-map` and `pikku-n8n-code-translate` were the only
  non-deprecated skills whose descriptions had no "DO NOT TRIGGER when:"
  clause, so an agent could load the wrong one (or load either for plain
  hand-written code). Each description now scopes itself out of the other's
  territory: integration/service stubs → addon-map, Code node stubs →
  code-translate, and neither fires when no n8n-generated stub is involved.

- Updated dependencies [e6bb2d6]
  - @pikku/node-http-server@0.12.3
  - @pikku/deploy-cloudflare@0.12.6

## 0.12.52

### Patch Changes

- ed548d5: fix(auth): skip the generated global `betterAuthSession()` when the user registers their own

  The CLI's `auth.gen.ts` unconditionally wired a global
  `addHTTPMiddleware('*', [betterAuthSession()])` (default map) on the stateful
  path. A project that needs a customized session bridge — `mapSession`,
  `impersonation`, `apiKey` — had to register a second global
  `betterAuthSession({...})`, leaving two in the chain; the generated default ran
  first and short-circuited (`if (session) next()`) so the custom one never took
  effect.

  The inspector now records `state.auth.hasUserSessionMiddleware` when it sees a
  user-authored **global** `betterAuthSession` registration (route-scoped and
  `.gen.ts` registrations are ignored, so regeneration never self-suppresses).
  The CLI omits its own global `betterAuthSession()` from `auth.gen.ts` when that
  flag is set — exactly one session bridge in the chain, the user's. Mirrors the
  existing stateless skip (`userStatelessSession`, #754).

- Updated dependencies [a3f55de]
- Updated dependencies [ed548d5]
  - @pikku/better-auth@0.12.12
  - @pikku/inspector@0.12.26

## 0.12.51

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

- Updated dependencies [6f06813]
- Updated dependencies [d76d50f]
  - @pikku/fetch@0.12.5
  - @pikku/deploy-cloudflare@0.12.5

## 0.12.50

### Patch Changes

- dac22cd: fix(cli): default Fabric API URL to production

  The fabric CLI defaulted `DEFAULT_API_URL` to `http://localhost:7103`, so
  `pikku fabric login` / `pikku fabric addon publish` hit a local backend
  out of the box — producing confusing "Code not found" / 404 errors for
  anyone not running fabric-api locally. Default to
  `https://api.pikkufabric.com`; local dev opts in via `FABRIC_API_URL` or
  `pikkufabric.config.json` (both rank above the default in the resolution
  order, so nothing changes for core devs).

- a1acc23: fix(console): make the Tests tab show scenarios after a run

  The Tests tab renders scenarios from `meta.functions[].tests.scenarios`, which
  `readAllMeta()` builds by reading the function-tests harness's coverage JSON and
  Cucumber HTML report. Three drifts left every function with `tests: undefined`:
  - **`loadFunctionTests` looked in the wrong place.** It probed
    `function-tests/coverage/function-coverage.json` and
    `function-tests/tests/reports/cucumber-report.html`, but the harness (and
    `pikku tests coverage`) actually write `tests/.coverage/function-coverage.json`
    and `tests/tests/reports/cucumber-report.html`. It now anchors on
    `resolveFunctionsDir(metaService.basePath)` — the same single source of truth
    the run handlers and coverage writer use — and keeps the old relative paths as
    a fallback.
  - **The console "Run tests" stream never wrote the HTML report.** It ran
    Cucumber with `--format message` only (for the live view), so scenarios
    vanished once the run finished. It now also emits
    `html:tests/tests/reports/cucumber-report.html`.
  - **`pikku tests coverage` had the same gap** — no `--format`, so no report.
    It now writes the HTML report alongside the default progress output.

- 49cba1e: fix(cli): auto-construct the AI agent runner in `pikku dev`

  Deployed agent units get their `aiAgentRunner` wired by the bundler, but the dev
  server had no equivalent — so agents run against `pikku dev` (e.g. in a fabric
  sandbox) threw `AIProviderNotConfiguredError` and surfaced as a 503. The dev
  command now builds a `VercelAIAgentRunner` from env when an OpenAI-compatible
  base URL + key are present (`OPENAI_BASE_URL`/`OPENAI_API_KEY`, falling back to
  `LITELLM_PROXY_URL`/`LITELLM_API_KEY`) and injects it into the singleton
  services. `@pikku/ai-vercel` + `@ai-sdk/openai-compatible` are resolved from the
  project's `node_modules` (so they share the project's `ai` version) and loaded
  dynamically; when the env or packages are absent the runner is simply omitted
  and the clear downstream error is preserved.

- 44f77c4: feat(deploy): server-target container image uses `FROM node:26` (full)

  The generated `SERVER_DOCKERFILE` for `target: 'server'` units now builds on
  the full `node:26` image instead of `node:22-slim`. A server container is a
  real Node runtime that may pull externalised deps with native addons; the slim
  image lacks the build toolchain (python3/make/g++), so any dep that compiles
  from source at `npm install` time would fail. The full image carries the
  toolchain and bumps the runtime to Node 26.

- 11bcae0: db codegen: type SQLite `CHECK (col IN ('a','b',…))` columns as string-literal
  unions, and emit a standalone bare-enums module for both dialects.

  SQLite has no native enums, but a column-level `CHECK … IN (…)` constraint is an
  enum by another name — the introspector now parses it from the table DDL and the
  generated Kysely schema types the column as `'a' | 'b' | …` instead of `string`
  (mirroring how Postgres enum columns are typed). Only the positive `col IN (…)`
  form is recognised; `NOT IN`, ranges, and boolean expressions stay `string`.

  Also emits `.pikku/db/enums.gen.ts` — bare `export type <Table><Column>` unions
  for every enum column (Postgres native enums and SQLite CHECK alike), independent
  of the wrapped `ColumnType<Private<…>>` DB interface. Callers (and i18n catalog
  reconciliation) can import a clean union without unwrapping.

- Updated dependencies [7d959ed]
  - @pikku/better-auth@0.12.11

## 0.12.49

### Patch Changes

- 5e594dd: fix(fabric-validate): require scaffold surfaces and gitignore generated artifacts

  `pikku fabric validate` now checks the project's `pikku.config.json` `scaffold`
  block for the public surfaces the Fabric console depends on: `console`, `rpc`,
  `agent` and `workflow` are errors (each gates HTTP/RPC endpoints the console
  calls directly — e.g. a missing `agent` 404s `/rpc/agent/:agentName` and a
  missing `workflow` 404s `/workflow/:workflowName/start`), and `events` is a warn
  (the realtime channel is feature-dependent). It also warns when `.gitignore`
  does not ignore the regenerated artifacts `.opencode`, `.pikku`, `.pikku-runtime`,
  `__fabric_scaffold.vite.config.mjs`, and generated files (`*.gen.*`, or the
  `*.gen.ts` + `*.gen.js` pair).

## 0.12.48

### Patch Changes

- b6ba601: fix(lint): don't flag pikkuAuth's session param as a non-destructured wire

  `pikkuAuth`'s handler is `(services, session)` — the second parameter is the
  resolved user session, not a wires bag. The inspector was extracting "wires"
  from that parameter (`extractUsedWires(handler, 1)`), so a permission like
  `pikkuAuth(async ({ logger }, session) => !!session)` tripped
  `wiresNotDestructured` even though `session` cannot be destructured. pikkuAuth
  exposes no user-facing wires parameter, so no wires meta is recorded for it.

- cac0380: Fix generated email renderer hash typing for generic template names.
- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.
- 1de0ea4: Default `servicesNotDestructured` and `wiresNotDestructured` lint rules to `'error'`

  Both rules now fail the build by default. A non-destructured `services`/`wire` param hides which services/transports a function uses (defeating tree-shaking) and usually masks a missing type behind a cast that silently drifts. The whole `wire` is never genuinely needed — destructure the transport you use (`{ rpc }`, `{ http }`, `{ channel }`). Projects can override either rule to `'warn'`/`'off'` in `pikku.config.json`.

- decdad5: fix(lint): don't fail the build on framework-synthesized functions

  The `servicesNotDestructured`/`wiresNotDestructured` defaults (`error`) were
  tripping on functions the user can't edit: generated `.gen.ts` wrappers (the
  opaque `authHandler`, the cli channel raw dispatcher) and synthetic route→addon
  bridges (`http:<method>:<route>`, no source file). `computeDiagnostics` now skips
  any function without a real, non-generated source file, so the lint only nudges
  hand-written user code. Also destructures the CLI's own `all` command.

- Updated dependencies [b6ba601]
- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
- Updated dependencies [decdad5]
  - @pikku/inspector@0.12.25
  - @pikku/core@0.12.37

## 0.12.47

### Patch Changes

- 25a1f6d: Make the function-test harness work for monorepo + engine-aware projects:
  - `@pikku/addon-console`: the Run-tests and coverage handlers now resolve the
    functions dir robustly (`<root>/packages/functions` when present), and
    `getFunctionCoverage` reads the actual coverage output path
    (`tests/.coverage/function-coverage.json`) instead of a stale
    `function-tests/coverage/...` path — so the console's coverage button works in
    monorepo sandboxes.
  - `@pikku/cli`: `pikku tests init` now detects the db engine (`db/sqlite` /
    `db/postgres`) and points the harness at the correct migrations + seed
    (`db/<engine>` + `db/<engine>-seed.sql`) instead of the hardcoded
    `db/migrations`. It also scaffolds a green starter `example.feature` and an
    empty `yarn.lock` (so the standalone tests package installs under Yarn Berry).
    Postgres harness support is tracked in #758.
  - `@pikku/cucumber`: `createDbUtils.buildBaseDb` tolerates a missing/empty
    migrations dir or seed file instead of crashing on `scandir('')`.

- Updated dependencies [7c0b318]
- Updated dependencies [f6adc1c]
- Updated dependencies [ade6f0b]
  - @pikku/better-auth@0.12.10
  - @pikku/core@0.12.36
  - @pikku/fetch@0.12.4

## 0.12.46

### Patch Changes

- 5fe3f47: fix(better-auth): skip the auto-generated stateless session middleware when the
  project registers its own. Closes #754.

  With `session.cookieCache` enabled the CLI generates a global
  `betterAuthStatelessSession()` using the default `{ userId }` map. Because session
  middleware short-circuits once a session is set (`if (session) next()`) and the
  generated file is imported before user wirings, that default-map middleware ran
  first and **pre-empted** a project's own `betterAuthStatelessSession({ mapSession })`
  — silently dropping custom session fields (`role`, `locale`, …).

  The inspector now detects a user-owned global registration (a
  `betterAuthStatelessSession(...)` call inside `addGlobalMiddleware` or the global
  form of `addHTTPMiddleware` — the array form or the `'*'` pattern, not a
  route-scoped `addHTTPMiddleware('/path', …)`; ignoring `.gen.ts` files and bare
  standalone calls) and
  sets `state.auth.userStatelessSession`. When set, the CLI skips writing
  `auth-middleware.gen.ts` (and removes a stale one) so the project's own middleware
  — with its custom `mapSession` — is the only one registered. Projects without a
  custom map are unaffected: the default middleware is still generated.

- ef473b4: `pikku fabric validate`: warn when a frontend `apps/<name>` does not declare
  `@babel/core` in its devDependencies. The scaffolded dev vite config (from
  generate-frontend-runtime) imports `@babel/core` to tag JSX with `data-om-id`
  for design alt-click editing; it only resolves transitively via
  `@vitejs/plugin-react`, so declaring it explicitly stops that resolution from
  silently drifting away and breaking the instrumentation.
- 67ef7b7: `pikku fabric validate`: convergence checks for the canonical frontend stack. Every React app must ship **Paraglide JS** (inlang) for i18n — `@inlang/paraglide-js` plus a wired `messages/<locale>.json` + `project.inlang/settings.json`, with strings routed through `m.*()` / `useLocale()` from the `@/i18n` scaffold. The i18next → Paraglide cutover is hard (no back-compat): a residual `i18next`/`react-i18next` dependency, or a leftover `useTranslation()`/`useI18n()` call or `i18next` import, is now an error. Apps must still import Mantine components from `@pikku/mantine/core` (not raw `@mantine/core`, which bypasses the i18n-typed compile gate), and each module-singleton-sensitive dep (vite, @tanstack/start-plugin-core, react, react-dom) must resolve to a single physical copy (a second copy splits TanStack Start dev SSR and 404s the frontend).
- 6b70ec4: feat(fabric-validate): warn when better-auth units won't tree-shake. `pikku
fabric validate` now flags two anti-patterns that force every non-auth unit to
  bundle the full better-auth server (~2.5MB each, bloating bundles and the serial
  deploy uploads): (1) a `pikkuBetterAuth` config that doesn't enable
  `session.cookieCache` — fix by adding `session: { cookieCache: { enabled: true } }`
  so the CLI splits out the lean `betterAuthStatelessSession`; and (2) a
  hand-written global `addHTTPMiddleware('*', [betterAuthSession()])` that pulls the
  stateful bridge into every unit. Both are `warn` severity. Note: a custom
  `mapSession` is currently pre-empted by the generated stateless middleware
  (pikkujs/pikku#754), so the stateful workaround stays valid until that's resolved.
- 33157b9: perf(deploy): minify every deploy bundle (~50% smaller workers)

  The per-unit deploy bundler ran esbuild with `minify: false` — the unminified
  output shipped straight to the runtime (CF Workers / server container), even
  though tsc/esbuild, not the runtime, does the bundling. Enabling `minify: true`
  halves every unit's `bundle.js` (e.g. a DB-backed HTTP unit 1205KB → 722KB,
  auth-handler 2167KB → 1067KB), which directly cuts the serial CF upload time on
  deploy. `keepNames: true` preserves `Function.name` / `constructor.name` so any
  name-based reflection keeps working. Verified against the cloudflare deploy
  verifier: 21/21 checks pass, total unit bytes 50.3MB → 29.0MB.

- 3ba12ca: Stop consumed-addon parent services from polluting every per-unit deploy bundle, and stub the AI SDKs out of non-agent units.

  `aggregateRequiredServices` added `addonRequiredParentServices` (the services a consumed addon needs from its parent — e.g. `aiAgentRunner`, `deploymentService`, `metaService`) to **every** unit's `requiredServices` unconditionally. For any project that consumes an addon, this marked those services required on all units, so the per-unit service tree-shaking (and the gen-file/module stubs that key off the `false` flags) never fired — every unit shipped the full set. These parent services are now added only to units that actually deploy an addon function (its `pikkuFuncId` appears in `usedFunctions`); a unit that only calls the addon over RPC, or never touches it, no longer carries them.

  On the back of the now-honest flags, the bundler stubs the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`, `ai`) out of any unit where `aiAgentRunner` is not required, via a new service→module stub map alongside the existing gen-file stub map. The shared services factory must guard runner construction behind a defined-check on the dynamic import so a stubbed unit simply skips building the runner.

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

- Updated dependencies [5fe3f47]
- Updated dependencies [3ba12ca]
- Updated dependencies [5905864]
  - @pikku/inspector@0.12.24
  - @pikku/deploy-cloudflare@0.12.4

## 0.12.45

### Patch Changes

- 807a8d0: Add `refHTTP` / `refChannel` / `refCLI` so a consumer can wire an addon's HTTP routes, channel actions, and CLI commands directly from the addon's published `.pikku` contract metadata — no addon source is imported and nothing is hand-wired. These mirror the existing `ref('namespace:fn')` helper: each reference resolves the addon's already-loaded contract (via `wireAddon`) and proxies every function through `ref()` (RPC) at runtime.
  - **Inspector:** `wireHTTPRoutes`/`wireChannel`/`wireCLI` now expand `refHTTP('ns:contract')` / `refChannel('ns:contract')` / `refCLI('ns:contract')` call expressions against `state.exportedContracts.addon{Http,Channel,Cli}` (already namespaced and `packageName`-tagged by `loadAddonFunctionsMeta`). An optional second argument overrides the mount basePath, e.g. `refHTTP('ext:helloRoutes', { basePath: '/ext' })`; otherwise the addon contract's own basePath is preserved.
  - **CLI codegen:** the generated `pikku-function-types.gen.ts` now emits `refHTTP`/`refChannel`/`refCLI` (exported through `#pikku`) backed by const maps built from each wired addon's contract metadata, with every function pre-bound to `ref('ns:fn')`. Type-checking and runtime wiring resolve from the same generated artifact, so a reference can never be an inert marker.
  - **Addon authoring bans:** when inspecting an addon package (`isAddon`), the inspector now raises a critical error if the addon calls a transport wiring helper (`wireHTTP`/`wireHTTPRoutes`/`wireChannel`/`wireCLI`/`wireScheduler`/`wireQueueWorker`/`wireMCPPrompt`/`wireMCPResource`/`wireTrigger`/`wireTriggerSource`/`wireGateway`/`wireAddon`) — these are the consuming app's responsibility (`PKU920`) — or if a `define*` contract carries `middleware`/`permissions`, which the consuming app applies, not the addon (`PKU921`). Service declarations (`wireSecret`/`wireVariable`/`wireCredential`) and function-level middleware/permissions remain allowed.
  - **Deploy-bundle fix:** the HTTP/channel/CLI codegen commands now always emit their wiring and meta gen files once they report the category as active (truthy return), including the contracts-only or synthetic-route case where there are no local `wireHTTP`/`addChannel`/`wireCLI` source files. The generated bootstrap imports those files unconditionally, so skipping them left per-unit deploy bundles (e.g. Cloudflare units for scheduled tasks and workflow steps) unable to resolve `pikku-http-wirings.gen.js` and failing to build.

- Updated dependencies [807a8d0]
  - @pikku/inspector@0.12.23

## 0.12.44

### Patch Changes

- d64fbd9: db migrate: stub secrets during Better Auth schema introspection. The drift check
  loads the app's auth factory only to derive the table/column shape, so it no longer
  requires the app's real secrets (e.g. `BETTER_AUTH_SECRET`) to be present in the
  environment — a fake secret service resolves every key to a placeholder.
- 8e72c93: `pikku fabric publish` now packs with `npm pack` (honouring the package's `files` field and matching a normal install's layout) instead of a hand-rolled tar. `pikku fabric add` installs the artifact into the project's `node_modules/<package-name>/` — the location `wireAddon({ package })` resolves via `require.resolve` — stripping npm's `package/` prefix, instead of copying source into `src/addons/<id>/` where it could not be wired.
- 8e72c93: Add `pikku fabric publish [dir]` and `pikku fabric add <id>` for the Fabric community registry. `publish` packs a package directory into an artifact and uploads it via a short-lived presigned URL (authenticated; attributed to the publisher's org or person). `add` resolves a public presigned download and copies the package source shadcn-style into `addons.addonDir` (new `pikku.config.json` config, default `src/addons`).
- d0f5648: fix(cli): dev sqlite dialect now reads `INSERT ... RETURNING` rows. The node:sqlite-backed dialect set `reader` from `stmt.reader`, which node:sqlite always leaves undefined, so kysely ran returning-inserts via `.run()` and dropped the rows — breaking better-auth sign-up (it inserts a row and reads it back) with "Failed to create user". `reader` is now derived from the SQL (`SELECT` or `RETURNING`).

  feat(fabric-validate): warn when a better-auth `createAuthClient` baseURL omits the `/auth` segment. The Fabric edge (and the sandbox Caddy) keep the `/api` prefix for the better-auth unit, so the DEFAULT server basePath `/api/auth` is correct and needs no override. The real footgun is the client: better-auth appends the endpoint to baseURL verbatim, so a bare `/api` baseURL yields `/api/sign-in/email` (no `/auth`) and 404s. `pikku fabric validate` now warns and suggests `baseURL: \`${apiUrl()}/auth\``.

- b674ca7: fabric validate: enforce minimum @pikku/\* versions. `pikku fabric validate` now
  scans every workspace manifest and errors when a gated @pikku package is below
  the required floor (per-package, since the packages version independently). A
  stale @pikku/cli ships a `pikku dev` that hangs without ever listening, and a
  mismatched @pikku/core splits pikkuState into duplicate copies so app/console
  routes 404 — both are hard blockers for a Fabric sandbox, so they fail validate
  with a bump-and-reinstall fix hint.
- 6bca38f: docs(skills): add the `pikku-emails` skill documenting file-based email templates — directory layout, templating syntax, per-template typed variables, `pikku emails generate`, and rendering/sending through an EmailService.
- 6bca38f: fix(emails): scope generated template variables to each template. The email codegen fed every string in the shared locale file into every template's variable list, so a variable interpolated by one template's locale string (e.g. `inviterName` in an invitation subject) leaked into the typed `data` of unrelated templates. Variables are now collected only from the locale keys and partials each template actually references (transitively).
- 6645e7a: Add a severity model for coded diagnostics so security findings can surface without blocking the dev server.
  - `InspectorLogger` gains `diagnostic({ severity, code, message })` (`severity: 'warn' | 'error' | 'critical'`). `critical(code, message)` is now sugar for `diagnostic({ severity: 'critical', ... })`.
  - The CLI fails the build only on `critical` diagnostics by default. New global flags `--fail-on-error` and `--fail-on-warn` (implies `--fail-on-error`) opt into stricter gating; `--fail-on-critical` is always on.
  - Data-classification leaks (`PKU910`) are now emitted at `error` severity instead of `critical`. They are still printed, but no longer abort `pikku all` / the dev server — pass `--fail-on-error` (e.g. at deploy) to make them blocking and recommend a fix.
  - Contract-immutability drift (`PKU861`) during `pikku versions update` (run inside `pikku all`) no longer calls `process.exit(1)`. It is surfaced as an `error` diagnostic and skips saving the manifest, so a stale baseline can't crash-loop the dev server. `pikku versions check` remains the hard gate, and `--fail-on-error` makes `pikku all` block on it at deploy.

- 02a4499: `pikku fabric validate` now flags a missing `scaffold.console` in `pikku.config.json`. Without it the console addon's introspection RPCs (`console:getFunctionsMeta`, `console:getAllMeta`, …) are never scaffolded, so tools that introspect a running app (e.g. the Fabric sandbox builder) hit 404s and show no functions. The fix hint suggests `"console": "no-auth"` (or `"auth"`).
- Updated dependencies [06234a9]
- Updated dependencies [8e72c93]
- Updated dependencies [6645e7a]
- Updated dependencies [6bca38f]
  - @pikku/inspector@0.12.22
  - @pikku/core@0.12.35

## 0.12.43

### Patch Changes

- ef50347: Tree-shake the better-auth server out of non-auth units.
  - `@pikku/better-auth`: add `betterAuthStatelessSession()` — a session middleware that verifies the signed better-auth cookie cache via `better-auth/cookies` (`getCookieCache`) using only `BETTER_AUTH_SECRET`, with no `services.auth()`, DB round-trip, or full server import. Mark the package `sideEffects: false` so unused barrel re-exports drop.
  - `@pikku/cli`: when `session.cookieCache` is enabled in the better-auth config, generate the stateless session middleware into a separate `auth-middleware.gen.ts` and wire it globally, keeping the full `/api/auth/**` server only in the auth unit. Deploy artifacts (esbuild metafile + sourcemap) are now off by default; `--debug-artifacts` re-enables them.
  - `@pikku/inspector`: ensure the orphan `auth-middleware.gen.ts` (imported by nothing) is still inspected so its global `addHTTPMiddleware('*')` registration is not dropped.

  Net effect: a non-auth unit carries ~22KB (cookie-verify floor) instead of the full ~1.25MB better-auth backend.

- Updated dependencies [ef50347]
  - @pikku/inspector@0.12.21
  - @pikku/better-auth@0.12.9

## 0.12.42

### Patch Changes

- c16676f: Use an embedded PGlite instance for the Better Auth drift-detection scratch database in `pikku db migrate`, instead of issuing `CREATE DATABASE` against the target Postgres. Creating a real scratch database required the `CREATEDB` privilege, so `pikku db migrate` failed (error 42501) against managed or locked-down Postgres where the application role correctly lacks it. PGlite is real Postgres, so schema introspection stays accurate while needing no server privileges.
- 33e7750: `pikku fabric link` now returns and logs the linked project's id (`projectId=<uuid>`) alongside its slug. Previously only the slug was emitted, forcing callers (and the e2e harness) to do a follow-up lookup to resolve the project id before operating on it (e.g. requesting a sandbox).
- fda377d: Add `pikku fabric smoke` for clean-room Fabric validation and make its readiness checks work with localhost-bound dev servers.

## 0.12.41

### Patch Changes

- 2eaa9fd: feat(cli,better-auth): unified machine + human auth (pikku login + api-key)

  A single better-auth-backed model for authenticating CLIs and machines.
  - **Human**: `pikku login` / `logout` / `whoami` run a device-authorization flow
    and persist a session at `~/.pikku/session.json` (0600, keyed by base URL, with
    expiry).
  - **Machine**: `betterAuthSession()` gains a stateless api-key branch — it resolves
    scope via `verifyApiKey` (not `getSession`, which drops metadata) and is
    authoritative when the `x-api-key` header is present.
  - **Auto-wire**: generated channel CLI clients attach the credential on the WS
    upgrade handshake (`PIKKU_API_KEY` → `x-api-key`, else the stored token →
    `Bearer`), so `betterAuthSession` resolves before the channel opens.

  `@better-auth/api-key` is a separate official package (not in the better-auth
  plugins barrel); peer-requires `better-auth ^1.6.19`.

- Updated dependencies [2eaa9fd]
- Updated dependencies [2eaa9fd]
  - @pikku/better-auth@0.12.7
  - @pikku/core@0.12.34

## 0.12.40

### Patch Changes

- f6a32db: Fix `pikku deploy plan/apply` failing when `outDir` differs from `rootDir/.pikku`.

  `build-pipeline` was hardcoding `pikkuDir = join(projectDir, '.pikku')`, ignoring
  the `outDir` config option. Projects that set a custom `outDir` (e.g. a monorepo
  where sources live in a sub-package) would get a build error:
  `Could not resolve "../../../.pikku/pikku-bootstrap.gen.js"`.

  `pikkuDir` now falls back to `join(projectDir, '.pikku')` only when `outDir` is not set.

- 50a96f8: Improve Fabric validation fix hints for coding agents and add `lineBreaks` plus numeric `Text` children support in Mantine.
- d729cf8: Add embedded PGlite-backed Postgres support for local dev and DB commands when `db/postgres` is present without a configured `postgresUrl`, while keeping real Postgres as the explicit path when `postgresUrl` is set.
- Updated dependencies [5c67b7e]
- Updated dependencies [1b22977]
  - @pikku/core@0.12.33

## 0.12.39

### Patch Changes

- c871920: Fix Better Auth drift check incorrectly reporting tables as missing when they live in a non-public Postgres schema (e.g. `app.user` not matching desired `user`).
- 837c397: Fix a Better Auth schema-drift false positive in `pikku db migrate`. Better
  Auth's desired schema uses bare table names (`user`, `account`, …) while
  Postgres introspection returns schema-qualified names (`public.user`). The
  diff now falls back to matching a bare desired table against a uniquely
  schema-qualified introspected table, so a fully-migrated Postgres database no
  longer reports every auth table as missing (which aborted the migrate with a
  spurious "run `pikku db generate`").

## 0.12.38

### Patch Changes

- ee6d80f: Fix Better Auth schema introspection during `pikku db migrate` by using
  `LocalVariablesService` and `LocalSecretService` for the non-runtime auth
  factory context instead of a handwritten stub with the wrong variables
  interface shape.
- db2fe60: Honor Better Auth `database.type = "postgres"` when computing desired auth schema and drift.
- 5cd8929: Add a `startServerFnsFile` codegen option that emits a TanStack Start server-function shim.

  When set in `clientFiles`, the CLI generates a typed `makeApi(): PikkuRPC` caller over the generated RPC map for use in Start loaders, actions and components. The shim reads the API base URL from `import.meta.env.VITE_API_URL` (throws if unset) and imports the `PikkuRPC` class from `rpcWiringsFile`, so the import path is always correct relative to the app. Self-skips when `startServerFnsFile` is unset and warns when `rpcWiringsFile` is missing.

- 85e6c33: Update Fabric validation to respect `pikku.config.json` `db.engine` when
  checking migration layout and database adapter usage, and standardize Fabric
  project conventions on `pikkufabric.config.json` plus
  `packages/mantine-theme`.
- d7e1edb: Fix Postgres DB schema codegen for schema-qualified tables so `pikku db migrate`
  emits legal flat interface names like `InstitutionsCountry` instead of invalid
  dotted identifiers such as `Institutions.country`.
- e7fac23: Fix `INSERT ... RETURNING` statements being treated as write queries on Node.js 22+

  `node:sqlite`'s `StatementSync` has no `.reader` property (unlike `better-sqlite3`).
  The fallback SQL inspection only checked for `SELECT`, `WITH`, `PRAGMA`, `EXPLAIN`,
  and `VALUES` prefixes, so `INSERT ... RETURNING *` was incorrectly classified as a
  write query. Kysely then called `stmt.run()` (which discards rows) instead of
  `stmt.all()`, causing `INSERT ... RETURNING` to return no data — breaking
  `better-auth` user creation and any other query that relies on `RETURNING`.

  Fix: add `|| /\bRETURNING\b/.test(upper)` to the reader-detection heuristic so any
  statement containing a `RETURNING` clause is correctly dispatched to `stmt.all()`.

## 0.12.37

### Patch Changes

- ee48848: Replace `workspace:` protocol ranges in published dependency fields with literal
  version ranges. Our publish path (`changeset publish`) does **not** rewrite the
  workspace protocol, so these leaked verbatim into npm:
  - `@pikku/cli` declared `@pikku/better-auth: "workspace:*"` in `dependencies`,
    which shipped to `0.12.36` and made it uninstallable for any consumer that
    doesn't already pin better-auth (`@pikku/better-auth@workspace:*: Workspace
not found`).
  - `@pikku/mantine` declared `@pikku/react: "workspace:^"` in `peerDependencies`
    (leaked as a peer warning rather than a hard failure).

  Both now use literal caret ranges, matching every other `@pikku/*` dependency.
  A `scripts/check-no-workspace-protocol.mjs` guard now runs as a `validate-deps`
  CI job (and gates `yarn release`) to fail the build if a `workspace:` range ever
  appears in a published dependency field again (`devDependencies` are exempt —
  they are stripped on publish).

- Updated dependencies [6565b97]
- Updated dependencies [34f254e]
  - @pikku/kysely@0.12.16
  - @pikku/kysely-node-sqlite@0.12.2

## 0.12.36

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

- a027a8e: fix: typed secret/variables access in Better Auth factories + cucumber Actor cookie jar
  - **cli**: the generated `#pikku` `pikkuBetterAuth` wrapper now substitutes the
    project's generated `TypedSecretService` / `TypedVariablesService` for the base
    `secrets` / `variables` services (typed and wrapped at runtime, the same way
    addon services are). The auth factory can read provider secrets straight off
    the generated `CredentialsMap` — `socialProviders: { github: await
secrets.getSecret('GITHUB_OAUTH') }` — with no inline `getSecrets<{ ... }>()`
    generic. (Provider secrets are wired as before, from the `socialProviders`
    keys, so they appear in the credentials map.)
  - **cucumber**: `Actor` gains an additive cookie jar — `cookieFetch` (a
    `customFetchImpl` that replays stored cookies, stamps `Origin`, and captures
    `Set-Cookie`), plus `cookieHeader`, `storeSetCookie`, and `clearCookies`. This
    lets a cucumber actor drive a real cookie-backed session (e.g. the Better Auth
    client SDK) instead of hand-rolling a jar per suite. The existing JWT/bearer
    actor behaviour is unchanged.

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

- a027a8e: fix(cli): don't inspect during the cold bootstrap function-types pass

  `pikkuFunctionTypes` began calling `getInspectorState()` to decide whether to
  re-export the typed `pikkuBetterAuth` from the generated types hub. But it also runs
  as the cold bootstrap step whose job is to _write_ `.pikku/pikku-types.gen.ts`
  before any inspection happens — and a full inspect runtime-imports user files
  that themselves import that not-yet-written file, deadlocking on a cold `.pikku`
  (`pikku bootstrap` returned rc=1 with the types file missing; schema generation
  for a `wireSecret` schema failed with "Cannot find module
  .pikku/pikku-types.gen.js"). The function-types step now takes a `{ bootstrap }`
  flag (matching the other bootstrap type steps) so the cold pass skips inspector
  state entirely; the auth re-export is added on the later post-inspect pass where
  `.pikku` already exists.

- a027a8e: feat(cli): `pikku db generate` + Better Auth drift guard in `pikku db migrate`

  The Better Auth schema is owned by `pikkuBetterAuth`, not hand-written, so the
  committed SQL migrations can silently fall behind the auth config (a stale
  migration deploys a half-applied auth schema and `signUp` 500s at runtime).

  `pikku db generate` asks Better Auth for its required schema and, when the
  existing migrations don't yet cover it, writes a forward SQL migration. The
  schema is materialised by running Better Auth's own `runMigrations()` through the
  project's CamelCasePlugin kysely (so columns are snake_case), then drift is
  detected by introspection set-diff — never via `getMigrations`' field-level diff
  arrays, which compare its camelCase field keys against snake_case columns and so
  always report false drift.

  `pikku db migrate` now runs the same check after applying migrations and fails
  loudly ("run `pikku db generate`") if the applied schema doesn't satisfy what
  Better Auth requires, rather than letting the drift reach runtime.

  Generation is SQLite-only for now (table/column names are dialect-independent, so
  the drift _check_ works for postgres too; postgres migration emission is not yet
  automated). Incremental changes on top of an already-migrated auth schema are
  reported with the delta for a hand-written forward migration rather than emitting
  a full re-CREATE.

- a027a8e: feat(auth): migrate auth integration from Auth.js to Better Auth

  The auth integration is now built on [Better Auth](https://better-auth.com)
  and ships as a single package, `@pikku/better-auth` (replacing the former
  `@pikku/auth-js`). There is exactly one auth package now.
  - `pikkuBetterAuth(async ({ secrets, variables }) => betterAuth({ ... }))` is the new
    single entry point. The CLI inspects the `betterAuth(...)` call and generates:
    - `auth.gen.ts` — a catch-all `${basePath}{/*splat}` HTTP route per method and
      a global `betterAuthSession({ auth })` middleware that bridges the Better
      Auth session into the Pikku wire session.
    - `auth-secrets.gen.ts` — `wireSecret(BETTER_AUTH_SECRET)` plus a
      `<PROVIDER>_OAUTH` secret for each configured social provider, and
      `wireVariable` for non-secret provider config (e.g. `MICROSOFT_TENANT_ID`,
      `COGNITO_DOMAIN`/`REGION`/`USER_POOL_ID`).
    - `auth.types.ts` — a typed `pikkuBetterAuth` re-export.
  - `add-auth` (inspector) walks into the `betterAuth(...)` options to discover the
    configured providers and required secrets/variables.
  - The auth secret is now auto-wired by codegen from `BETTER_AUTH_SECRET` — it no
    longer needs to be registered as a JWT signing key in `services.ts`.

  CLI fix included: scaffold files generated outside `srcDirectories` (e.g. an
  `auth.gen.ts` under a project's `pikku/` dir) are now added to the inspector's
  wiring files, so their routes and secret metadata are picked up. The generated
  wiring imports Pikku types via a resolved relative path instead of a hardcoded
  `#pikku` specifier, so templates without a `#pikku` import map type-check.

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/inspector@0.12.20
  - @pikku/better-auth@0.12.6
  - @pikku/core@0.12.32

## 0.12.35

### Patch Changes

- 0909c1f: feat(db): source column classification + type info from `db/annotations.ts`

  `db/annotations.ts` is now the single source of column classification and type
  overrides. SQL-comment annotations (`-- @private`, `-- @date`, etc.) and
  name-based kind inference are removed — they were ambiguous and, for the
  sidecar, never actually wired up.
  - `ColumnEntry` now exposes `kind` (`date`/`bool`/`json`/`uuid`) and `tsType`.
    `tsType` is a general type override (not json-only) and wins over `kind`.
  - New `kind: 'uuid'` types a column as a transparent `Uuid` alias (structurally
    a string) and makes the zod codegen emit `z.uuid()`. Postgres native `uuid`
    columns are detected automatically (no annotation); SQLite has no native uuid
    type, so use `kind: 'uuid'`.
  - **Dialect-aware typing**: on Postgres, real temporal columns auto-type as
    `Date` from the introspected type (no annotation needed). On SQLite — which
    stores dates as TEXT — columns stay `string` unless `kind: 'date'` is set.
  - The codegen **warns (does not force)** on a name↔type contradiction the real
    type can prove, e.g. a `*_at` column that is actually `boolean` in Postgres.
  - Fixed two reasons the `annotations.ts` pipeline never worked: the sidecar was
    written to `.pikku/db/` but read from `db/` (now written beside the authored
    file in `db/`), and the `node --import tsx/esm` compile step silently fails on
    Node ≥ 23 (`ERR_REQUIRE_CYCLE_MODULE`) — replaced with an in-process esbuild +
    `vm` transpile. The sidecar is now compiled **before** codegen, so authored
    edits apply in a single `pikku db migrate` instead of one run behind.
  - **Postgres enum columns auto-type** as a string-literal union (e.g.
    `'admin' | 'user'`) with no annotation — resolved from the column's `udt_name`
    against the introspected enum types — and the zod codegen emits
    `z.enum([...])` (or `z.literal(...)` for a single value). SQLite has no native
    enum type; use `tsType: "'a' | 'b'"` there. Non-`public` Postgres schemas are
    not yet supported by the zod codegen.
  - New **`format`** field in `ColumnEntry` (`email`, `url`, `e164`, `ulid`,
    `cuid`/`cuid2`, `nanoid`, `jwt`, `emoji`, `base64`/`base64url`, `ipv4`/`ipv6`,
    `cidrv4`/`cidrv6`, `isoDate`/`isoTime`/`isoDatetime`/`isoDuration`). These are
    zod string-format **validators** — they refine the zod schema (`z.email()`, …)
    but keep the TypeScript type as `string`. A `format` applies only when the
    column's resolved select type is `string`; combining it with a `kind`/`tsType`
    that resolves to a non-string type (e.g. `kind: 'date'`) is ignored with a
    warning. Identical across both dialects (it is annotation-driven, not derived
    from storage).

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
