---
'@pikku/core': patch
'@pikku/queue-pg-boss': patch
'@pikku/queue-bullmq': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
'@pikku/cloudflare': patch
---

feat(workflow): workflow-owned step retries + stable invocationId

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
  `scheduled` only *after* it is successfully handed to its transport (queue or
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
  keyed per *invocation*: the Nth reach of a step name in a replay resolves to a
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
  unchanged), but a *back-edge* — one whose target can reach its source — fires
  a fresh ordinal instance, so a node can loop back to itself. Termination is
  the graph's responsibility (branch routing must converge); the engine enforces
  no visit cap.
