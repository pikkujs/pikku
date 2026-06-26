---
'@pikku/core': patch
'@pikku/queue-pg-boss': patch
'@pikku/queue-bullmq': patch
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
