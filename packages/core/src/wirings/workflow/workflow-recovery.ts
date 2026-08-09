import type { Logger } from '../../services/logger.js'
import {
  DEFAULT_STALLED_RUN_LIMIT,
  DEFAULT_STALLED_RUN_MS,
  DEFAULT_UNDISPATCHED_STEP_LIMIT,
  DEFAULT_UNDISPATCHED_STEP_MS,
  REDISPATCH_BACKOFF_MAX_ENTRIES,
  REDISPATCH_BACKOFF_MAX_MS,
  REDISPATCH_BACKOFF_MS,
} from './workflow-constants.js'

/**
 * Per-process, advisory record of when a run may next be re-dispatched.
 *
 * Keyed by run rather than by step because the run is the unit of re-drive:
 * `resumeWorkflow` replays the whole run and re-dispatches every step still
 * owed a job, so holding off a single step while resuming its run would
 * suppress nothing.
 *
 * Losing this on restart costs extra dispatches, never correctness.
 */
export class RedispatchBackoff {
  private readonly eligibleAt = new Map<string, number>()
  private readonly delays = new Map<string, number>()

  public isEligible(runId: string, now: number): boolean {
    const at = this.eligibleAt.get(runId)
    return at === undefined || at <= now
  }

  public note(runId: string, now: number): void {
    const previous = this.delays.get(runId)
    const delay = Math.min(
      previous === undefined ? REDISPATCH_BACKOFF_MS : previous * 2,
      REDISPATCH_BACKOFF_MAX_MS
    )
    // A run that settles is never returned again, so entries are only evicted
    // by this bound — oldest first, which is also least recently re-dispatched.
    if (this.eligibleAt.size >= REDISPATCH_BACKOFF_MAX_ENTRIES) {
      const oldest = this.eligibleAt.keys().next()
      if (!oldest.done) {
        this.eligibleAt.delete(oldest.value)
        this.delays.delete(oldest.value)
      }
    }
    this.delays.set(runId, delay)
    this.eligibleAt.set(runId, now + delay)
  }
}

type SweepDeps = {
  resume: (runId: string) => Promise<void>
  logger?: Logger
}

const resumeEach = async (
  runIds: Iterable<string>,
  { resume, logger }: SweepDeps,
  failure: (runId: string, detail: string) => string
): Promise<string[]> => {
  const succeeded: string[] = []
  for (const runId of runIds) {
    try {
      await resume(runId)
      succeeded.push(runId)
    } catch (err) {
      // One unresumable run must not stop the sweep from recovering the rest.
      logger?.error(
        failure(runId, err instanceof Error ? err.message : String(err))
      )
    }
  }
  return succeeded
}

/**
 * Re-drive runs whose next move was lost, and report which were resumed.
 *
 * Arming a step is two writes to two systems — the step row, then the queue or
 * scheduler job — so a process that dies between them leaves a run that is
 * `running` with nothing in flight. Nothing notices: the run parks on a step
 * that will never complete and never error, so it neither finishes nor fails.
 * (Seen on a `workflow.sleep()`: a deploy restart landed between the sleep
 * step's insert and its timer, parking the run permanently.)
 *
 * Replay is the recovery — `resumeWorkflow` re-orchestrates from persisted step
 * state, and every settled step is memoized, so resuming a run that was not
 * actually stuck costs an orchestration pass and changes nothing. That
 * idempotence is what makes an idle-time heuristic safe here; a run that is
 * legitimately mid-sleep is excluded anyway, since its step is `scheduled`.
 */
export const sweepStalledRuns = async (
  findStalledRunIds: (before: Date, limit: number) => Promise<string[]>,
  options: { stalledAfterMs?: number; limit?: number } | undefined,
  deps: SweepDeps
): Promise<{ resumed: string[] }> => {
  const before = new Date(
    Date.now() - (options?.stalledAfterMs ?? DEFAULT_STALLED_RUN_MS)
  )
  const runIds = await findStalledRunIds(
    before,
    options?.limit ?? DEFAULT_STALLED_RUN_LIMIT
  )
  return {
    resumed: await resumeEach(
      runIds,
      deps,
      (runId, detail) =>
        `Failed to resume stalled workflow run ${runId}: ${detail}`
    ),
  }
}

/**
 * Re-drive steps whose dispatch was lost, and report which runs were nudged.
 *
 * The step row is the outbox record and this is the relay. Age is the only
 * signal available — a step `pending` because its dispatch was lost is
 * indistinguishable from one whose job is merely still queued — so a step past
 * `undispatchedAfterMs` is re-dispatched regardless, and correctness rests on
 * the claim in `executeWorkflowStepInner` rather than on the guess being right.
 * A redundant dispatch costs one queue message: the loser reads `running` and
 * returns without invoking anything.
 *
 * Re-dispatches back off per run (doubling from 30s, capped at 10m) so a
 * genuine queue backlog is not amplified by a tick that keeps firing at the
 * steps the backlog is already delaying.
 */
export const sweepUndispatchedSteps = async (
  findUndispatchedSteps: (
    before: Date,
    limit: number
  ) => Promise<Array<{ runId: string; stepId: string }>>,
  backoff: RedispatchBackoff,
  options: { undispatchedAfterMs?: number; limit?: number } | undefined,
  deps: SweepDeps
): Promise<{ redispatched: string[] }> => {
  const before = new Date(
    Date.now() - (options?.undispatchedAfterMs ?? DEFAULT_UNDISPATCHED_STEP_MS)
  )
  const steps = await findUndispatchedSteps(
    before,
    options?.limit ?? DEFAULT_UNDISPATCHED_STEP_LIMIT
  )

  const now = Date.now()
  const runIds = new Set<string>()
  for (const { runId } of steps) {
    if (!backoff.isEligible(runId, now)) continue
    backoff.note(runId, now)
    runIds.add(runId)
  }

  return {
    redispatched: await resumeEach(
      runIds,
      deps,
      (runId, detail) =>
        `Failed to re-dispatch workflow run ${runId}: ${detail}`
    ),
  }
}
