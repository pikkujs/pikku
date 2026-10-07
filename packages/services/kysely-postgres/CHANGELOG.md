# @pikku/kysely-postgres

## 0.12.27

### Patch Changes

- 15c4968: The default runtime path no longer needs `node:*`, `Buffer` or an unguarded `process`, so it loads on edge runtimes (Web APIs only).

  **Breaking:** `FileScenarioRunStore`, `scenarioArtifactContentType` and `scenarioRunSummary` leave the `@pikku/core/services` barrel because they use `node:fs`. Import them from `@pikku/core/services/file-scenario-run-store`. Pre-0.13 breaking changes still ship as a patch.

  **Breaking:** the HMAC helpers in `@pikku/core/hmac` run on Web Crypto, which is async. `hmacSha256Hex`, `hmacDigest`, `verifyHmacSignature` and `verifyPublicKeySignature` now return a Promise; `timingSafeStringEqual` stays synchronous. `WebhookService.sign` and `WebhookService.verify` return a Promise, and so does `verifySlackSignature` in `@pikku/gateway-slack`: `await` them. A function-style `verify` on a webhook source may return a Promise as well. `verifyPublicKeySignature` accepts RSA and EC (P-256, P-384, P-521) PEM keys; Ed25519 and RSA-PSS keys verify as false.

  `isProduction()` (and the `PIKKU_MODEL_ALIASES` and `PIKKU_ENV` reads) now ask the registered singleton services' `variables` service first, then `process.env` when `process` exists. With neither, `isProduction()` is true, so an edge deployment never exposes error details by accident. `LocalVariablesService` resolves its `process.env` default when constructed and falls back to an empty store without `process`.

  Workflow invocation ids use a built-in SHA-1 and stay byte-identical. `@pikku/kysely` and the Cloudflare hibernation server use `globalThis.crypto.randomUUID()` and no `Buffer`; `@pikku/kysely` is marked `sideEffects: false`. `@pikku/ai-deepinfra` reads `DEEPINFRA_API_KEY` only when `process` exists and decodes base64 audio without `Buffer`.

  Runtime tiers. A package declares where it can run in `package.json`: `"pikku": { "runtime": "edge" | "serverless" | "server" }`, with optional per-subpath overrides (`"exports": { "./dev": "server" }`). `server` is the default. `@pikku/core` and the default services are `edge` (core's Node-only subpaths are `server`), `@pikku/better-auth`, `@pikku/addon-admin` and `@pikku/cloudflare` are `serverless` (better-auth statically imports `node:crypto` scrypt), and `@pikku/addon-console` is `server` and must never land in a deployed unit.

  `pikku deploy` now verifies each deployed unit before bundling it. The unit is bundled with esbuild (neutral platform, `workerd`/`worker`/`browser` conditions) under its tier's profile, ahead of the adapter's aliases and stubs so they cannot hide anything, and the build fails when the bundle holds a package declared above the unit's tier or a Node built-in the runtime does not provide. The error names the unit, package, import chain and the fix. A built-in the provider stubs is a warning. On an edge unit, a bundled `InMemory*` class also fails the build. The unit's tier is its `runtime`, else the project's own `pikku.runtime`, else the provider default (`serverless` on Cloudflare). Packages that declare nothing are judged by their imports only.

  `ProviderAdapter.getRuntimeProfile(tier?)` returns the compat date, compat flags, the built-ins the runtime provides (keyed by compat date), the stubbed ones and the externals. The Cloudflare adapter derives `wrangler.toml`, the upload metadata and the bundle externals from it; `node:os` and `node:fs` are not provided before compat date 2025-09-15. The default is `nodejs_compat_v2` with compat date 2024-12-18, which is what `wrangler.toml` and Fabric's live workers already use, so Fabric deploys see no runtime change. Only the direct-API upload in `@pikku/deploy-cloudflare` (`createWorker`, used by its own `deploy()`) moves: it sent `nodejs_compat` with 2024-01-01 before. A newer date or flag is opt-in through the adapter option `new CloudflareProviderAdapter({ compatDate })` or `getCloudflareRuntimeProfile(tier, compatDate)`. From 2025-08-15 `node:http` and `node:https` exist, and from 2025-09-15 `node:os`, `node:fs` (stubbed by the build regardless) and `node:perf_hooks`; the verifier's allowed built-ins follow the effective date. A newer date changes the runtime of every worker deployed with it.

  `declareScopes(['pikku:console'])` (from `@pikku/core/scope`) declares scopes by id without wiring anything. `wireAddon({ scopes })` only requires a scope of an addon's functions; the tree arrives with the addon's metadata, so a role granting `pikku:console` used to fail PKU124 unless the addon was wired, and a wired `@pikku/addon-console` lands in every unit carrying the `/rpc` catch-all. An app that grants the scope without the console now calls `declareScopes` and no longer needs the scaffold or the addon. When the addon is wired its tree and descriptions win and the bare id adds nothing.

  More packages declare a tier after bundling each with the edge profile. `edge`: `@pikku/addon-graph`, `@pikku/pino`, `@pikku/jose`, `@pikku/ai-vercel`, `@pikku/ai-voice`. `serverless`: `@pikku/kysely-postgres` (postgres.js needs `node:buffer`, `stream`, `events`), `@pikku/backblaze` (`copyFile` reads a local file, which the build stubs), `@pikku/gateway-slack` (`@slack/web-api` imports `node:os` and `zlib`). `server`: `@pikku/schedule` (`cron` imports `child_process`), `@pikku/aws-services` (the AWS SDK's Node handler needs `node:http2`), `@pikku/browser` (puppeteer), and `@pikku/modelcontextprotocol` except its `./fetch` subpath, which is `edge`.

  `@pikku/addon-graph` no longer needs `node:crypto` or `Buffer`: the Crypto function hashes and HMACs on Web Crypto (MD5 is built in, since Web Crypto has none) and encodes with `TextEncoder`/`atob`/`btoa`, with output unchanged.

- Updated dependencies [6f11bb5]
- Updated dependencies [0c67e33]
- Updated dependencies [15c4968]
- Updated dependencies [d75a23d]
- Updated dependencies [9b12c8a]
  - @pikku/core@0.12.138
  - @pikku/kysely@0.13.35

## 0.12.26

### Patch Changes

- a16b0ba: The workflow run lease takes the app's `leaseService` (`holdLease(leaseService, 'workflow-run:<id>', …)`) in place of `pg_advisory_lock` / `GET_LOCK`, for DSL and graph runs alike. A message for a run already being orchestrated elsewhere wakes the run again a second later instead of failing, so a long pass never spends the retry budget the queue keeps for real failures. An inline run whose lease was lost after its body finished keeps the outcome it wrote. `PgWorkflowQueueOptions` and `RunLockHoldTimeoutError` are removed. `WorkflowService.withRunLock` is renamed `withRunLease`, since what it holds runs out unless renewed; a custom workflow service overriding it renames the method.

  Pass the lease service to the workflow service — `new PgKyselyWorkflowService(db, { leaseService })` — register the same instance as the app's `leaseService`, and migrate `pikku_lease`.

  A step lease is renewed by the same loop as the run lease. A graph node whose worker died is dispatched again once its lease lapses, instead of leaving the run waiting on it. A replayed step on Kysely now sees its lease, as `getStepState` does. The in-memory store refuses a superseded worker's outcome, as the database stores do. The MySQL workflow service can now record a workflow version; it used `ON CONFLICT`, which MySQL does not have.

  `pikku db generate` now writes the `pikku_lease` table for any project that runs workflows, not only one that reaches `leaseService`, since every persistent workflow service holds its runs and steps there.

- a16b0ba: Persistent workflow services take a required `leaseService` (`WorkflowServiceOptions`) and lock runs and steps on it. The Postgres advisory and MySQL `GET_LOCK` step locks, and Redis's own `SET NX` run and step locks, are removed; `RedisWorkflowService` now takes `(connection, { leaseService, keyPrefix? })`.
- Updated dependencies [a16b0ba]
- Updated dependencies [21e9c3a]
- Updated dependencies [a16b0ba]
- Updated dependencies [a16b0ba]
  - @pikku/core@0.12.133
  - @pikku/kysely@0.13.33

## 0.12.25

### Patch Changes

- 942ebdd: Add `LeaseService`: named leases shared by every process on the same store. A lease is not a mutex: a holder that stalls past its expiry loses the key without knowing, so whatever the body writes to should check the lease's `token` and refuse an older one. `acquire` never blocks and answers `null` while someone else holds the key; a lease lapses on its own if its holder dies; and each lease carries a `token` that rises every time the key changes hands, so a stale holder cannot refresh or release its successor's lease. `holdLease` refreshes the lease while its body runs, hands the body an `AbortSignal` that fires the moment the lease is lost, and throws `LeaseLostError` once the body finishes if the lease lapsed or changed hands meanwhile, so a caller never takes that result as produced under the lease.

  Ships as `InMemoryLeaseService`, `PgKyselyLeaseService` (`@pikku/kysely-postgres`), `MySQLKyselyLeaseService` (`@pikku/kysely-mysql`) and `KyselyLeaseService` (SQLite), all on `pikku_lease`. The Postgres and MySQL services judge every lease by the database's clock, so a worker whose clock runs fast cannot take a live lease or stretch its own; `KyselyLeaseService` reads the process clock and is for a single-host SQLite app. `pikku db generate` writes the table for any project that reaches `leaseService`.

  `RedisLeaseService` (`@pikku/redis`) keeps each lease in a hash Redis expires itself, with every check-and-set in one Lua script that reads Redis's `TIME`, so it too judges leases by the server's clock; its token counter outlives release, so the next holder always gets a higher token.

- Updated dependencies [d327fa5]
- Updated dependencies [942ebdd]
- Updated dependencies [8ac25a8]
- Updated dependencies [6606777]
  - @pikku/core@0.12.132
  - @pikku/kysely@0.13.32

## 0.12.24

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

- Updated dependencies [4c7a1b5]
  - @pikku/core@0.12.108
  - @pikku/kysely@0.13.25

## 0.12.23

### Patch Changes

- a057bec: Give a standalone bundle a command line.

  An operator holding a standalone artifact on a machine had one thing they could
  do with it: start it. Applying the migrations it needs meant a checkout of the
  project and a second copy of the CLI on a production box, and answering "which
  build is this" meant asking whoever ran the deploy.

  The bundle now takes a command. `serve` remains the default, so an existing
  `node bundle.js` is unchanged. `version` prints the version the project declared
  at build time. `db migrate` and `db status` apply and report the migrations that
  now ship beside the bundle under `db/<engine>/` — the same path Fabric's build
  container stages them to, so the two producers of an artifact cannot disagree
  about where the SQL lives. `backup <path>` writes a consistent copy of a SQLite
  database with `VACUUM INTO`; on postgres it refuses and names `pg_dump`, which
  is the tool for it.

  Both engines are supported: a postgres build migrates over the connection it
  already opens. `PostgresMigrationClient` grew an optional `begin`, because a
  pooled client is free to answer `BEGIN`, the migration and `COMMIT` on three
  different connections — which leaves a failed migration half applied with
  nothing to roll back.

  There is deliberately no way to invoke an RPC. A running server already answers
  them with auth, sessions and middleware applied; an in-process invoke would
  answer them with none of that.

## 0.12.22

### Patch Changes

- 6848cd9: fix(kysely-postgres): bound the workflow run lock, and never pool a held one

  `withRunLock` takes a session-level advisory lock so the critical section can be
  the whole workflow body — right, because that body may await a build or an LLM
  for minutes, and a transaction lock would leave the connection `idle in
transaction` for the duration. What a session lock does not come with is a
  bound: nothing reclaims it while the process lives, so a body that never settles
  never reaches the `finally` that unlocks, and every later message for that run
  pays `lock_timeout` before failing. Enough of them and a bounded worker pool is
  entirely queued behind runs that will never finish.

  Three opt-in guards now supply the bound the primitive lacks, each answering a
  different way to lose a holder:

  - `maxLockHoldMs` gives up on a body that hangs in-process, releases the lock
    and rejects with `RunLockHoldTimeoutError`. The abandoned body keeps running —
    a promise cannot be cancelled — so this trades serialisation for liveness;
    `claimStepForExecution`, not the run lock, is what keeps a duplicated
    orchestration from becoming a duplicated side effect.
  - `lockIdleTimeoutMs` sets `idle_session_timeout` on the lock session so
    Postgres reclaims a holder that vanished without closing its connection. It
    ships with a keepalive on the same connection, because a body legitimately
    awaiting a twenty-minute build looks exactly as idle to the server as a dead
    one — setting the GUC by hand, on the role or in the connection string, reaps
    legitimate holders and hands the run to a second worker.
  - An unlock that throws now terminates its own backend rather than return a
    connection to the pool still holding the lock.

  All three are off by default, so nothing changes for an existing deployment
  until it opts in.

- Updated dependencies [274cab3]
- Updated dependencies [32616af]
- Updated dependencies [6848cd9]
  - @pikku/kysely@0.13.20
  - @pikku/core@0.12.89

## 0.12.21

### Patch Changes

- f1f7df2: the Postgres run lock is now a session advisory lock, so a long workflow body no longer parks its connection `idle in transaction`
- 2d21628: fix(kysely): claim a workflow step atomically in every SQL dialect

  The workflow engine's "atomic claim" was a read-then-write guarded by
  `withStepLock`, and `@pikku/kysely` inherited a silent pass-through for that
  lock — so on every dialect but Postgres and MySQL a redelivered queue job could
  claim a step another dispatch was already running, executing a side-effecting
  step twice.

  `@pikku/kysely` now claims the step with a status-guarded `UPDATE` and reads the
  affected-row count, which is atomic in every SQL dialect without an
  advisory-lock primitive. Relay redispatch is enabled for all Kysely dialects as
  a result, not just Postgres and MySQL.

- Updated dependencies [9687ad1]
- Updated dependencies [2d21628]
- Updated dependencies [985b87b]
- Updated dependencies [3a83f85]
  - @pikku/core@0.12.87
  - @pikku/kysely@0.13.19

## 0.12.20

### Patch Changes

- 5a1a962: cors: stop naming the first allowlist entry for a disallowed origin, and add jsonb binding helpers

  `cors()` with an array `origin` used to fall back to `origin[0]` whenever the
  request origin was not in the allowlist, so every response carried a
  valid-looking `Access-Control-Allow-Origin` naming an origin the caller was not.
  Browsers still blocked the request, but as an origin _mismatch_ rather than
  "origin not allowed", and `curl` showed the same fixed origin for every request
  including bogus ones — which sent people debugging the wrong layer. A request
  origin that is not on the list now gets no `Access-Control-Allow-Origin` and no
  `Access-Control-Allow-Credentials` at all, plus a debug-level log naming the
  rejected origin. A request with no `Origin` header is not a cross-origin request
  and likewise no longer receives a fabricated one. Wildcard and single-string
  `origin` behaviour is unchanged.

  `@pikku/kysely-postgres` now exports `jsonbText`, `jsonbValue` and `jsonbMerge`.
  postgres.js infers a bound parameter's type from the cast that follows it and
  JSON-encodes anything it believes is jsonb, so a hand-written
  ``sql`coalesce(...) || ${JSON.stringify(patch)}::jsonb` `` arrives
  double-encoded and merges into a two-element array instead of an object. The
  helpers route the value through an intermediate `::text` cast, which is correct
  on every driver.

- Updated dependencies [5a1a962]
- Updated dependencies [746ed6a]
  - @pikku/core@0.12.86
  - @pikku/kysely@0.13.18

## 0.12.19

### Patch Changes

- 266e3bc: One door per name: `@pikku/core/ecosystem/*` and the package root are gone

  `@pikku/core` published every module twice. `ecosystem/http` re-exported
  `./http`, `ecosystem/services` re-exported `./services`, and a name was
  reachable through either — so every addition had to be made in two places, and a
  consumer's import said nothing about what it actually used. The package root was
  the same problem at a larger scale: a single barrel of 206 names that no bundler
  could take apart, and the one specifier that revealed nothing at all.

  Both are deleted. Every name now lives on the subpath that owns it, and every
  import carries that subpath — `@pikku/core/http`, `@pikku/core/services`,
  `@pikku/core/errors`, `@pikku/core/types`.

  Deleting the facades meant the raw subpaths had to become a superset of them,
  which they were not: the facade tree had accumulated 25 names with no raw home
  and about 26 more filed under a different area than the module they came from.
  Those names moved to the area that owns them, and three areas were published as
  new entry points rather than left on a root that is going away — `./types` (the
  shared type surface, the largest single destination), `./state` and
  `./classification`.

  `./classification` is one door onto one subject: what a value is and how it must
  be handled. Its three halves would each have been an entry point — the brands
  and manifest types, the stored-form helpers (`hashToken`, `unsafeAsSealed` and
  friends), and `SecretValue` — split by whether a name happens to be a type or a
  value, which is the same defect as the facades. The duration and versioned-id
  helpers went to `./utils`, which already published, and `PikkuRequest` went to
  `./function`: it is the transport-agnostic request base, not an HTTP one — HTTP
  has `PikkuHTTPAbstractRequest`, and the only thing outside core that extends
  `PikkuRequest` is Azure's timer request.

  `./types` inherited the root barrel's habit before it inherited its contents, so
  the names with an owner elsewhere were moved off it. The middleware types and the
  five middleware factories — `pikkuMiddleware`, `pikkuMiddlewareFactory`,
  `pikkuChannelMiddleware`, `pikkuChannelMiddlewareFactory` and
  `pikkuAgentMiddleware`, runtime values on a types entry point — are now
  `@pikku/core/middleware`; the function meta types are `@pikku/core/function`;
  `SerializedError` is `@pikku/core/errors`; and the generic TypeScript helpers
  (`MakeRequired`, `PickRequired`, `PickOptional`, `RequireAtLeastOne`,
  `JSONPrimitive`, `JSONValue`) are `@pikku/core/utils`. What is left on `./types`
  is the vocabulary the wirings share, which no single module owns.

  `pikku` was itself a root barrel — `export * from '@pikku/core'` — and
  now exports only the services it bundles.

  One module survives at the old specifier, and only for the bootstrap:
  `packages/cli` is generated by the _published_ CLI pinned in its `build.sh`, and
  that CLI still writes a bare `@pikku/core` into the files it generates for the
  CLI itself. `bootstrap-compat/root.ts` carries the eight types it names, a test
  in core fails if that list grows, and it goes when the pin moves to a CLI
  released from this branch. The adapter names the pinned CLI reaches for —
  `pikkuState` and `CreateWireServices` — are rewritten to `@pikku/core/state` and
  `@pikku/core/types` by the same `build.sh` patch pass, so no second shim is
  needed for them.

  A guard test keeps the root shut: it parses imports and rejects a bare
  `@pikku/core` rather than grepping for it, because several tests hold a user's
  file as a template literal, where `import … from '@pikku/core'` is fixture text
  rather than an import this repo makes.

  An agent scaffold a project generated under an older CLI is refreshed rather
  than left to fail: `pikku all` already deleted one importing an entry point
  `@pikku/core` no longer publishes, and the `#pikku` hub joins that list.
  Without it a project that scaffolds the agent endpoint but
  declares no agents keeps the old file forever — the generator that would rewrite
  it only runs when agents exist, and the file being present is what stops it
  being regenerated as missing.

  `pikku new addon` also wrote a tsconfig `paths` map naming only the deleted hub.
  An addon's `imports` map points into `dist`, so `paths` is what resolves
  `#pikku/<leaf>` for the addon's own source build — it now names the two leaf
  patterns, in both the addon and its test harness.

- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 24db8b7: Stop a workflow run's lock from starving the query pool.

  A Postgres advisory lock lives on a connection and `withRunLock` spans the whole
  workflow body, so every in-flight run held one connection of the pool the rest
  of the app queries through for as long as it ran — external I/O included. At N
  concurrent runs, N being the pool size, every other request queued behind them
  forever: not an error, a hang. Twenty concurrent teardown workflows took a
  production backend down this way, and it only came back on a restart.

  `PgKyselyWorkflowService` now accepts `lockDb`, a second Kysely instance on its
  own pool used only for the run lock. That pool's size becomes the cap on
  concurrent runs per process — run N+1 waits for a lock connection instead of
  starving request serving. Every worker's `lockDb` has to reach the same database:
  `pg_advisory_xact_lock` is database-scoped, so lock pools pointed at different
  databases never contend and the same run executes twice.

  `lockTimeoutMs` bounds how long a run waits for the advisory lock once its
  transaction holds a connection, so a jam surfaces as a failed run rather than a
  process that never finishes one. Waiting for a connection out of a saturated
  `lockDb` stays unbounded — that queue is the backpressure the pool exists to
  apply.

  Both default to the previous behaviour: with no `lockDb` the lock is still taken
  on the query pool, and the wait is still unbounded.

  `withStepLock` is unchanged and stays on the query pool — its caller claims the
  step under the lock and runs the step outside it, so it holds a connection for a
  few statements rather than for the step's work.

- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
  - @pikku/core@0.12.85
  - @pikku/kysely@0.13.17

## 0.12.18

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

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
- Updated dependencies [a7fcd2e]
  - @pikku/core@0.12.84
  - @pikku/kysely@0.13.16

## 0.12.17

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82
  - @pikku/kysely@0.13.15

## 0.12.16

### Patch Changes

- e848eb2: Add `relayUndispatchedSteps()`, which re-drives steps whose queue or scheduler
  dispatch was lost.

  Arming a step is two writes to two systems — the step row lands `pending`, then
  a job is published — and nothing spans both, so a crash in between leaves a
  durable row nothing will ever pick up. The run then neither finishes nor fails.

  The step row is the outbox record and this is the relay. It is safe to
  re-dispatch a step that already has a live job because `executeWorkflowStepInner`
  claims the step under `withStepLock` before invoking anything: the loser reads
  `running` and returns. Stores opt in by overriding `findUndispatchedSteps`; the
  default returns nothing, so a store without an atomic step lock gains no
  re-dispatches. Opted in: `kysely-postgres` and `kysely-mysql` (real locks) and
  in-memory (inline, single-process, no queues). Not opted in: `mongodb` and
  `kysely-sqlite`, whose `withStepLock` is a pass-through.

  Not self-starting — call it from a scheduled task.

- Updated dependencies [e848eb2]
- Updated dependencies [b170489]
- Updated dependencies [ae4e898]
  - @pikku/core@0.12.79
  - @pikku/kysely@0.13.12

## 0.12.15

### Patch Changes

- 8a2c993: Make the workflow service cheaper to run, and fix two ways it lost state.

  The SQL workflow tables had no indexes at all, so every step read, every
  history walk and every orchestrator tick was a sequential scan; five indexes
  now cover the columns the engine actually queries by. A replay used to ask for
  each step's row individually — O(N) reads per replay, O(N^2) over a run — and
  now takes one read of the run's steps and serves the walk from it. A step
  transition wrote the step row and its history row as two separate statements,
  so a crash between them left a step saying `succeeded` whose history still said
  `running`; both halves are now one transaction, and the history row is found by
  attempt number rather than by sorting on `created_at`, which two attempts can
  share. Resolving a dynamic workflow read and parsed every AI-generated workflow
  in the deployment to `.find()` one by name; it is a point lookup now.

  Waiting on a run no longer polls at a fixed interval. `pollIntervalMs` became a
  ceiling rather than a cadence: polling starts at 10ms and widens towards it, so
  a workflow that finishes in milliseconds is no longer held for a full second,
  and a long-running one is not read at full rate for its whole life.

  Two backend-specific defects: Redis kept a run's state as one JSON blob and
  read-modified-wrote it, so parallel branches setting different variables
  overwrote each other — state is a field per variable now, with the old blob
  still read underneath so runs in flight keep what they had. Mongo's
  `setStepScheduled` never wrote history, leaving a queued step reading as never
  dispatched.

  Also: dispatch no longer JSON round-trips every step payload before handing it
  to a queue that serialises it anyway — the in-process dev queue, which is the
  only one that was relying on it, does it itself now.

  Two more defects. A transition whose step had no live attempt wrote its status
  to the step row and silently nothing to history — the exact divergence the
  transaction exists to prevent — and now repairs the step and writes the
  missing row. And resolving a dynamic workflow was non-deterministic on all
  three backends: a name can hold several active versions, and none of them
  ordered the candidates, so which one ran could change between two calls
  reading identical data. The newest version wins, with the graph hash breaking
  a tie.

  The two attempt columns and the five indexes are declared in the workflow
  schema, so a fresh database gets them at boot. An existing one gets them from
  a migration — `pikku db generate` writes the declaration down — rather than
  from DDL issued at boot.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71
  - @pikku/kysely@0.13.6

## 0.12.14

### Patch Changes

- 1eff68c: PgEventHubService now accepts an optional inner transport hub. When supplied, subscribe/unsubscribe/publish and NOTIFY-relayed events are delivered through it instead of a private LocalEventHubService, so the service can share the SAME hub the server registered its sockets on (e.g. a BunEventHubService). Without an inner hub the behaviour is unchanged.

## 0.12.13

### Patch Changes

- e3d4454: Add job groups, so one shared queue can stay fair without splitting into one
  queue per producer.

  A job may now carry `group: { id, tier }`, and a worker may cap how many jobs
  of any one group run at once via `groupConcurrency`. On pg-boss this maps to
  `localGroupConcurrency`, which excludes at-capacity groups from the fetch query
  itself, so a capped group costs nothing rather than being fetched and restored.
  BullMQ declares it unsupported (groups are a BullMQ Pro feature) — being
  push-based, it can simply use a queue per group at no polling cost.

  Workflow services accept a `queueStrategy`. The default `'per-workflow'` is
  unchanged: every workflow gets its own `wf-orchestrator-*` / `wf-step-*` queue,
  which is also what lets serverless providers deploy one unit per workflow. The
  new `'shared-groups'` routes every workflow through the shared
  orchestrator/step-worker queues and isolates them by group instead, so a
  monolith runs one set of pollers rather than one per workflow — on a
  pull-based backend with dozens of workflows that is the difference between
  hundreds of poll loops and twenty. It is for single-process runtimes only; a
  per-unit serverless deploy still needs the per-workflow queues to route to its
  units.

- Updated dependencies [24252b8]
- Updated dependencies [e3d4454]
  - @pikku/core@0.12.69
  - @pikku/kysely@0.13.3

## 0.12.12

### Patch Changes

- 66f3dae: Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

  `@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

  Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

  Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.

- Updated dependencies [ded4f90]
  - @pikku/core@0.12.54

## 0.12.11

### Patch Changes

- e9a778f: feat(kysely-postgres): `PikkuKysely` accepts `PostgresConfig` pool options

  New optional 4th constructor arg maps the core `PostgresConfig` onto postgres.js
  options (`max`, `connect_timeout`, `idle_timeout`, `max_lifetime`, `prepare`,
  `connection.statement_timeout`). Only provided keys are set, so postgres.js
  defaults are otherwise preserved. Backward-compatible.

- Updated dependencies [e9a778f]
  - @pikku/core@0.12.45

## 0.12.10

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/core@0.12.44

## 0.12.9

### Patch Changes

- 34f254e: Bump the `kysely` dependency range to `^0.29.0` so it dedupes onto a single
  copy alongside Better Auth (which bundles kysely 0.29.x), avoiding two
  incompatible `Kysely` classes (the `#private` brand mismatch) when both pikku's
  adapters and Better Auth share a database connection.

  kysely 0.29 is ESM-only, which the unmaintained `kysely-plugin-serialize`
  (no `exports` map, CommonJS build) cannot import. Its `SerializePlugin` is now
  maintained directly in `@pikku/kysely` and re-exported, and the external
  dependency is dropped from `@pikku/kysely`, `@pikku/kysely-sqlite`, and
  `@pikku/cloudflare`.

- Updated dependencies [6565b97]
- Updated dependencies [34f254e]
  - @pikku/kysely@0.12.16

## 0.12.8

### Patch Changes

- 35bac18: Export PgEventHubService — Postgres LISTEN/NOTIFY backed EventHubService for multi-instance deployments
- Updated dependencies [909eb25]
  - @pikku/core@0.12.26
  - @pikku/kysely@0.12.13

## 0.12.6

### Patch Changes

- a2ee6d0: Stop logging database host, port, and name at info level. Replace process.exit(1) with thrown error on connection failure.
- 8b9b2e9: Fix child workflow completion in queued execution mode. When a sub-workflow completes, the parent step is now marked as succeeded and the parent orchestrator resumes automatically via `onChildWorkflowCompleted`. Adds `parentStepId` to `WorkflowRunWire` to track the parent step without querying. Retains advisory locks in PgKyselyWorkflowService for concurrency safety. Fixes pgboss `registerQueues` to accept an optional logger parameter.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [87433f0]
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
  - @pikku/kysely@0.12.5

## 0.12.5

### Patch Changes

- d3536d8: Support connection string URLs in PikkuKysely constructor. You can now pass a `DATABASE_URL` string directly instead of only config objects or existing Sql instances.
- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6
  - @pikku/kysely@0.12.4

## 0.12.4

### Patch Changes

- Fix workspace protocol references in published dependencies

## 0.12.3

### Patch Changes

- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [387b2ee]
- Updated dependencies [b2b0af9]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3
  - @pikku/kysely@0.12.3
