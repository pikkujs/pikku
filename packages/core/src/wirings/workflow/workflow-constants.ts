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

/**
 * True for a run that will never move again, whatever arrives for it.
 *
 * Worth checking before doing anything with an orchestrator message, because
 * such a message is routine rather than exceptional: the queue is
 * at-least-once, the relay re-dispatches on purpose, and a run can settle
 * while a message for it is still in flight. Replaying one is not free —
 * `runWorkflowJob` takes the run lock and re-enters the workflow body, and a
 * body re-entered after its run failed can park on a wait that nothing will
 * ever satisfy, holding the lock and the connection under it until something
 * external gives up. Every leaked advisory lock seen in production traced back
 * to that: a granted lock, an idle session, and a run already `failed`.
 *
 * Note `suspended` is deliberately absent. It ends a run's *current* pass but
 * not the run, which resumes when its approval or signal arrives.
 */
export const isRunSettled = (status: string): boolean =>
  WORKFLOW_TERMINAL_STATES.has(status)

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
