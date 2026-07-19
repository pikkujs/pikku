## 0.12.15

### Patch Changes

- 30e62ee: Add `workflow.approval(reason, { schema, expiry })` — a return-valued, expiring human-in-the-loop gate that stays closed until a decision is recorded (via `workflowService.approveStep` or `POST /workflow/:workflowName/approve/:runId`), unlike the one-shot `workflow.suspend()`.
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
  - @pikku/kysely@0.13.1

## 0.12.14

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.13

### Patch Changes

- Re-release of the changes that were accidentally published as `1.0.0` (a
  changesets peer-dependency auto-major triggered by `@pikku/kysely@0.13.0`).
  `1.0.0` was unpublished; this is the same content on the `0.12.x` line.

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/core@0.12.44

## 0.12.12

### Patch Changes

- eb0bddb: fix(cloudflare): register the global singleton-services slot in setupServices

  The serverless worker entry (`createCloudflareHandler` → `WorkerEntrypoint.fetch`)
  builds singleton services via `setupServices()`, but that function only cached
  them in a module-local — it never called `setSingletonServices()`. The core
  runners reached by `runFetch`/`runQueueJob`/`runScheduled` (`fetchData` et al.)
  resolve services via the global `getSingletonServices()`, NOT the returned value,
  so every function-bearing worker threw `Error: Singleton services not initialized`
  on the first request — surfacing as a bare Cloudflare 1101 (HTTP 500) on every
  `/api/*` route. `setupServices` now registers the global slot after creating the
  services, matching what the standalone/server-target generated entries already do.

## 0.12.11

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
  - @pikku/kysely@0.12.17

## 0.12.10

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

## 0.12.9

### Patch Changes

- 595e54a: fix(cloudflare): log channel connect faults instead of silently swallowing them
- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.8

### Patch Changes

- 9060165: Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.12.7

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

- Updated dependencies [18acebe]
- Updated dependencies [66d1b4f]
- Updated dependencies [3e35b99]
  - @pikku/core@0.12.20

## 0.12.0

## 0.12.6

### Patch Changes

- 311c0c4: Unify session persistence through SessionStore, remove session blob from ChannelStore
  - PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
  - ChannelStore no longer stores session data — maps channelId to pikkuUserId only
  - ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
  - Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

- Updated dependencies [311c0c4]
  - @pikku/core@0.12.18
  - @pikku/kysely@0.12.10

## 0.12.5

### Patch Changes

- f90daa4: Replace workspace:_ protocol with explicit npm version ranges in all package.json files. Fixes broken publishes where workspace:_ was included literally in the npm registry.

## 0.12.4

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
  - @pikku/kysely@0.12.9

## 0.12.3

### Patch Changes

- a2ee6d0: Reject WebSocket connections on auth failure instead of always returning 101. Failed connections now close with code 1008 and return HTTP 403.
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

## 0.12.2

### Patch Changes

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

### New Features

- `createWireServices` and `createConfig` are now optional

## 0.11.0

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Workflow support

# @pikku/cloudflare

## 0.10.1

### Patch Changes

- 730adb6: Update runtime adapters for channel middleware support

  **Updates:**
  - Update Cloudflare hibernation WebSocket server for middleware changes
  - Update Fastify response convertor for improved channel handling
  - Update MCP server for channel middleware support
  - Update Next.js runtime adapter for channel improvements

- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.2

### Patch Changes

- 906ab7e: feat: giving eventhub service a namespace to allow multiple ones
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

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.7

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.6

### Patch Changes

- a234e33: fix: regressions in channels due to user session changes

## 0.6.5

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- 8a14f3a: refactor: removing user session from channel object
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.4

### Patch Changes

- 1c7dfb6: fix: fixing some import issues
- Updated dependencies [1c7dfb6]
  - @pikku/core@0.6.15

## 0.6.3

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3
