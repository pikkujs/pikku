export const DEFAULT_STEP_RETRIES = 5

/** Statuses from which a run never advances again on its own. */
export const WORKFLOW_END_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
  'suspended',
])

/** Statuses a run cannot leave at all. */
export const WORKFLOW_TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
])

export const WORKFLOW_POLL_MIN_MS = 10

export const WORKFLOW_POLL_FACTOR = 1.6

export const WORKFLOW_CHILD_POLL_MAX_MS = 500

/** Idle window before a `running` run with nothing in flight is treated as stalled. */
export const DEFAULT_STALLED_RUN_MS = 5 * 60_000

/** Runs re-driven per `recoverStalledRuns` call, so one sweep is bounded. */
export const DEFAULT_STALLED_RUN_LIMIT = 100

/**
 * How long a step may sit `pending` before the relay assumes its dispatch was
 * lost. This is a bet that no healthy queue takes this long to move a job from
 * `pending` to `running`; set it above the observed p99 of that latency.
 */
export const DEFAULT_UNDISPATCHED_STEP_MS = 30_000

/** Steps re-driven per `relayUndispatchedSteps` call, so one tick is bounded. */
export const DEFAULT_UNDISPATCHED_STEP_LIMIT = 100

/** First wait before a step already re-dispatched once is re-dispatched again. */
export const REDISPATCH_BACKOFF_MS = 30_000

/** Ceiling on the doubling backoff, so a permanently stuck step still gets swept. */
export const REDISPATCH_BACKOFF_MAX_MS = 10 * 60_000

/** Bound on the in-process backoff map, so a long-lived process cannot grow it without bound. */
export const REDISPATCH_BACKOFF_MAX_ENTRIES = 10_000
