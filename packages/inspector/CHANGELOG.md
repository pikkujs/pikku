## 0.12.41

### Patch Changes

- bb65430: Fail codegen with a clear error when the installed `@pikku/core` violates the CLI's peer range (PKU718).

  Some package managers (bun, yarn) install straight past an unsatisfied `peerDependencies` range instead of failing, so `@pikku/cli` could end up next to a `@pikku/core` outside the range it declares — and the only symptom was a cryptic missing-export crash deep in codegen or at runtime (e.g. `The requested module '@pikku/core/dev' does not provide an export named 'reloadGeneratedMeta'`).

  The existing preflight that catches a _split_ core (two installed versions, `PKU717`) now also validates the _single_ installed core's version against the CLI's own `@pikku/core` peer range, and fails with the exact versions and the fix (`@pikku/cli` and `@pikku/core` move together — bump both to the same release, update any overrides/resolutions pins, reinstall). Set `PIKKU_ALLOW_CORE_SKEW=1` to downgrade the failure to a warning if you have verified the installed pair is compatible, mirroring `PIKKU_ALLOW_DUPLICATE_CORE`.

- 982d3f5: Webhook gateway routes are now fully compiled instead of runtime-registered. The inspector projects `wireGateway` into the generated HTTP and function meta (deterministic `gateway__<name>__post`/`__verify` ids), and the gateway runner no longer mutates meta state at runtime — it only registers the handler implementations at module load, like every other wire. Previously the runtime-only meta was invisible to codegen and the dev-server meta reload wiped it, 500ing every gateway request.

  Also fixes the GET verification echo: string challenges return as a raw body (platforms compare byte-for-byte; the old JSON quoting failed Meta's check), object responses stay JSON, and failed verification now throws `UnauthorizedError` (401) instead of returning 200 with an error body.

- Updated dependencies [982d3f5]
  - @pikku/core@0.12.61

## 0.12.40

### Patch Changes

- 1f3f510: Warn when a Pikku function body performs a runtime dynamic `import(...)`.

  The inspector now flags any `pikkuFunc`/`pikkuSessionlessFunc` (and friends) whose handler body contains a dynamic `import(...)` call — including nested callbacks — with the new `PKU498` diagnostic. Function bodies run on every invocation, so a dynamic import there adds per-call latency and defeats bundling/tree-shaking; the import belongs at the top of the module or in your services/`wireServices` setup instead.

  Type-only positions like `import('x').Foo` are not flagged. The rule defaults to `warn` — a printed yellow warning that does not fail the build — and is configurable via `lint.functionDynamicImport` in `pikku.config.json` (`'off'` to silence, `'error'` to make it a hard build failure), matching the existing `servicesNotDestructured`/`wiresNotDestructured` lints.

- Updated dependencies [1f3f510]
  - @pikku/core@0.12.59

## 0.12.39

### Patch Changes

- 4f92e6f: `pikku db` schema-codegen warnings are now coded diagnostics routed through the CLI logger instead of raw `console.warn`, so they participate in the existing `--fail-on-warn` gate.

  Each warning now carries a PKU code and `warn` severity: `PKU481` (JSON/JSONB column with no concrete `tsType`, degrading to `unknown`), `PKU480` (column named like a date/bool but whose DB type contradicts it), and `PKU482` (a `format` annotation ignored on a non-string column). Running `pikku db migrate --fail-on-warn` (e.g. in CI) now turns these into a hard failure, forcing the `db/annotations.ts` entry — closing the loophole where an untyped jsonb column silently degrades type-safety. Default behaviour is unchanged: the warnings still print, and only fail the build when `--fail-on-warn` is set.

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- ad26273: Remove 16 dormant `ErrorCode` enum entries that were defined but never emitted anywhere in the framework. These were placeholder registrations that were never wired to a diagnostic, or codes whose emission sites were removed in later refactors (e.g. `PKU901`, `PKU431`). A whole-repo audit found zero emission sites — no user could ever see them — so they only cluttered the registry and demanded docs pages for errors that cannot occur.

  Removed: `PKU300`, `PKU426`, `PKU427`, `PKU431`, `PKU488`, `PKU529`, `PKU568`, `PKU685`, `PKU715`, `PKU736`, `PKU787`, `PKU835`, `PKU836`, `PKU901`, `PKU937`, `PKU975`.

  A new guard test (`error-codes-emitted.test.ts`) fails if any `ErrorCode` value has no `ErrorCode.<NAME>` or raw `PKU###` reference in the source, so dead entries can't silently accumulate again.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.38

### Patch Changes

- 66f3dae: Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

  `@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

  Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

  Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.

- Updated dependencies [ded4f90]
  - @pikku/core@0.12.54

## 0.12.37

### Patch Changes

- efb0406: Add in-process V8 precise coverage (`pikku dev --coverage` / `pikku serve --coverage`) with per-scenario attribution.
  - `@pikku/core`: new `V8CoverageService` (node:inspector precise coverage with snapshot + reset), exposed as the optional `coverageService` singleton service.
  - `@pikku/inspector`: function meta now records `bodyStart`/`bodyEnd` body spans (verbose meta only) so coverage can be mapped without a runtime TypeScript dependency.
  - `@pikku/cli`: `--coverage` on `pikku dev` and `pikku serve` starts the collector in-process; `pikku scenario run --coverage` resets/snapshots the server between flows and writes `.pikku/coverage/scenario-coverage.json` with per-scenario function coverage.
  - `@pikku/addon-console`: new exposed `takeLiveCoverage` / `resetLiveCoverage` RPCs; V8 ranges are mapped through inline source maps to original TypeScript lines (offset-based, so esbuild/tsx single-line output keeps full resolution).

- Updated dependencies [efb0406]
- Updated dependencies [fe4f5ca]
  - @pikku/core@0.12.53

## 0.12.36

### Patch Changes

- 61c9ce9: Add `actor.converse(...)` — actor agents for user journeys (#850)

  An actor can now hold a dynamic, LLM-driven conversation with a target Pikku AI
  agent in its own persona:

  ```ts
  const verdict = await actors.pm.converse({
    agent: 'todoBot',
    task: 'Get a todo created for the launch',
    evaluate: 'A todo about the launch now exists',
  })
  // verdict: { passed, reasoning, transcript }
  // then assert deterministically as the same actor:
  const todos = await actors.pm.invoke('listTodos', {})
  ```

  The actor drives the target over the real transport (the agent's own
  `agentRun` / `agentApprove` HTTP routes, signed in as the actor), plays the
  persona from its `pikku.config.json` config, answers the agent's tool-approval
  requests in-persona (`approvals: 'in-persona' | 'always' | 'never'`), and
  returns its verdict on whether the task was met. Deterministic checks stay the
  caller's job — they already hold the actor.

  The conversation engine is transport-agnostic (persona LLM + injected target
  driver); the persona's own turns run in-process via the configured
  `aiAgentRunner` (`model` from the call or the actors-service default).

  `agent` is typed against the generated agent-name union (`keyof AgentMap`), so
  it's author-time checked and autocompleted in a typed project.

- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.35

### Patch Changes

- 7ebea62: Tree-shake addon registrations in filtered inspector states (per-unit deploy codegen).
  - `filterInspectorState` drops an addon's `wireAddonDeclarations`/`usedAddons` unless something kept actually references it (kept wiring targeting `namespace:*`, kept agent/MCP tool, or a body-level `rpc.invoke('namespace:*')` from a file that still contains a kept function). The generated per-unit bootstrap no longer imports unused addon package bootstraps — previously every deploy unit registered every addon's entire function surface, which pulled dev-only code (e.g. `@pikku/addon-console`'s static `node:fs` imports) into Cloudflare Worker bundles and failed upload with `No such module "node:fs"`.
  - Body-level `rpc.invoke()` targets are now tracked per source file (`rpc.invokedFunctionsByFile`) so wiring-level `ref()` targets no longer pin an addon into every unit.
  - `aggregateRequiredServices` computes addon parent services per used addon function (from the addon's shipped per-function `services` meta) instead of blanket-adding `addonRequiredParentServices` — and matches namespaced ids only, so bare project function names colliding with addon function names no longer force the blanket.
  - Addon builds keep per-function `services` in the shipped `pikku-functions-meta.gen.json` so parent projects can do the above; addons built before this fall back to the blanket.
  - HTTP route meta records `refTarget` for `ref('namespace:fn')`-wired routes, so per-unit filtering keeps the addon registration (and only that function's services) when the route deploys.

- Updated dependencies [7ebea62]
- Updated dependencies [e57dd65]
  - @pikku/core@0.12.51

## 0.12.34

### Patch Changes

- 92bd643: User flows in the console: workflow graph extraction now captures
  `workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
  graph, the CLI emits `user-flow-actors.gen.json` for the new
  `MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
  Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
  being clobbered by a duplicate basic-extraction pass after successful DSL
  extraction.
- Updated dependencies [35a9bab]
- Updated dependencies [92bd643]
  - @pikku/core@0.12.50

## 0.12.33

### Patch Changes

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

## 0.12.32

### Patch Changes

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
  - @pikku/core@0.12.48

## 0.12.31

### Patch Changes

- 029fe2c: Fail `pikku all` when more than one `@pikku/core` version is installed. A split
  `@pikku/core` produces two separate `pikkuState` registries at runtime, so wirings
  (workflows, RPCs, queue workers, middleware) register into one copy while the runner
  reads the other and they silently fail to resolve (e.g. `WorkflowNotFoundError` for a
  workflow that is clearly registered). The preflight scans the project's `node_modules`,
  and errors (`PKU717`) with the offending versions/paths. Override with
  `PIKKU_ALLOW_DUPLICATE_CORE=1` to downgrade to a warning.
- Updated dependencies [e9a778f]
  - @pikku/core@0.12.45

## 0.12.30

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.29

### Patch Changes

- 7b5b10a: fix(workflow): include suspend steps in plannedSteps with readable displayName

  `workflow.suspend(reason)` calls now appear in the static `plannedSteps` ladder
  produced by `deriveWorkflowPlan`. Previously the inspector ignored them, so the
  runtime's `__workflow_suspend:<reason>` steps had no planned counterpart and
  the UI appended them as orphans at the bottom of the step list instead of
  showing them at the correct position.

  Changes:
  - `WorkflowPlannedStep` gains an optional `displayName` field — the human-
    readable label to show in the UI (falls back to `stepName` when absent).
  - New `SuspendStepMeta` type added to `WorkflowStepMeta`.
  - Inspector extracts `workflow.suspend('reason')` calls and emits a
    `SuspendStepMeta` step with `type: 'suspend'` and `reason`.
  - `collectNamedSteps` maps a suspend step to
    `{ stepName: '__workflow_suspend:<reason>', displayName: '<reason>' }`,
    matching the key the runtime stores so the UI can overlay live status
    onto the planned position.

- Updated dependencies [7b5b10a]
  - @pikku/core@0.12.42

## 0.12.28

### Patch Changes

- 66d43d1: Add `deploy.defaultTarget` to `pikku.config.json` to override the default deploy target ('serverless') for functions without an explicit `deploy` flag.
- a8c9e6d: feat(inspector): add PKU940 — block type casts on rpc.invoke() calls

  The inspector now emits a critical PKU940 error when `rpc.invoke()` is called
  with an `as` cast on an argument (`rpc.invoke('fn', data as any)`) or when its
  result is cast (`rpc.invoke('fn', data) as any`). Both patterns defeat Pikku's
  generated type safety and are rejected at build time.

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

- Updated dependencies [ba1ab08]
  - @pikku/core@0.12.40

## 0.12.27

### Patch Changes

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

- d2078c8: fix(inspector): make codegen output deterministic across runs

  Two sources of non-reproducible `pikku all` output are fixed:
  1. **Random placeholder ids.** Anonymous/unnamed functions and inline (non-exported) permissions were given a `__temp_${randomUUID()}` id, so a referenced-but-not-exported `pikkuPermission` const (e.g. `permissions: { admin: [requiresPlatformAdmin] }`) produced a fresh UUID in the generated meta on every run. The placeholder is now derived deterministically from the call expression's source location (relative path + start offset), still `__temp_`-prefixed so downstream name resolution is unchanged.
  2. **Unstable file-traversal order.** The two inspector sweeps iterated `program.getSourceFiles()` in glob + import-graph order, which varies run to run, so meta keys (and anything serialized in insertion order) were emitted in a different order each time — making a plain `git diff` of generated files look like functions were appearing/vanishing when the set was identical. Source files are now sorted by file name before the sweeps.

  Net effect: byte-identical generated output across repeated runs with no source changes (verified across the full `.pikku` tree of a 331-function project).

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

- 940c253: Populate `plannedSteps` and `deterministic` on serialized DSL workflow graphs. For a DSL workflow with no loops (fanout), the inspector now records every named step in source order, so a UI can render the run's step skeleton up front without executing it or hand-listing steps. `deterministic` is `true` only for a flat, loopless, branch-free workflow (exact sequence known ahead of time); a branchy-but-loopless workflow lists all possible steps with `deterministic: false`; any fanout makes the count runtime-dependent so neither field is emitted (just `deterministic: false`). Only `source: 'dsl'` workflows are planned — `complex` step trees omit inline branches and flatten loops, so their plans would misreport determinism. The runtime already threads these fields from workflow meta onto each run via `getRun`.
- Updated dependencies [4be205f]
- Updated dependencies [061c717]
- Updated dependencies [2c55e13]
- Updated dependencies [c745c26]
- Updated dependencies [57900b5]
- Updated dependencies [72694f6]
  - @pikku/core@0.12.39

## 0.12.26

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

## 0.12.25

### Patch Changes

- b6ba601: fix(lint): don't flag pikkuAuth's session param as a non-destructured wire

  `pikkuAuth`'s handler is `(services, session)` — the second parameter is the
  resolved user session, not a wires bag. The inspector was extracting "wires"
  from that parameter (`extractUsedWires(handler, 1)`), so a permission like
  `pikkuAuth(async ({ logger }, session) => !!session)` tripped
  `wiresNotDestructured` even though `session` cannot be destructured. pikkuAuth
  exposes no user-facing wires parameter, so no wires meta is recorded for it.

- ae7fc5d: Include gateway platform and auth fields in inspected gateway metadata.
- decdad5: fix(lint): don't fail the build on framework-synthesized functions

  The `servicesNotDestructured`/`wiresNotDestructured` defaults (`error`) were
  tripping on functions the user can't edit: generated `.gen.ts` wrappers (the
  opaque `authHandler`, the cli channel raw dispatcher) and synthetic route→addon
  bridges (`http:<method>:<route>`, no source file). `computeDiagnostics` now skips
  any function without a real, non-generated source file, so the lint only nudges
  hand-written user code. Also destructures the CLI's own `all` command.

- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
  - @pikku/core@0.12.37

## 0.12.24

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

- 3ba12ca: Stop consumed-addon parent services from polluting every per-unit deploy bundle, and stub the AI SDKs out of non-agent units.

  `aggregateRequiredServices` added `addonRequiredParentServices` (the services a consumed addon needs from its parent — e.g. `aiAgentRunner`, `deploymentService`, `metaService`) to **every** unit's `requiredServices` unconditionally. For any project that consumes an addon, this marked those services required on all units, so the per-unit service tree-shaking (and the gen-file/module stubs that key off the `false` flags) never fired — every unit shipped the full set. These parent services are now added only to units that actually deploy an addon function (its `pikkuFuncId` appears in `usedFunctions`); a unit that only calls the addon over RPC, or never touches it, no longer carries them.

  On the back of the now-honest flags, the bundler stubs the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`, `ai`) out of any unit where `aiAgentRunner` is not required, via a new service→module stub map alongside the existing gen-file stub map. The shared services factory must guard runner construction behind a defined-check on the dynamic import so a stubbed unit simply skips building the runner.

## 0.12.23

### Patch Changes

- 807a8d0: Add `refHTTP` / `refChannel` / `refCLI` so a consumer can wire an addon's HTTP routes, channel actions, and CLI commands directly from the addon's published `.pikku` contract metadata — no addon source is imported and nothing is hand-wired. These mirror the existing `ref('namespace:fn')` helper: each reference resolves the addon's already-loaded contract (via `wireAddon`) and proxies every function through `ref()` (RPC) at runtime.
  - **Inspector:** `wireHTTPRoutes`/`wireChannel`/`wireCLI` now expand `refHTTP('ns:contract')` / `refChannel('ns:contract')` / `refCLI('ns:contract')` call expressions against `state.exportedContracts.addon{Http,Channel,Cli}` (already namespaced and `packageName`-tagged by `loadAddonFunctionsMeta`). An optional second argument overrides the mount basePath, e.g. `refHTTP('ext:helloRoutes', { basePath: '/ext' })`; otherwise the addon contract's own basePath is preserved.
  - **CLI codegen:** the generated `pikku-function-types.gen.ts` now emits `refHTTP`/`refChannel`/`refCLI` (exported through `#pikku`) backed by const maps built from each wired addon's contract metadata, with every function pre-bound to `ref('ns:fn')`. Type-checking and runtime wiring resolve from the same generated artifact, so a reference can never be an inert marker.
  - **Addon authoring bans:** when inspecting an addon package (`isAddon`), the inspector now raises a critical error if the addon calls a transport wiring helper (`wireHTTP`/`wireHTTPRoutes`/`wireChannel`/`wireCLI`/`wireScheduler`/`wireQueueWorker`/`wireMCPPrompt`/`wireMCPResource`/`wireTrigger`/`wireTriggerSource`/`wireGateway`/`wireAddon`) — these are the consuming app's responsibility (`PKU920`) — or if a `define*` contract carries `middleware`/`permissions`, which the consuming app applies, not the addon (`PKU921`). Service declarations (`wireSecret`/`wireVariable`/`wireCredential`) and function-level middleware/permissions remain allowed.
  - **Deploy-bundle fix:** the HTTP/channel/CLI codegen commands now always emit their wiring and meta gen files once they report the category as active (truthy return), including the contracts-only or synthetic-route case where there are no local `wireHTTP`/`addChannel`/`wireCLI` source files. The generated bootstrap imports those files unconditionally, so skipping them left per-unit deploy bundles (e.g. Cloudflare units for scheduled tasks and workflow steps) unable to resolve `pikku-http-wirings.gen.js` and failing to build.

## 0.12.22

### Patch Changes

- 06234a9: Fix DSL `Promise.all` fanout silently failing to register its child RPC (causing a runtime "Function not found").

  Two distinct causes are addressed:
  - A fanout/group captured into a variable (`const results = await Promise.all(array.map(e => workflow.do(...)))`) was dropped entirely, because the `const`-declaration path had no `Promise.all` branch — fanout handling only ran on the bare/assignment path. The declaration path now extracts fanout and parallel groups too.
  - `extractStringLiteral` threw on a `+` concatenation with a non-static operand (e.g. `'Enrich ' + (e.id ?? e.name)`), unlike a template literal (`` `Enrich ${e.id ?? e.name}` ``) which never threw. The throw was uncaught while scanning workflow invocations and aborted the run. The `+` branch now falls back to `${...}` placeholders to match template literals, and a step's cosmetic display name can no longer block RPC registration.

- 8e72c93: Exclude `node_modules` from inspector source scanning. A locally-installed addon (under the project's `node_modules`) is a dependency, not project source — scanning it double-counted the addon's own application types (`CoreConfig`/`CoreServices`/`CoreSingletonServices`) and failed `pikku all` with "More than one … found". Addons still contribute via their generated metadata, not by being re-scanned as source.
- 6645e7a: Add a severity model for coded diagnostics so security findings can surface without blocking the dev server.
  - `InspectorLogger` gains `diagnostic({ severity, code, message })` (`severity: 'warn' | 'error' | 'critical'`). `critical(code, message)` is now sugar for `diagnostic({ severity: 'critical', ... })`.
  - The CLI fails the build only on `critical` diagnostics by default. New global flags `--fail-on-error` and `--fail-on-warn` (implies `--fail-on-error`) opt into stricter gating; `--fail-on-critical` is always on.
  - Data-classification leaks (`PKU910`) are now emitted at `error` severity instead of `critical`. They are still printed, but no longer abort `pikku all` / the dev server — pass `--fail-on-error` (e.g. at deploy) to make them blocking and recommend a fix.
  - Contract-immutability drift (`PKU861`) during `pikku versions update` (run inside `pikku all`) no longer calls `process.exit(1)`. It is surfaced as an `error` diagnostic and skips saving the manifest, so a stale baseline can't crash-loop the dev server. `pikku versions check` remains the hard gate, and `--fail-on-error` makes `pikku all` block on it at deploy.

- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.21

### Patch Changes

- ef50347: Tree-shake the better-auth server out of non-auth units.
  - `@pikku/better-auth`: add `betterAuthStatelessSession()` — a session middleware that verifies the signed better-auth cookie cache via `better-auth/cookies` (`getCookieCache`) using only `BETTER_AUTH_SECRET`, with no `services.auth()`, DB round-trip, or full server import. Mark the package `sideEffects: false` so unused barrel re-exports drop.
  - `@pikku/cli`: when `session.cookieCache` is enabled in the better-auth config, generate the stateless session middleware into a separate `auth-middleware.gen.ts` and wire it globally, keeping the full `/api/auth/**` server only in the auth unit. Deploy artifacts (esbuild metafile + sourcemap) are now off by default; `--debug-artifacts` re-enables them.
  - `@pikku/inspector`: ensure the orphan `auth-middleware.gen.ts` (imported by nothing) is still inspected so its global `addHTTPMiddleware('*')` registration is not dropped.

  Net effect: a non-auth unit carries ~22KB (cookie-verify floor) instead of the full ~1.25MB better-auth backend.

## 0.12.20

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
  - @pikku/core@0.12.32

## 0.12.19

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

## 0.12.18

### Patch Changes

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
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.17

### Patch Changes

- 2cf67be: Add inline option to pikkuFunc/pikkuSessionlessFunc for workflow step dispatch

  By default, workflow steps now run inline (no queue hop). Set inline: false on a function to force dispatch through the queue for that step.

- Updated dependencies [2cf67be]
  - @pikku/core@0.12.28

## 0.12.16

### Patch Changes

- 646c5a8: Fix inspector failing to extract descriptions written as string concatenation (`+`). Descriptions like `'line one ' + 'line two'` are now correctly resolved to their full value. The `checker` parameter is also threaded through `getCommonWireMetaData` so all wiring types benefit from static string evaluation.

## 0.12.15

### Patch Changes

- 0db854e: Fix workflow DSL extractor treating `x = await workflow.do(...)` as a set-step when `x` was previously declared as `null`. The referenced function is now correctly registered in `invokedFunctions` and `internalFiles`, so it appears in the generated `pikku-functions.gen.ts`.
- 8249f6f: Fix `isStringLike` to unwrap type assertion expressions (`as T` / `<T>expr`) so that `workflow.do('step', 'rpcName' as any, data)` is correctly parsed as an RPC step rather than silently dropped as an inline step. Also removes the `as any` cast from the `Emails` step in `all.workflow.ts` now that the inspector handles it, and ensures `pikku all` generates email template artifacts.
- f373a87: Fix PKU910 classification semantics and Postgres annotation propagation.

  **Inspector (`@pikku/inspector`):**
  - `findPiiPaths()` now returns `ClassifiedField[]` (path + classification level) so `private`/`pii` and `secret` brands are distinguished
  - `Secret<T>` fields are blocked in the output of all exposed functions (sessioned or not)
  - `Private<T>` / `Pii<T>` fields are only blocked in sessionless functions — authenticated (sessioned) functions may return private-classified data to their callers

  **CLI (`@pikku/cli`):**
  - Fix missing `rootDir` in the Postgres `generateSchemaTypes` call — the annotations sidecar file (`db/annotations.gen.json`) was silently ignored during Postgres migrations, causing columns annotated `@public` to remain branded as `Private<T>` in the generated schema

## 0.12.14

### Patch Changes

- 4b5c75b: feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry
  - Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
  - Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
  - `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
  - Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.

- 4b5c75b: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.13

### Patch Changes

- 665bdb0: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- Updated dependencies [665bdb0]
  - @pikku/core@0.12.25

## 0.12.12

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.12.11

### Patch Changes

- 033d172: Log a critical inspector error when multiple functions resolve to the same `pikku` function name, instead of silently allowing routing map collisions. This may cause builds to fail if multiple functions previously resolved to the same `pikku` function name.
- Updated dependencies [b9ed73e]
  - @pikku/core@0.12.19

## 0.12.0

## 0.12.10

### Patch Changes

- ba8d6ff: Support inline functions in pikkuWorkflowComplexFunc with full DSL extraction
- d3ace0e: Inspector now captures the `deploy: 'serverless' | 'server' | 'auto'` option
  from `pikkuFunc` / `pikkuSessionlessFunc` calls, alongside the other runtime
  metadata (`expose`, `remote`, `mcp`, `readonly`, `approvalRequired`).

  Previously this field was defined on `FunctionRuntimeMeta` but never read
  from the user's source, so `deploy: 'server'` was silently dropped. That
  left downstream consumers — notably `@pikku/cli`'s deployment analyzer,
  which routes server-targeted functions to a container unit — treating
  every function as `serverless` regardless of its declared intent.

- Updated dependencies [311c0c4]
  - @pikku/core@0.12.18

## 0.12.9

### Patch Changes

- 2ac6468: Fix workflow inspector crash when workflow.do() data object has a 'description' property
- fbcf5b9: Add version awareness to RPC handler: versioned functions now appear in the exposed RPC type map (e.g. `getData@v1`, `getData@v2`), enabling type-safe `rpc.invoke('getData@v1', data)` calls. Tree-shaking respects specific version filters without pulling in all versions. HTTP wirings correctly resolve versioned function IDs.
- Updated dependencies [fbcf5b9]
  - @pikku/core@0.12.16

## 0.12.8

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

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [7ab3243]
  - @pikku/core@0.12.15

## 0.12.7

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.
- Updated dependencies [2ce0733]
  - @pikku/core@0.12.13

## 0.12.6

### Patch Changes

- 84f01ad: Add credentialOverrides to wireAddon for remapping credential names, fix credential services template to pass variables argument.
- Updated dependencies [84f01ad]
  - @pikku/core@0.12.12

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
