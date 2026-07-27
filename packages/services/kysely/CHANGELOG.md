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
