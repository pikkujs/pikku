## 0.13.24

### Patch Changes

- f10162a: `send()` now reports the delivery id it wrote, not only the broker's job id.

  `KyselyWebhookService.send()` returned `{ jobId }` straight from `queueService.add()`, and callers handed that to `getDelivery()`. That only worked because every queue in the test suite echoed the requested `jobId` back. A broker is free to assign its own identity — the JetStream queue returns a stream sequence — so on those the read-back looked up an id that was never written and 404'd.

  `SendWebhookResult` gains an optional `deliveryId`, which store-backed implementations always populate.

- Updated dependencies [f10162a]
  - @pikku/core@0.12.104

## 0.13.23

### Patch Changes

- 80eb5c0: Encrypt classified columns from the generated manifest.

  `ClassificationPlugin` reads the per-column classification manifest and decrypts `wrapped` and `sealed` columns transparently on the way out. Writes are not transparent — Kysely's `transformQuery` is synchronous and WebCrypto is not — so plaintext heading for a classified column **throws** instead, and values are produced by `ClassificationCrypto.encryptColumn()`. A forgotten call site is a loud error rather than a silent plaintext row. The stored envelope is self-describing (`pikku1.<keyId>.<version>.<wrappedDek>.<ciphertext>`), so a row records which key opens it without a schema change to every table.

  `keyId` now flows from the hand-authored `db/annotations.ts` through `pikku db migrate` into `classification.gen.ts`. It is emitted only for `wrapped` and `sealed` columns: naming a key on a plain column would claim a protection it does not have, and a hashed column has no key at all — the hash is the lookup key.

- Updated dependencies [80eb5c0]
- Updated dependencies [2252016]
  - @pikku/core@0.12.98

## 0.13.22

### Patch Changes

- 4450b2a: Name the missing key when a secret is not found.

  Every `SecretService` threw a bare `Requested secret not found`. In a deployed
  runtime the stack is minified, so the message was the only evidence there was —
  and it identified neither the key nor the service. Each implementation now names
  the key it looked for; the better-auth middlewares that skip on an absent secret
  match the prefix through one shared predicate instead of the whole string.

- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [114c079]
- Updated dependencies [4450b2a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
  - @pikku/core@0.12.93

## 0.13.21

### Patch Changes

- cfd364a: Remove the last `@pikku/core/ecosystem` references and guard against new ones

  `@pikku/kysely`'s workflow-service test still imported `StepState` from
  `@pikku/core/ecosystem/workflow`, a subpath that no longer exists in
  `@pikku/core`'s `exports`. Nothing caught it: the import is type-only, so tsx
  erases it before it can fail at runtime, and the package tsconfig excludes
  `**/*.test.ts`, so `yarn tsc` never saw it either. It now imports from
  `@pikku/core/workflow`.

  A new guard test in `@pikku/core` scans the repository for the dead specifier
  and fails if one comes back, so the next stale import is a red test rather than
  a silent `any`.

- 05e47cf: feat(virtual-user): keep the transcript a run already produced

  The engine returns `intents` and `steps` on every run — what the user set out
  to do, and every turn it took getting there — and `VirtualUserRunOutcome` kept
  neither. The record held counts and findings, so the one question anybody
  actually asks of a completed run ("what did it _do_?") had no answer anywhere,
  even though the answer had been computed and thrown away a moment earlier.

  `VirtualUserRunOutcome` now carries both, and `VirtualUserRunStore` gains a
  `steps(runId, options?)` read. Intents ride on the run record: there are a
  handful of them and every read of the run wants them. Steps get their own
  `virtualUserRunStep` table, because a run at a 500-step budget carries more
  transcript than every other column together and `list()` would pay for it on
  every row.

  Three things the kysely store had to get right, all of them driver differences
  rather than design:

  - steps are inserted in chunks of 50, because a bare sqlite driver binds at
    most 999 variables per statement and ten columns times a 500-step budget is
    five thousand — an un-chunked insert fails on long runs, which are the
    interesting ones;
  - `ok` is stored as 0 or 1, since a bare driver cannot bind a boolean at all
    and `SerializePlugin` is not installed everywhere;
  - `response` is stored JSON-encoded, because a truncated API response usually
    starts with a brace and `SerializePlugin` would otherwise read it back as an
    object rather than the string the engine saw.

  Completing a run that does not exist no longer writes steps: there is no
  foreign key to refuse them and nothing would ever read or reap them.

  **This adds a table to the `virtualUser` schema**, and the runtime creates
  nothing: a database that already has `virtualUserRun` gets the store's own
  refusal at startup until `pikku db generate` writes the migration and
  `pikku db migrate` applies it. Landing it now costs nothing, because
  `scaffold.virtualUser` is not yet switched on anywhere.

- 05e47cf: feat(virtual-user): put each persona on its own clock

  A budget says where one run stops. Nothing said how often a persona should use
  the application, so in practice each one ran whenever somebody remembered — and
  what actually tells you about a product is the same user coming back over a
  fortnight.

  Each persona now gets a row rather than a bigger budget. `virtualUserSchedule`
  holds `enabled`, the disposition and goals to run with, an interval **range**,
  and `nextRunAt`. `tickVirtualUserSchedules` acts on whichever rows are due:

  ```ts
  wireScheduler({
    name: 'virtualUsers',
    schedule: '0 * * * *',
    func: tickVirtualUserSchedules,
  })
  ```

  The tick is generated and wired by nobody, deliberately. A scaffolded
  `wireScheduler` would start spending an application's model budget the moment
  somebody ran `pikku all`, on a host that may not run schedulers at all. Tick
  resolution bounds how late a due persona is, never how often it runs.

  Three things it does that are easy to leave out:

  - The next due time is written **before** the run is dispatched, so a tick that
    dies halfway cannot hand the same persona to the next one. A dispatch that
    throws waits a full interval instead of retrying every minute for a week.
    That write is a compare-and-set against the `nextRunAt` the tick read, so it
    is also how a tick _wins_ the persona: two processes on the same cron see the
    same due row, and only the one whose claim lands dispatches.
  - A persona whose previous run is still `running` is skipped, not queued. Two
    copies of the same user acting at once is a different test, and its findings
    do not reproduce.
  - A run still `running` after two hours is failed. Without that, one restart
    mid-run blocks that persona's schedule permanently — which is where the
    stranded-record cost of not using a queue finally gets paid.

  Reschedule-on-completion was the other candidate and is worse in exactly one
  way, fatally: a crash between finishing and scheduling ends the persona forever,
  and the evidence is an absence.

  New: `VirtualUserScheduleStore` in core (with the tick, `isDue` and `nextRunAt`
  as pure functions), `KyselyVirtualUserScheduleStore` and its own schema —
  its own rather than a third table in `virtualUserSchema`, and owned by its own
  store, so a project that records runs and never wants them unattended carries no
  cadence table. `scaffold.virtualUser` gains `setVirtualUserSchedule`,
  `listVirtualUserSchedules` and the tick, behind a new `virtualUser:schedule`
  scope: starting a run spends money once with a caller watching, while writing a
  schedule spends it repeatedly with nobody there.

  The console's Virtual Users screen gains a **Run now** button beside a persona's
  run history, gated on `pikku:console:virtualUsers:run`. It dispatches the
  project's own `runVirtualUser` rather than starting a run itself, so a run the
  application would refuse — an acted-upon persona, a non-accountable disposition
  in production — is still refused.

- Updated dependencies [3c0012c]
- Updated dependencies [05e47cf]
- Updated dependencies [cfd364a]
- Updated dependencies [05e47cf]
- Updated dependencies [05e47cf]
- Updated dependencies [05e47cf]
  - @pikku/core@0.12.90

## 0.13.20

### Patch Changes

- 274cab3: The singleton intersection moves to the leaves that name it, the runtime stops
  creating schema, and `db generate` writes only the runtime tables a project's
  services own

  `WiredSingletonServices` was exported from the generated function leaf so the
  auth leaf could import it. Nothing outside a generated leaf ever names it —
  emit declarations for a project of any size and it appears in none of them —
  so the auth and middleware leaves derive the intersection themselves and the
  function leaf keeps it private. `WiredServices` stays exported: 147 `.d.ts`
  files name it, and unexporting it asks every wired module to name each member
  service through a specifier it does not have.

  `ensurePikkuSchema` is gone. `requirePikkuSchema` replaces it: a service calls
  it at boot, it looks, and it issues no DDL at all. `pikku db generate` writes
  the declaration down as a migration and `pikku db migrate` applies it, and
  those two are now the only way pikku's runtime tables come into existence. A
  service that finds them missing says so and stops, naming both commands.
  Half-present is no longer a distinct case — the remedy is the same migration
  either way. `audit` and `virtual-user` join `pikkuSchemas` as a consequence:
  boot was the only thing that had ever created them.

  `pikku db generate` applied all of `pikkuSchemas`, so a project with no agents,
  no channels and no workflows still had `agent_threads`, `channels` and
  `workflow_runs` written into its migrations, and then carried them forever. A
  schema now names the services that own it, and generation gates on
  `requiredServices` — the set the inspector already builds for service
  tree-shaking. The gate is one-sided: a schema that names no owner is always
  written, because the session and secret stores and the deployment record are
  reached by the runtime itself and nothing in a project's source implies them.
  Declared scopes now imply `scopeService`, which nothing destructures because
  the generated auth layer is what reaches it.

  Drift keeps asking the unscoped question. A table already in a database has to
  stay recognisable as a runtime table after the service that needed it is
  dropped — scoping it there would report those tables as unexplained.

  Every project in this repo that had been relying on boot-time creation now says
  where its tables come from. `createConfig` moves into its own `config.ts` in the
  templates — `pikku db` looks for it there — and the three postgres templates plus
  the workflow verifier declare `postgresUrl` and run `pikku db generate && pikku
db migrate` before the server starts, from the single connection string their
  runtime opens. The e2e harness cannot: its databases are in-memory sqlite built
  inside the services factory, so nothing outside the process can migrate them. It
  applies the schemas it owns with `applyPikkuSchemas` instead — the same DDL, run
  by the one process that has the database.

- Updated dependencies [32616af]
- Updated dependencies [6848cd9]
  - @pikku/core@0.12.89

## 0.13.19

### Patch Changes

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

## 0.13.18

### Patch Changes

- 746ed6a: fix: one coercion plugin, not three

  The Kysely coercion plugin existed in three copies — the CLI's local database,
  `@pikku/kysely-node-sqlite` and `@pikku/kysely-bun-sqlite` — and all three had
  drifted apart. Only the CLI's resolved a column against the tables the query
  actually named, so two tables that disagree on the kind of a same-named column
  coerced correctly in local development and silently did not at runtime; only
  bun's dropped a genuinely ambiguous column instead of letting the last table
  processed win.

  The single implementation now lives in `@pikku/kysely`, which all three already
  depended on, and keeps both behaviours: table-qualified resolution first, an
  ambiguity-safe bare-name fallback second.

  `ColumnKind` — the value type of the generated `coercion.gen.ts` — is
  `'date' | 'bool' | 'json'`. The CLI's fourth member, `uuid`, was never a
  coercion kind: the codegen excludes it from the map by construction, because a
  UUID is a string in both Postgres and SQLite. It is now `AnnotationKind` in the
  CLI, the union a column may declare in `db/annotations.ts`, of which
  `ColumnKind` is the coercible subset.

  `@pikku/cli` also drops its unused dependency on the Node-only
  `@pikku/kysely-node-sqlite`.

- Updated dependencies [5a1a962]
  - @pikku/core@0.12.86

## 0.13.17

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

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
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

## 0.13.16

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

- a7fcd2e: Declare dependencies that were imported but missing from `package.json`

  `@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
  imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
  `@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
  resolved through Yarn hoisting inside the monorepo and would fail for anyone
  installing the package on its own.

  `rxjs`, `kysely` and `path-to-regexp` reach consumers through public
  signatures — `Observable<BaseEvent>` is the return type of a published method,
  and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
  dependencies rather than build-only ones.

  `@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
  pins, rather than a caret range. The two packages exchange `Observable`s, so a
  range that floats to a second copy gives them two incompatible `Observable`
  types.

  `@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
  `SerializePlugin` that has been marked `@deprecated` in favour of it. Use
  `SerializePlugin`.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.13.15

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

## 0.13.14

### Patch Changes

- e110c55: Add runtime scoring for AI agents: `pikkuAIScorer` for heuristic grades and
  `pikkuAIJudge` for LLM-judged ones, graded off the request path on two queue
  lanes so a slow judge cannot starve the cheap checks. Grades are sampled
  deterministically per `(run, scorer)` and persisted to `ai_run_score`.
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [acc8077]
- Updated dependencies [905f737]
- Updated dependencies [3cc6428]
- Updated dependencies [c524adf]
- Updated dependencies [e110c55]
  - @pikku/core@0.12.81

## 0.13.13

### Patch Changes

- 6dada45: fix(workflow,ai-agent): make a run's owner, entry node and step function authoritative

  A graph run may only start at a node the graph declared in `meta.entryNodeIds`, and
  the generated `POST /workflow/:workflowName/graph/:nodeId` route that let an HTTP
  caller pick the entry node is gone. `startNode` stays for `PikkuTriggerService`,
  which names a declared entry node anyway.

  `StepState` now records the `rpcName` the workflow dispatched a step with, and the
  step claim rejects a queue message naming a different function with
  `WorkflowStepFunctionMismatchError` before mutating any status — a step runs under
  the run owner's identity and without the `expose` gate, so the message must not
  choose what runs.

  `approveStep` takes the caller's session, and the generated status routes and
  streams assert the same `assertWorkflowRunOwner` check: a run started through a
  session may only be read and approved by that session's user. A run with no
  recorded owner (trigger, scheduler, unauthenticated route) has nobody to compare
  against and is still gated by the entrypoint's own `auth`/`permissions`.

  `AIRunStateService.resolveApproval` is now a compare-and-swap returning whether
  _this_ caller made the claim, and both agent resume paths run a tool only for the
  approvals they claimed — concurrent approvals of one tool call no longer all
  execute it.

- Updated dependencies [41c1a95]
- Updated dependencies [ce96383]
- Updated dependencies [7e60867]
- Updated dependencies [f8f1244]
- Updated dependencies [dcf20cb]
- Updated dependencies [6512384]
- Updated dependencies [e3b4c14]
- Updated dependencies [efd0ed1]
- Updated dependencies [cba98fb]
- Updated dependencies [ce96383]
- Updated dependencies [f8f1244]
- Updated dependencies [f8f1244]
- Updated dependencies [6e93a35]
- Updated dependencies [6dada45]
  - @pikku/core@0.12.80

## 0.13.12

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

## 0.13.11

### Patch Changes

- f5ce870: Recover workflow runs stalled by a crash mid-dispatch.

  Arming a step is two writes to two systems — the step row, then the queue or
  scheduler job — so a process that died between them left a run `running` with
  nothing in flight. It parked on a step that would never complete and never
  error, so the run neither finished nor failed, and nothing swept it up.

  `workflowService.recoverStalledRuns()` re-drives those runs through
  `resumeWorkflow`. Replay is memoized per step, so resuming a run that was not
  actually stuck changes nothing; runs mid-sleep or with a step in flight are
  excluded outright. It is not self-starting — call it from a scheduled task.

  Stores opt in by overriding `findStalledRunIds`; implemented here for the
  Kysely and in-memory services, and a no-op elsewhere.

- Updated dependencies [f5ce870]
  - @pikku/core@0.12.78

## 0.13.10

### Patch Changes

- 3df4f95: Scaffold virtual user runs as RPCs, backed by a run store.

  `pikku persona run` could already turn a declared persona loose on a running
  stage, but only from a terminal, and the result only existed in that terminal's
  output. There was no way for CI, a console, or a scheduled job to start a run —
  and nothing kept what a run found, so this week's findings could not be compared
  against last week's.

  `scaffold.virtualUser` now generates two RPCs and the function behind them:
  - `runVirtualUser({ persona, goals?, memory?, disposition?, budget?, seed? })
-> { runId }`
  - `getVirtualUserRun({ runId }) -> { status, findings, tally, memory, … }`

  They are gated on separate scopes — `virtualUser:run` and `virtualUser:read` —
  because an adversarial run's findings are working exploits carrying live ids,
  which makes reading them the more sensitive of the two. Production refuses every
  disposition but `accountable`, checked against the effective one so the
  per-run override cannot smuggle another in.

  **A run is not a workflow and not a queued job.** It explores, so no two
  attempts take the same steps and there is nothing to replay; and the record
  already carries the progress a queue would only be holding on the way to the
  same place. `runVirtualUser` writes the record, dispatches without awaiting, and
  returns the id. The cost is stated on the type: a restart mid-run strands a
  record at `running`, so a run older than its budget window and still `running`
  is dead rather than working.

  `@pikku/core` gains `VirtualUserRunStore` (with `virtualUserRunStore` on
  `CoreSingletonServices`), and `@pikku/kysely` ships
  `KyselyVirtualUserRunStore`, which creates its own table on first use like the
  audit sink — the runtime never needs it, so it arrives with the feature that
  fills it rather than in every database.

  Also in core: `prepareVirtualUserRun`, which derives the catalogue, intents,
  scopes and reachable agents in one place. `pikku persona run` reads the
  inspector state and the generated RPC reads `metaService`, and the two have to
  agree — otherwise the same persona and seed explore a different API depending on
  how the run was started. `personaScopes` moved here from the CLI for the same
  reason and is still re-exported from its old home. `PRODUCTION_DISPOSITION` is
  now exported from `@pikku/core/virtual-user`, which it should always have been.

- Updated dependencies [3df4f95]
  - @pikku/core@0.12.77

## 0.13.9

### Patch Changes

- 62ea4cc: The audit trail is now readable — in the generated meta, through an RPC, and as
  a page in the console.

  `audit: true` reaches `FunctionRuntimeMeta.audit` as its resolved form
  (`{ durability }`), so which functions record anything is answerable without
  running them. It is informational: the runner still resolves audit from the live
  function config, so meta and runtime cannot disagree.

  `AuditService` grows an optional read side — `query(AuditQuery)` and `facets()`.
  Optional because a sink can legitimately be write-only: a queue producer that
  hands events to another system has nothing to read back, and a reader that finds
  these absent should say the trail is not readable here rather than that it is
  empty. The two are very different answers to give someone auditing a system.

  `KyselyAuditService` implements both, newest first with offset paging, filtered
  by user, action and time window. Two things it now gets right that are easy to
  get wrong: an empty filter array means "match nothing" rather than "no filter",
  and results are read by physical _and_ camelCase key, because `CamelCasePlugin`
  is on most pikku Kysely instances and renames result keys on the way out — the
  mismatch does not throw, it returns a page of `undefined`. `init()` creates the
  `audit` table for projects that do not migrate it themselves, from a new
  exported `auditSchema` that stays out of `pikkuSchemas` because the runtime does
  not need it.

  The console addon exposes `console:getAudits` and `console:getAuditFilters`
  behind a new `pikku:audit:read` scope, and forwards the application's `audit`
  service into the addon's own services — without that last part every install
  reported the trail as unreadable, whatever sink it had configured.

  The console gets an Audit trail page: an infinite list filtered server-side by
  user and action, and a row that opens the whole event, metadata rendered as a
  JSON tree. Refused, unreadable and empty are three different screens, because
  "you may not read this", "nobody can read this" and "nothing happened" are three
  different facts.

  Events name the person who caused them. The trail records a user id — the only
  thing stable enough to record, since a name can change after the event — so
  `getAudits` resolves those ids against better-auth's user directory at read
  time, and the page shows the name while keeping the recorded id on the event.
  The filter follows: pick a colleague by name, filter by the id. A scenario
  actor is labelled as one, so synthetic traffic is not mistaken for real, and a
  caller who was signed out shows the wire identity pikku resolved for them
  rather than being credited to the system.

  **Breaking, for anyone already reading `AuditEvent`:** `actor` is now
  `userIdentity`, and its type `AuditActor` is `AuditUserIdentity`; `AuditQuery`
  takes `userIds`/`orgId` in place of `actorUserIds`/`actorOrgId`, and
  `AuditFacets` returns `userIds`. In pikku an _actor_ is a synthetic person a
  scenario drives, flagged on the user row — so naming the causer of an event
  `actor` made the synthetic case unsayable (`actor.actor === true`) and implied
  every recorded action was a test. The overwhelming majority are ordinary
  customers. The `audit` table follows: `actor_user_id` / `actor_org_id`
  are now `user_id` / `org_id`, and a `pikku_user_id` column joins them so the
  wire identity of a caller who never signed in survives the round trip — the
  sink was dropping it, which left the console's Session field permanently
  blank. A project that already migrated the table needs to rename the two
  columns and add the third; `KyselyAuditService.init()` creates the new shape
  for anyone who did not.

- 78b29f0: `SecretService` now returns a `SecretValue<T>` rather than the bare value, so a
  vault secret cannot reach a sink by accident.

  `SecretValue` is nominally typed, which means it is not assignable to `string`
  (or to any other concretely-typed field). Every sink with a real type — a
  database column, an email body, a session payload — rejects it with no lint
  rule involved. The sinks typed `any`, `unknown`, or a free generic — the logger,
  queue payloads, webhook and email inputs, and a function's own output — are
  guarded with `Safe<T>`, which collapses a `SecretValue` found anywhere inside
  `T`, however deeply nested, to `never`.

  Unwrap deliberately at the point the secret reaches the wire:

  ```ts
  const secret = await secrets.getSecret('BETTER_AUTH_SECRET')
  betterAuth({ secret: secret.reveal() })
  ```

  Two behaviours cover what types cannot see. Structured serialization redacts —
  `JSON.stringify` and node's inspect both yield `[secret]`, so an audit or log
  write stays honest without crashing the request. String coercion throws
  `SecretCoercionError`, because a template literal is always a leak.

  `AuditLog.write` is guarded the same way as the logger, since an audit event
  carries `input` and `metadata` as `unknown` and nominality alone cannot stop a
  secret landing in one.

  `.reveal()` is the deliberate escape hatch, and what it hands back is an
  ordinary string as far as every sink signature is concerned. **PKU953** closes
  that gap: under `pikku all --security` the inspector reports a revealed secret
  that flows into a logger, an audit, a queue, an email or a webhook — `console` included.

  This also fixed a real one: `remote-addon-auth.ts` called `String(token)` on an
  `unknown` and wrote the result straight into an `Authorization` header.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.12.76

## 0.13.8

### Patch Changes

- cabd9dc: Add a `db.schema` CLI config option, so `pikku db generate` can write the runtime tables into a named postgres schema.

  Without it the generator emits unqualified `create table` against the default `search_path` of `"$user", public`. A project that keeps everything in one namespace — `app`, say — gets a second copy of every runtime table in `public` alongside the ones it already has, which is how stray `public.ai_*` tables appear next to the real `app.ai_*` ones.

  `compilePikkuSchemas` takes the schema and binds only the rendered SQL, never the caller's connection: that connection is the throwaway database the declaration was just applied to, and qualifying it would create tables in a schema the scratch database has never heard of.

  Raw SQL is not rewritten by `withSchema`, so `rawStatement` now also accepts a builder taking a `SchemaContext` — the expression index on `credentials` uses it to qualify its own table. Statements otherwise pick the context up from whatever connection they are handed, so a schema-bound connection needs nothing said twice.

  Two fixes fall out of it:
  - The `ALTER TABLE` delta for a partially covered source is written from bare introspected names, so it is qualified explicitly. Unqualified it altered a table in whichever schema `search_path` found.
  - A source was only counted as partially covered on an exact name match, so a project whose migrations already create `app.workflow_step` read as "nothing covered" and had its whole schema re-emitted over tables that were already there. It now matches the schema qualifier the same way the drift diff does.

  `db.schema` is postgres only, and is rejected with an explanation on sqlite, whose `REFERENCES` clause takes a bare table name.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
  - @pikku/core@0.12.75

## 0.13.7

### Patch Changes

- 6a307f0: Fix four latent correctness bugs in the function, RPC and error runtimes, and
  remove dead code from the workflow service surface.

  `WorkflowService.getNodesWithoutSteps` is gone. It was declared on the abstract
  service and implemented by all five storage backends, and nothing ever called
  it — hence the non-core packages in this changeset, which only lose that method.

  **An RPC could execute twice.** `RPCService.invoke`, its addon path, and
  `rpcWithWire` each wrapped the _execution_ of a resolved function in a `try`
  whose `catch` treated `RPCNotFoundError` as "not found locally" and re-dispatched
  the call through `deploymentService`. A nested `rpc.invoke` to a missing name,
  raised from inside an already-running function, therefore re-ran that function on
  a remote instance after its local side effects had already committed. Resolution
  is now separated from execution on all three paths, so only a genuinely
  unresolvable name reaches the fallback. What escapes to callers is unchanged.

  **`addonNamespace` leaked between sibling calls.** The function runner's
  middleware path restored `rpc`, `functionId`, `audit` and `addonNamespace` after
  an invocation; the non-middleware path restored the first three but not the
  fourth. A call into an addon function with no middleware left the addon's
  namespace on the wire, so subsequent sibling calls resolved the wrong
  per-instance singletons and `credentialOverrides`.

  **Errors registered on a subclass never resolved.** `misc.errors` was typed
  `Map<PikkuError, ErrorDetails>` — instances — while `addError` stores
  constructors, a mismatch hidden by its `error: any` parameter. The instance
  lookup in `getErrorResponse` was consequently dead, and lookup fell through to a
  scan comparing `constructor.name`, so a subclass of a registered error got no
  status mapping at all. The map is now typed `Map<PikkuErrorConstructor, …>` and
  lookup walks the prototype chain first. Name matching is retained, deliberately,
  as the fallback that keeps error mapping working when two copies of
  `@pikku/core` are installed.

  **`createWeakUID` collided across instances.** The prefix was
  `Date.now().toString(36)` evaluated at module load, so any two instances loading
  the module in the same millisecond emitted identical `channelId` and `requestId`
  sequences — reproducibly, not just in principle. It is now seeded lazily from
  `crypto.randomUUID()`.

  Also: `pikkuState` keys its global map with `Symbol.for` rather than `Symbol`, so
  two copies of the package share registrations instead of silently getting
  disjoint state; and the local channel upgrade path no longer keys its middleware
  cache on the raw request path, which grew the cache without bound while the
  cached value never varied by path.

- afef587: Close eleven security weaknesses found in a review of `@pikku/core`. Most are
  breaking, and two invalidate data or credentials already in the wild — read the
  migration notes before upgrading.

  **Breaking: AI agent thread ownership now fails closed.** Reading, listing,
  resuming or approving an existing thread or run requires a resolved session
  principal (`userId`, or `orgId` for `sessionScope: 'org'`), regardless of the
  agent's `auth` setting. Previously a request without a session had no ownership
  model at all: the caller-supplied `resourceId` was accepted as the ownership
  key, so any caller could read or resume another party's thread by naming its
  `resourceId`. Worse, `threadOwnerConstraint` returned `undefined` for a
  sessionless caller, and `undefined` means _no filter_ rather than _no rows_ —
  so `getAgentThreads` returned every thread in the deployment. It now returns
  `string[]`, empty for a sessionless caller, which every storage backend already
  treats as matching nothing. Sessionless agents still run one-shot conversations,
  each with a fresh unguessable owner; what they lose is cross-request continuity.
  Wire a session to restore it.

  **Breaking: stored secrets and credentials must be re-entered.** `deriveKey` ran
  a single unsalted round of SHA-256 over the passphrase and used the digest
  directly as the AES-GCM key — roughly one hash per brute-force guess, with one
  rainbow table working against every deployment. It is now PBKDF2-HMAC-SHA256 at
  600,000 iterations over a random salt. There is no compatibility path: every
  value held by the kysely, mongodb and redis secret services and the kysely
  credential service becomes undecryptable. They fail loud, naming the key and
  `key_version`, so the app hard-fails on first secret read until each is re-set.

  The KEK salt is scoped to the key version and stored alongside it, rather than
  per secret, so a bulk read costs one derivation instead of N — `getSecrets` over
  50 secrets went from ~2.3s to ~48ms, and rotation from ~4.6s to ~94ms. This adds
  a salt table (kysely), hash field (redis) or collection (mongodb), created
  automatically on first use.

  **Breaking: `PIKKU_REMOTE_SECRET` must be at least 32 characters.** The
  remote-RPC session envelope moved from PBKDF2 to HKDF, which expands
  high-entropy key material rather than stretching a low-entropy passphrase. That
  took a remote hop from ~269ms to ~0.4ms — PBKDF2 was running twice per request —
  but HKDF supplies no brute-force resistance, so the secret must carry the
  entropy itself. A shorter secret now throws `WeakKeyMaterialError` at both ends.
  Generate one with `openssl rand -base64 32` and roll it out to every service in
  the mesh together: existing bearer tokens are format-incompatible, so a partial
  rollout produces 401s until every instance is updated. The Cloudflare, Lambda
  and Azure deployment services each hand-rolled a copy of `buildRemoteHeaders`
  and now call the shared one, which is what keeps the two sides in step.

  **Breaking: previously signed content URLs stop verifying.** `LocalContent`
  signed only `{signedAt, expiresAt, notBefore}`, so a signature proved when a URL
  was issued but never what it was issued for — any valid token was a skeleton
  key, and swapping the pathname from a public thumbnail to a private document
  still verified. The signature now binds the request path. Separately, the
  verifier returned "valid" when no JWT service was wired, which is how
  `pikku serve` ran: a forged `?signedAt=0&expiresAt=99999999999999` was accepted.
  It now rejects with 403, `LocalContent` requires a `JWTService`, and
  `pikku serve`/`pikku dev` mint an ephemeral per-process signing key so local
  development works without shipping a fail-open path. In-flight signed URLs must
  be re-issued.

  **Request body size limits now apply to every adapter.** The `maxBodySize` cap
  existed only in `PikkuFetchHTTPRequest`. The real hole was uWebSockets, which
  drove `res.onData` itself and concatenated every chunk with no bound and nothing
  downstream able to intervene; it now drops chunks past the limit and replies 413
  before routing. Fastify delegates to its native `bodyLimit` (set only when
  `maxBodySize` is configured, so fastify's stricter 1 MB default is never
  loosened), and `PikkuExpressServer` feeds the limit into its body parsers. Two
  paths can only reject rather than prevent, and are documented as such:
  `express-middleware` mounted on your own app receives an already-parsed body, so
  that deployment must bound its own parser; Next server actions bottom out at
  `experimental.serverActions.bodySizeLimit`.

  **Breaking: the console addon's privileged functions are gated by default.**
  `wireAddon` gains a `scopes` option that applies to every function in the
  addon's namespace, and the console scaffold now generates
  `wireAddon({ name: 'console', package: '@pikku/addon-console', scopes: ['admin'] })`.
  Previously the console's entire privileged surface — around 54 functions
  including `credentialGet`, which returns a resolved OAuth token for an arbitrary
  `userId`, `updateFunctionBody`, and `installAddon`, which shells out to a
  package install — was protected only by an optional host-registered
  `addGlobalPermission`. `resolveGlobalPermissions` returns `[]` when none is
  registered and permission checking then no-ops, so an app that never registered
  one served those functions to anyone, and with the template's default
  `scaffold.rpc: "no-auth"` that meant unauthenticated. All of them now return 403
  `MissingScopeError` without an `admin`, `admin:*` or `*` scope. **Regenerating
  is required** — an app holding an old `console.gen.ts` stays open.
  `installAddon` and `installOpenapiAddon` additionally declare their own
  `auth: true, scopes: ['admin']`, and `getAgentThreads` now scopes its listing to
  the session's own threads unless the caller holds admin.

  Addon scopes are enforced in `runPikkuFunc` rather than at the RPC boundary,
  because a wiring can reference an addon function directly — the inspector
  records the addon's `packageName` on HTTP, channel, schedule, queue, CLI,
  trigger, gateway and MCP wirings — and those paths never call `resolveNamespace`.
  Enforcing at the RPC seam would have covered only the `namespace:function` form
  while reading as complete.

  **Breaking: `wireAddon`'s `auth` and `tags` now apply on direct wirings too.**
  Both were read only by `resolveAddonFunction`, so they had exactly the hole
  scopes had: `wireAddon({ name: 'console', package: '@pikku/addon-console', auth:
true, tags: ['admin'] })` gated `rpc('console:credentialGet')` and gated nothing
  at all on an HTTP route wired straight to `credentialGet`. A consumer who
  reached for the documented way to lock an addon down got a control that was
  silently inert on every wiring except one. Both now resolve in `runPikkuFunc`.
  `auth` merges as an OR — `auth: false` from an addon is ignored on a direct
  wiring, because an addon may require a session the wiring did not but must never
  waive one it did. Addon tags resolve to concrete middleware against the **root**
  tag groups before the call rather than being folded into the function's
  inherited middleware: `addTagMiddleware('admin', …)` is written by the consuming
  app and registers under the root package, whereas `combineMiddleware` would look
  the tag up under the addon's own `packageName`, where it does not exist.

  One consequence worth naming: an addon that wires `auth: true` and also runs its
  own sessionless internal work — a scheduled task or queue worker inside the
  addon calling a sibling function — is now gated where it previously was not,
  because a bare `rpc('fn')` from inside the addon reaches `runPikkuFunc` with the
  addon's `packageName` like any other call. This reverses a decision that
  deliberately scoped the gate to the namespaced boundary; that reasoning held
  only while the boundary was real, and a direct wiring can enter an addon without
  crossing it, so "already inside" is not something the runtime can infer. Such an
  addon should carry authorization on the function via
  `pikkuFunc({ permissions })`, which has always been enforced on every path. A
  follow-up will add execution provenance so an intra-addon call can be
  distinguished from an external one and skip the addon-level check; that needs a
  marker no caller outside the process can set, which is its own design problem
  and does not belong in a security fix.

  **Codegen now warns when an exposed function has no gate (PKU574).** The
  generated `POST /rpc/:rpcName` dispatcher forwards to `rpc.exposed`, which
  refuses anything without `expose: true` — but nothing checked whether the
  target was gated, because a dispatcher cannot know what it dispatches to. The
  console shipped ~54 privileged functions through that gap and the toolchain was
  silent. The inspector now reports every function that is exposed, sessionless,
  and carries no `auth`, `scopes` or `permissions` of its own and none from a
  governing `wireAddon`. It is a `warn`, not a critical: `expose: true` on an
  ungated sessionless function is correct for a genuinely public endpoint, so it
  blocks a build only under `--fail-on-warn`.

  Two pieces of metadata were missing for this to be answerable statically, and
  both are now recorded. A `pikkuSessionlessFunc`'s own `auth: true` was read at
  runtime but never written to function meta, so a self-gated function was
  indistinguishable from an ungated one — `sessionless` carries the baseline, and
  `auth` now carries the tightening. And `wireAddon`'s `scopes`, `auth` and `tags`
  were not parsed at all: the inspector recorded the addon's `rpcEndpoint` and its
  secret, variable and credential overrides, and dropped every one of its gates.
  An addon whose gates are not statically knowable is treated as gated, because a
  false positive on a correctly-secured addon costs more than the one case it
  would catch.

  **Breaking: an application's global permissions now apply inside addons.**
  `resolveGlobalPermissions` read only the bucket matching the function's own
  package, but the generated `addGlobalPermission` wrapper takes no package
  argument and always registers under the root. An app-wide rule like "every
  request needs a signed-in user" therefore stopped at the addon boundary, and the
  bucket an addon's functions did read was one no host could write to — which is
  why the console addon's recommended `addGlobalPermission([isAdmin],
'@pikku/addon-console')` was never a gate anybody could actually install. A
  function now resolves the root bucket and its own package's, root first.
  Unioning is safe in a way nothing else here would be: globals AND, so adding the
  root ones can only tighten. Package buckets stay one-way — a package's globals
  never reach root functions, or an installed addon could gate the whole
  application. Apps with both a root global and addon-provided functions will see
  those functions gated where they previously were not.

  **Codegen now records whether each HTTP route requires a session, and warns
  about inert addon tags (PKU575).** Four separate things can demand a session —
  the function's `sessionless`, its own `auth`, the route's (or its group's)
  `auth`, and the addon it belongs to — and answering "which routes are open?"
  meant joining all four by hand and knowing which wins. Each route's meta now
  carries the resolved `requiresSession` alongside the route's own `auth`. Scopes
  count as requiring one, since they are matched against the session's and fail
  closed. Anything not statically knowable resolves to `true`, matching PKU574:
  a route that looks stricter than it is costs less than one that looks open and
  isn't. Separately, `wireAddon({ tags: ['admin'] })` reads like a gate and is
  applied like one right up until no `addTagMiddleware('admin', …)` exists, at
  which point it resolves to an empty list and gates nothing; that now warns.
  Only addon tags are reported — a tag on a function is as likely to be
  organizational, and warning about those would bury the case that matters.

  **Object-shorthand permissions were missing from meta.** The inspector visited
  `ts.PropertyAssignment` but not `ts.ShorthandPropertyAssignment`, so
  `permissions: { canAdminOrg }` — enforced identically to the longhand form at
  runtime, since `verifyPermissions` has a non-array branch — was recorded as _no
  permissions at all_. That is the most dangerous direction for meta to be wrong
  in: an audit reading it sees an open door where one is shut. It cost this review
  a false IDOR report across ~35 billing and org functions before the source
  contradicted the metadata.

  **Functions that authorize in their own body can say so.** A webhook receiver
  verifying a signature, or a handler redeeming a signed invite, is genuinely
  closed while carrying no session, scope or permission — indistinguishable in
  meta from one nobody remembered to gate, and so warned about forever by PKU574.
  `selfAuthenticated: true` on the function config records the claim and silences
  the warning for that function. It is declarative only: nothing at runtime reads
  it and it grants nothing. Detection was rejected deliberately — inferring it
  from the body means a function that _looks_ like it checks something silences
  the warning while checking nothing, and a warning that is usually wrong stops
  being read.

  **Breaking: `scaffold.<feature>` is now `boolean | { auth?, path? }`, and `true`
  means authenticated.** The old `'auth' | 'no-auth' | false` read like a
  starter-file preference while being a live authorization decision, set three
  directories from the functions it governed — the shape the console incident
  took. A surface now becomes public only by writing `{ auth: false }`, so
  omitting a field can never open anything: the failure mode of a forgotten flag
  is a locked door. `{ path }` additionally overrides where the file is
  generated, which previously could only be set for all features at once via
  `pikkuDir`.

  The legacy strings are **refused, not coerced**. `resolveScaffoldFeature` throws
  naming the key and its replacement (`"rpc": "no-auth"` → `"rpc": { "auth":
false }`), and it does so at config load, not downstream. An earlier design used
  a bare `string` for the output path, under which `"no-auth"` would have parsed
  as a file named `no-auth` and every unmigrated config would have silently
  produced nonsense; the object form makes any string invalid, so the failure is
  loud.

  The collapse is deliberately not uniform in effect. For `rpc` the flag was a
  blanket "no anonymous RPC in this app" set on a dispatcher that cannot know what
  it dispatches to; for `userAdmin` it was redundant, since the generated
  functions are already `pikkuFunc` with `scopes: ['admin:users:list']`. But for
  `agent`, `workflow`, `events` and `scenarios` it is the only gate — those
  generate real endpoints the app never authors — so `true` keeps them
  authenticated rather than opening them as a side effect of a config cleanup.
  `webhook` and `remoteRpc` have no auth dimension at all (`serialize-remote-rpc.ts`
  hardcodes `auth: false`), so an `{ auth }` on them is ignored. The three
  configs in this repo are migrated preserving their current behaviour exactly.

  **Queue job identities are signed.** A job carried the producer's `pikkuUserId`
  as a plain string and the worker resolved a session from it with no
  verification, so write access to the queue backend was act-as-any-user. The
  identity is now `pq1.<claim>.<hmac>`, HMAC-SHA256 over the claim and the
  canonicalized job payload, keyed by HKDF expansion of a new
  `PIKKU_QUEUE_IDENTITY_SECRET`. Producers opt in by wrapping their queue service
  with `SignedQueueService`. This fails safe rather than closed: with no secret
  configured the identity is dropped and jobs still process, warning once per
  process, so no existing deployment breaks on upgrade — it simply loses queue
  identity until the secret is set. The payload rather than the job id is bound
  because SQS, Cloudflare Queues, Azure and the in-memory service all mint ids
  after `add` returns.

  **Workflow inline state is read from the run record.** `isInline` consulted a
  process-local `Map`, while `WorkflowRun.inline` is durable. Any instance that
  did not start a run disagreed with the record, so one instance could dispatch a
  queued job for a workflow another was already executing in-process. It is now
  async and resolves through the durable identity, cached only when a context
  already exists so a passive reader allocates nothing. The same `Map` also leaked:
  `nextStepKey` fabricated replay state on every step, and `releaseContext`
  refused to free anything carrying it, so runs whose steps executed outside a
  `beginReplay` bracket — the step-worker queue path — stranded their context and
  step state for the process lifetime. Contexts are now released by an explicit
  execution counter. Step ordinals reset per execution rather than accumulating
  across step-worker invocations in one process, which makes step naming
  independent of how work was distributed.

  **Secret reads fail loud in every store.** `MongoDBSecretService.getSecrets`
  skipped rows that failed to decrypt, and the redis equivalent dropped every
  rejection via `Promise.allSettled`, including the "No KEK available for
  key_version N" configuration error. Both now throw, naming the key and its key
  version, matching the kysely behaviour. This matters most alongside the KEK
  change above: without it, an upgrade surfaces as a partial secrets map and an
  opaque downstream failure instead of an error naming the secret to re-enter.

  **A second middleware registration for a pattern no longer erases the first.**
  `addHTTPMiddleware`, `addTagMiddleware` and `addChannelMiddleware` groups are
  keyed by pattern or tag and held one source file each, so a second file's call
  overwrote the first's. Codegen emits its imports from what is stored, so the
  losing file was never imported and its middleware never registered — the
  runtime composes repeated registrations for a pattern happily, and only codegen
  dropped one. Adding an unrelated `addHTTPMiddleware('*', …)` to an app was
  enough to silently unregister the generated better-auth session bridge, which
  fails open and gives no sign until a request arrives without a session. A group
  now carries every registration made for it, and all of them are imported.

- Updated dependencies [6a307f0]
- Updated dependencies [afef587]
- Updated dependencies [8075f6a]
  - @pikku/core@0.12.74

## 0.13.6

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

- a261006: **Breaking:** removed dynamic workflows — runtime-defined workflow graphs stored in the database and resolved by name instead of by codegen.

  The feature was already half-gone. Its authoring surface (`createAgentWorkflow`, `saveAgentWorkflow`, `listAgentWorkflows`, `executeAgentWorkflow`, and the AI-agent instruction builder) was deleted in April 2026 along with its entire e2e suite, and nothing has written a dynamic workflow since. What remained could not execute one either: `executeAgentWorkflow` gated on `pikkuState('workflows', 'meta')`, which only codegen ever populates, so a graph that existed solely in the database was never findable. The two backend families had also drifted onto different `source` sentinels (`'ai-agent'` vs `'dynamic-workflow'`), and the two Redis implementations disagreed on key escaping — so at least one of them matched nothing. Rather than keep shipping plumbing for a path no caller could complete, it is removed until it can be reintroduced deliberately.

  Removed:
  - `getAIGeneratedWorkflows` from `WorkflowService` and `WorkflowRunService`, and from every backend (in-memory, Redis, MongoDB, Kysely, and the Cloudflare Durable Object service and client — the last two were already a `return []` stub and a rejection).
  - The database-lookup fallbacks in `startWorkflow` and `runWorkflowJob` that resolved a workflow name against stored graphs when static meta had no match.
  - `'dynamic-workflow'` from the `WorkflowRuntimeMeta['source']` union.
  - `validateWorkflowWiring` and `computeEntryNodeIds` from `@pikku/core/workflow`. These validated AI-authored graphs and had no callers in core; the inspector keeps its own private entry-node computation for static graph wiring, which is unaffected.
  - The `workflow-created` AI stream event and its AG-UI `pikku:workflow-created` custom event. Its only emitter went with the April deletion, so it could never fire.
  - The console's `console:getAIWorkflows` RPC, the `useAIWorkflows` hook, the "Dynamic" workflow filter and badge, and the trigger-schema scraper that derived an input form from a stored graph's `$ref` bindings.

  Kept, because static graph workflows depend on them and this is not a change to versioning:
  - `upsertWorkflowVersion`, `getWorkflowVersion`, `updateWorkflowVersionStatus`, and the `workflowVersions` storage in every backend. These back version-mismatch replay: when a deployed graph's hash changes, in-flight runs continue against the exact graph they started on. No schema migration is needed — the table, its columns, and its `(workflowName, graphHash)` upsert key are unchanged.
  - `generateMermaidDiagram`, which renders any workflow graph and is not specific to dynamic ones.

  Static `pikkuWorkflowGraph` and DSL workflows are entirely unaffected: they resolve from codegen'd meta, which was always the only path that worked.

  To revive this post-MVP, the deleted authoring code is recoverable in full — its prompt engineering (a compact tool table upfront, full schemas with flattened dotted output paths returned only after a validation failure) is worth reading before rewriting:

  ```
  git show f52f3308b^:packages/core/src/wirings/ai-agent/agent-dynamic-workflow.ts
  git show f52f3308b^:packages/core/src/wirings/workflow/graph/graph-validation.ts
  git show f52f3308b --stat   # the April removal, incl. the three e2e feature files
  ```

  Note that reviving it needs more than restoring those files: the queued-step path (`executeWorkflowStep`), `onError` compensation, and sub-workflow resolution all read static meta only and would need a fallback for a graph that exists solely in the database.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71

## 0.13.5

### Patch Changes

- 220a8c4: fix: `ensurePikkuSchema` now sees tables on a `withSchema(...)`-bound connection

  It read the table name out of its own compiled DDL with a regex that matched the
  first quoted identifier. On a connection bound to a schema that DDL is
  `create table "app"."workflow_runs"`, so it captured `app` — never a real table
  name — concluded every table was missing, and issued a bare `create table` that
  the database rejected with `relation "workflow_runs" already exists`, on every
  boot.

  The schema half of the name is now parsed, and the lookup matches on the pair
  when the DDL is qualified (falling back to the bare name when it is not, since
  an unqualified statement resolves against a `search_path` that is not knowable
  from here). Error messages name the schema too.

  Also: applying a schema over a `withSchema(...)`-bound **sqlite** connection now
  explains itself. `withSchema` qualifies foreign key targets along with everything
  else — which postgres requires and sqlite refuses, since a `REFERENCES` clause
  there takes a bare table name — and all the engine says about it is
  `near ".": syntax error`. The failure is now reported with the schema that
  produced it and what to do instead, with the engine error kept as the `cause`.

## 0.13.4

### Patch Changes

- 91077ff: Declare the pikku runtime tables instead of creating them at boot.

  The tables the runtime needs — workflow, AI, scopes, secrets, credentials, webhooks, channels, deployments, sessions — were created by `createTable(...).ifNotExists()` inside each service's `init()`. A table therefore existed if and only if some service happened to be constructed, in whatever order, with whatever schema qualifier that call site passed. In one deployment that produced a duplicate set of AI tables in `public` shadowing the intended ones in `app`.

  `pikkuSchemas` is now the single declaration, exported from `@pikku/kysely`: the same kysely schema-builder chains, moved out of `init()` and never executed at boot. `applyPikkuSchemas` materializes them onto a database, `compilePikkuSchemas` renders them as SQL for a dialect, and both bind `CamelCasePlugin` themselves so a declaration always compiles to the physical names the rest of the package queries.

  `applyPikkuSchemas` runs its statements in one transaction, so the promise it makes about a half-applied database holds for the failures the prerequisite check cannot foresee too — a statement colliding with a table something else already created rolls back the ones that ran before it.

  Auth is a declared prerequisite. `pikkuUserRole` and `pikkuUserScope` reference `user.id`, which Better Auth owns, so `scopeSchema` says so via `requires` and `applyPikkuSchemas` checks every prerequisite before creating anything — a project without auth gets a sentence naming what is missing and who owns it, not a foreign key error and not a half-applied database. `resolveRequirements` returns the same answer as data for callers that need to describe the gap rather than die on it.

  That prerequisite also fixes a fourth disagreement: `user_id` was declared `text`, but `user.id` has no fixed type — Better Auth decides it from config, giving `uuid` under `generateId: 'uuid'` and an identity `integer` under `'serial'`, and postgres refuses a `text` column referencing either. The whole statement was rejected, so `KyselyScopeService.init()` had never actually created these tables on such a project — one had a migration written by hand with a comment explaining why. The column now takes its type from the column it references, whatever that turns out to be.

  Three further disagreements the single declaration settled:
  - `aiRun` was created by two services with different columns. `KyselyAIStorageService` omitted `pendingApprovals`; `KyselyAIRunStateService` declared it and read it back through `as any` casts. Whichever ran first decided the shape, and where the storage service won, resolving an approval failed. The column is declared.
  - `workflowRuns`, `workflowStep` and `workflowStepHistory` defaulted their primary keys to `sql.raw("'" + crypto.randomUUID() + "'")`, evaluated once when the statement was built — one shared default for every row, not a generator. Dropped; the services supply the id.
  - `workflowStep.fromStepName` was backfilled by an `alterTable(...).execute().catch(() => {})` bolted on after the fact. It is part of the declaration.

  Every service's `init()` now goes through `ensurePikkuSchema`, which looks before it creates: all the tables present is a no-op, none present creates them from the declaration, and some present throws rather than filling in the rest. That last case is the point. `.ifNotExists()` turned every failure into a silent success — it is why nobody noticed the `user_id` type had been rejected since the day it was written — and a schema half-owned by a migration and half by a boot-time create is the condition all of this exists to end. Around 615 lines of duplicated DDL went with it.

  Creating at boot is now the fallback rather than the intent: run `pikku db generate` and `init()` takes the `present` path and issues no DDL at all.

  `KyselyPikkuDB` stays hand-written, because it carries what introspection cannot recover — `WorkflowStatus` rather than `string`, `Generated<Date>` rather than `Date`. A test materializes the declaration and asserts the two agree on every table and column, which is the drift protection generating it would have bought. It found one on its first run: `ai_run.pending_approvals` was in the DDL and in `KyselyAIRunStateService`, but not in `AIRunTable` — the reason that service read it back through `as any`. Declared, and the casts are gone.

## 0.13.3

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

## 0.13.2

### Patch Changes

- 4324652: Scope AI agent thread reads to the calling session.

  The generated thread-management functions (`getAgentThreads`,
  `getAgentThreadMessages`, `getAgentThreadRuns`, `deleteAgentThread`) keyed purely
  off a caller-supplied `threadId` and treated `resourceId` as an optional filter,
  so omitting it enumerated every tenant's threads.
  - `listThreads` gains an `owners` **authorization constraint** (distinct from the
    `resourceId` filter): an empty array matches nothing, and it is always derived
    from the session, never from input. Implemented across the Kysely, Redis and
    MongoDB agent run services, with LIKE/regex metacharacter escaping so an owner
    id containing `_` or `%` cannot match a foreign owner.
  - The three `threadId`-keyed functions are now guarded by an `isThreadOwner`
    `pikkuPermission` rather than an in-body check. A thread that does not exist is
    denied rather than 404'd, so it is indistinguishable from one owned by someone
    else.
  - New `@pikku/core/ai-agent` helpers: `canAccessThread`, `threadOwnerConstraint`,
    `sessionPrincipals`, `isOwnedByPrincipal`.

  Services destructured by a wired function are now non-optional inside it.

  The inspector already aggregated the services used by every wired `func`,
  `permissions` and `middleware` into `RequiredSingletonServices`, but the
  generated function types defaulted their service parameter to the raw `Services`
  — so a service declared `foo?: Foo` still arrived as possibly-undefined, forcing
  `if (!foo) throw new MissingServiceError(...)` guards that could never fire.
  Generated types now expose `WiredSingletonServices` / `WiredServices`
  (`RequiredSingletonServices & Services`) and default the `RequiredServices`
  generic of functions, permissions, middleware, auth and approval-description
  helpers to them. Optionality now means only what it should: "this service may
  not be created, because nothing uses it".

- Updated dependencies [5f19016]
- Updated dependencies [78e4778]
- Updated dependencies [4324652]
- Updated dependencies [de044f8]
- Updated dependencies [cd1a811]
- Updated dependencies [19fa6f0]
- Updated dependencies [b501612]
- Updated dependencies [eb37b1e]
  - @pikku/core@0.12.66

## 0.13.1

### Patch Changes

- 13474a6: feat(scopes): grant scopes directly to a user, not only through roles

  A scope can now be granted to a user directly, outside of any role.
  `resolveScopes` returns the union of a user's role-derived scopes and their
  direct grants, so a one-off capability no longer requires inventing a role.
  - `@pikku/core`: `ScopeService` gains `addScopeToUser` / `removeScopeFromUser` /
    `listUserScopes`.
  - `@pikku/kysely`: a new `pikku_user_scope` table (FK into `pikku_scopes`, so the
    database still refuses an undeclared grant; `ON DELETE CASCADE` from `user`,
    so deleting a user takes their direct grants with it). `resolveScopes` unions
    it with the role join.
  - `@pikku/addon-console`: `scopeAddScopeToUser` / `scopeRemoveScopeFromUser`
    (gated by `pikku:scopes:manage`), and `scopeListUserRoles` now also returns
    `directScopes`.
  - `@pikku/console`: a **Direct scopes** section in the user roles drawer to grant
    and revoke scopes directly, showing them distinctly from the resolved union.

  Also: the Scopes page now distinguishes a permission error (a console admin
  without `pikku:scopes:read`) from an actual scope-service outage, instead of
  showing "the scope service may be unavailable" for both.

- 13474a6: feat: KyselyScopeService — resolve and administer user scopes

  Adds `KyselyScopeService`, backing the core `ScopeService` interface with four
  self-created tables: `pikku_scopes`, `pikku_roles`, `pikku_role_scopes` and
  `pikku_user_role`.

  Scopes are declared in code and synced additively — a scope that is no longer
  declared is marked, never deleted, so a rename or a rolling deploy cannot
  silently revoke a grant. `pikku scopes prune` is the deliberate removal path.
  Roles are data, composed by admins at runtime, and `pikku_role_scopes` has a
  foreign key into `pikku_scopes`, so the database itself refuses to grant a
  scope that was never declared.

- 13474a6: feat: ScopeService.listScopes

  Exposes the scope vocabulary held in the store — everything a role can be
  composed from — flagging any scope that is still present but no longer declared
  in code (inert, and awaiting `pikku scopes prune`).

- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.13.0

### Minor Changes

- 241e6cf: Add `KyselyAuditService` — a durable `AuditService` that persists AuditEvents to an `audit` table via Kysely (the companion sink to `createAuditedKysely`). Its column mapping matches Fabric's platform audit-queue consumer, so a locally-run project and a deployed stage produce identical rows. Use it as the local/dev audit sink so audit events persist and are queryable without the platform queue.

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.18

### Patch Changes

- 5c0ff0f: Fix `getRunHistory` dropping step provenance (`fromStepName`). The value was persisted on the step row and used by the graph planner, but `getRunHistory` built its rows from the per-attempt history and never carried `fromStepName` through — so run history (and any timeline reconstructed from it) reported no predecessors. Redis and Kysely `getRunHistory` now return `fromStepName`. Also adds the missing `from_step_name` column (+ backfill) to the Kysely workflow mirror's `workflow_step` schema and persists it on mirror inserts, so a mirror-side history has identical provenance.
- 72694f6: feat(workflow): expose per-step attempt count + record running/succeeded/failed timestamps

  `getRunStatus` now returns `attempts` (the latest attempt count) per step, so
  consumers can show retry counts without a second history query. It already
  computed `duration` from `runningAt`/`succeededAt`, but the kysely and mongodb
  workflow stores only stamped those timestamps on the _insert_ path — the
  `running` / `succeeded` / `failed` status transitions updated the history row's
  status without setting `runningAt` / `succeededAt` / `failedAt`, so `duration`
  was always undefined. The transitions now stamp the matching timestamp, so step
  duration is populated for kysely- and mongodb-backed runs. (Redis already
  stamped on transition.) A shared service-suite test guards both behaviours.

- Updated dependencies [4be205f]
- Updated dependencies [061c717]
- Updated dependencies [2c55e13]
- Updated dependencies [c745c26]
- Updated dependencies [57900b5]
- Updated dependencies [72694f6]
  - @pikku/core@0.12.39

## 0.12.17

### Patch Changes

- 92cd5b1: feat(workflow): workflow-owned step retries + stable invocationId

  The workflow — not the queue — now owns step retry policy, and each step
  invocation gets a stable idempotency key.
  - **Default `retries: 5` with exponential backoff.** A step with no `retries`
    previously inherited the queue's bare default (e.g. pg-boss `retry_limit 2`,
    no backoff) so retries fired instantly and couldn't outlast a transient
    outage. Retries now default to 5 with backoff, resolved at the workflow layer.
  - **`retries: 0` is honored.** Dispatch previously passed `undefined` options
    for `retries: 0`, letting the queue re-run a non-idempotent step up to its own
    default. The resolved policy now always sets `attempts` (`retries: 0` →
    `attempts: 1`), so the queue never second-guesses the workflow. The persisted
    step retries and the dispatched `attempts` are resolved together so
    "retries exhausted" and "no more redeliveries" are the same event.
  - **`workflowStep.invocationId`** — a deterministic, dependency-free
    `uuidv5(runId:stepName)` handed to every step. Unlike `stepId` (minted per
    attempt), it is identical across retries, so a step can dedupe on it
    (`ON CONFLICT (invocationId)`, Stripe idempotency keys, etc.).
  - **queue-bullmq**: `mapPikkuJobToBull` now maps `backoff` (previously dropped,
    so a step's backoff silently never applied on Redis), and `registerQueues`
    throws a clear error when no logger is available (matching queue-pg-boss).
  - **Dispatch failures are recoverable, not fatal.** A step is now marked
    `scheduled` only _after_ it is successfully handed to its transport (queue or
    scheduler) — a failed hand-off leaves it `pending` so a replay re-dispatches
    it, instead of stranding it in `scheduled` (replay would pause forever on a
    job that was never enqueued). A transport outage (e.g. pg-boss momentarily
    down) is surfaced as a new `WorkflowDispatchException`, which the orchestrator
    treats as transient: the run is left running and the orchestrator job is
    rethrown for redelivery (it replays idempotently from the snapshot) rather
    than the whole run being marked `failed`. The orchestrator job now also
    carries its own retry policy, so this holds even when the orchestrator queue
    is configured `retry_limit 0`. A genuine step error still fails the run.
  - **Same step name can be invoked multiple times in one run.** Step rows are now
    keyed per _invocation_: the Nth reach of a step name in a replay resolves to a
    physical key (`name` for the first, `name#N` for repeats), so a literal
    duplicate name no longer clobbers the earlier step's state. The first reach
    keeps the bare name, so existing rows, graph-node matching and `invocationId`s
    are unchanged. Ordinals are derived deterministically from DSL execution order
    and reset each replay.
  - **Step provenance (`fromStepName`) + graph cycles.** Every step now records
    the predecessor it was scheduled from (`fromStepName`; entry steps have none),
    persisted on the step row across all stores (in-memory, kysely, redis,
    mongodb, cloudflare DO) and carried in the queued payload. The DSL wire
    exposes the derived `fromInvocationId` (`uuidv5(runId:fromStepName)`) so
    consumers get the stable predecessor key without a second persisted id —
    `fromStepName` is the source of truth (it is replay-deterministic; `stepId`,
    minted per row, is not). This makes the walked path reconstructable even when
    a node is reached more than once: in `a → b → a → c` the second `a` is a
    distinct ordinal instance (`a#1`) whose `fromStepName` is `b`.
    The graph runner now supports **cycles**: a forward edge into an
    already-started node still collapses to a single run (joins/diamonds are
    unchanged), but a _back-edge_ — one whose target can reach its source — fires
    a fresh ordinal instance, so a node can loop back to itself. Termination is
    the graph's responsibility (branch routing must converge); the engine enforces
    no visit cap.

- Updated dependencies [92cd5b1]
  - @pikku/core@0.12.38

## 0.12.16

### Patch Changes

- 6565b97: Fix `KyselyWorkflowRunService.getRunSteps`: build the `runningAt` /
  `succeededAt` / `failedAt` correlated subqueries through the query builder
  instead of raw `sql` fragments, so the active schema (`withSchema(...)`)
  qualifies `workflow_step_history`. The raw fragments hardcoded an unqualified
  table name and failed with `relation "workflow_step_history" does not exist`
  against a connection whose `search_path` did not include the schema.
- 34f254e: Bump the `kysely` dependency range to `^0.29.0` so it dedupes onto a single
  copy alongside Better Auth (which bundles kysely 0.29.x), avoiding two
  incompatible `Kysely` classes (the `#private` brand mismatch) when both pikku's
  adapters and Better Auth share a database connection.

  kysely 0.29 is ESM-only, which the unmaintained `kysely-plugin-serialize`
  (no `exports` map, CommonJS build) cannot import. Its `SerializePlugin` is now
  maintained directly in `@pikku/kysely` and re-exported, and the external
  dependency is dropped from `@pikku/kysely`, `@pikku/kysely-sqlite`, and
  `@pikku/cloudflare`.

## 0.12.15

### Patch Changes

- ea48df2: Include runningAt, succeededAt, and failedAt timestamps in getRunSteps results
- Updated dependencies [2cf67be]
  - @pikku/core@0.12.28

## 0.12.14

### Patch Changes

- 4b5c75b: feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry
  - Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
  - Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
  - `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
  - Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.13

### Patch Changes

- 909eb25: Add audit logging support for function invocations and database queries.

  Introduces `AuditService` and `createAuditedKysely` — configurable audit capture with best-effort and transactional durability modes. Audit logs capture session metadata (user, org), RPC call details, and Kysely query operations (type, tables, changes). Audit context is scoped per-invocation so nested RPC calls are correctly attributed.

- Updated dependencies [909eb25]
  - @pikku/core@0.12.26

## 0.12.12

### Patch Changes

- 55ba75a: Update the OSS runtime dependency set for newer Node support by bumping `uWebSockets.js` to `v20.68.0` and `better-sqlite3` to `v12.10.0`.
- Updated dependencies [c02275f]
- Updated dependencies [0bd0433]
  - @pikku/core@0.12.24

## 0.12.11

### Patch Changes

- b9ed73e: Add deterministic workflow planned-step metadata support and SSE init stream payload generation.
  - Persist `deterministic` and `plannedSteps` on workflow runs in core and service adapters.
  - Expose planned-step metadata on workflow run status responses.
  - Emit an initial `type: 'init'` SSE event for deterministic workflow streams before incremental updates.
  - Add CLI tests covering serialized stream route output for init/update/done event behavior.

- Updated dependencies [b9ed73e]
  - @pikku/core@0.12.19

## 0.12.0

## 0.12.10

### Patch Changes

- 311c0c4: Unify session persistence through SessionStore, remove session blob from ChannelStore
  - PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
  - ChannelStore no longer stores session data — maps channelId to pikkuUserId only
  - ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
  - Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

- Updated dependencies [311c0c4]
  - @pikku/core@0.12.18

## 0.12.9

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

## 0.12.8

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

## 0.12.7

### Patch Changes

- c485aab: Fix CamelCasePlugin mismatch: convert all table types, query references, and result property accesses from snake_case to camelCase to match Kysely CamelCasePlugin runtime behavior

## 0.12.6

### Patch Changes

- 0f59432: Add per-user credential system with CredentialService, OAuth2 route handlers, and KyselyCredentialService with envelope encryption
- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/core@0.12.10

## 0.12.5

### Patch Changes

- 87433f0: Remove secret key names from error messages to prevent information disclosure.
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

## 0.12.4

### Patch Changes

- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.3

### Patch Changes

- 32ed003: Add envelope encryption utilities and database-backed secret services with KEK rotation support
- 387b2ee: Add error_message column to agent run storage and queries
- b2b0af9: Migrate all consumers from @pikku/pg to @pikku/kysely and remove the @pikku/pg package
- c7ff141: Add WorkflowVersionStatus type with draft→active lifecycle for AI-generated workflows, type all DB status fields with proper unions instead of plain strings
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- ce961b5: fix: improve MySQL compatibility in AI storage service by using varchar columns with explicit lengths instead of text for primary keys, foreign keys, and indexed columns, and handle duplicate index errors gracefully
- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- e04531f: Code quality improvements: resolve oxlint warnings and apply autofixes across the codebase (unused bindings, unnecessary constructors, prefer `const` over `let`, etc.). No behaviour changes.
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

- Updated dependencies

## 0.11.0

### Minor Changes

- Remove Kysely-based channel and eventhub stores (use @pikku/pg instead)
- Update to support shared connection instances

# @pikku/kysely

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.5-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.4

### Patch Changes

- 58fe540: fix: kysely pure script should also clean arrays
- Updated dependencies [85a1c76]
  - @pikku/core@0.9.7

## 0.9.3

### Patch Changes

- 917bd6b: feat: fixing number issue with pure generation
- af95a59: fix: adding a number type (string or number) to db for now. Going forward should probably parse to a number but js and floats..
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
  - @pikku/core@0.9.3

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

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updated to match the 0.8 version

## 0.7.0

- Updating to match remaining packages

## 0.6.5

### Patch Changes

- 9541f42: fix: deleting ssl invalidation

## 0.6.4

### Patch Changes

- 8a14f3a: refactor: removing user session from channel object
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.3

### Patch Changes

- 2c9a6b0: fix: correct reference to pikku-kysely-pure

## 0.6.2

### Patch Changes

- 990c2c2: fix: not requiring kysely as a peerDependency

## 0.6.1

### Patch Changes

- 8fcaa7e: feat: adding kysely wrapper
- Updated dependencies [eb8a8b4]
  - @pikku/core@0.6.13

## 0.6.1

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.3

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.2

### Patch Changes

- 0f96787: refactor: dropping cjs support
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.1

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24
