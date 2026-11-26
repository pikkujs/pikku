import { holdLease, LeaseTakenError } from '../../services/lease-service.js'
import type { LeaseService } from '../../services/lease-service.js'
import type { Logger } from '../../services/logger.js'
import { getSingletonServices } from '../../pikku-state.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import {
  DEFAULT_RECOVERY_INTERVAL_MS,
  DEFAULT_RECOVERY_STALLED_MS,
  DEFAULT_STALLED_RUN_LIMIT,
  DEFAULT_STALLED_RUN_MS,
  DEFAULT_UNDISPATCHED_STEP_LIMIT,
  DEFAULT_UNDISPATCHED_STEP_MS,
  REDISPATCH_BACKOFF_MAX_ENTRIES,
  REDISPATCH_BACKOFF_MAX_MS,
  REDISPATCH_BACKOFF_MS,
  SCHEDULED_STEP_PAGE_SIZE,
  SLEEP_WAKE_GRACE_MS,
} from './workflow-constants.js'
import { isRunLeaseError } from './workflow-run-lease.js'
import type {
  StepState,
  WorkflowRecoveryOptions,
  WorkflowStepOptions,
} from './workflow.types.js'

/**
 * Per-process, advisory record of when a run may next be re-dispatched.
 *
 * Keyed by run rather than by step because the run is the unit of re-drive:
 * `resumeWorkflow` replays the whole run and re-dispatches every step still
 * owed a job, so holding off a single step while resuming its run would
 * suppress nothing.
 *
 * For the same reason one instance is shared by every sweep rather than kept
 * per sweep. The record is of the action, not of the signal that prompted it:
 * a stalled run and an undispatched step are different observations, but both
 * are answered by the one orchestrator message, so a run the relay re-drove a
 * moment ago gains nothing from the stalled sweep re-driving it again. Sharing
 * is what makes the guarantee a message-per-run-per-window instead of one per
 * sweep, and no recovery is lost by it: whichever sweep gets there first
 * performs the identical re-drive, and the cap keeps the delay at 10m.
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

  /** Drop a record, for a re-drive that turned out not to happen. */
  public forget(runId: string): void {
    this.eligibleAt.delete(runId)
    this.delays.delete(runId)
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
  /** Resolves `false` when the run was left alone rather than re-driven. */
  resume: (runId: string) => Promise<boolean | void>
  logger?: Logger
}

const resumeEach = async (
  runIds: Iterable<string>,
  backoff: RedispatchBackoff,
  { resume, logger }: SweepDeps,
  failure: (runId: string, detail: string) => string
): Promise<string[]> => {
  const succeeded: string[] = []
  for (const runId of runIds) {
    try {
      if ((await resume(runId)) === false) {
        // Nothing was re-driven, so nothing has earned a wait: a run owned by
        // a live instance now may have lost that instance by the next tick.
        backoff.forget(runId)
        continue
      }
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
 * idempotence is what makes an idle-time heuristic safe here. A run parked on a
 * `scheduled` step is not this sweep's: `sweepScheduledSteps` owns those, since
 * replay cannot move them.
 *
 * Idempotent is not free, though: a run stays stalled until something clears
 * the reason it stalled, so an unconditional sweep re-queues the same runs on
 * every tick forever. That is how a handful of wedged runs became a queue of
 * thousands that could not drain — each pass added work the previous pass had
 * not finished. The same per-run backoff the relay uses bounds it: a run is
 * re-driven, then held off for a doubling delay, so a sweep costs at most one
 * message per run per window rather than one per run per tick.
 */
export const sweepStalledRuns = async (
  findStalledRunIds: (before: Date, limit: number) => Promise<string[]>,
  backoff: RedispatchBackoff,
  options: { stalledAfterMs?: number; limit?: number } | undefined,
  deps: SweepDeps
): Promise<{ resumed: string[] }> => {
  const before = new Date(
    Date.now() - (options?.stalledAfterMs ?? DEFAULT_STALLED_RUN_MS)
  )
  const found = await findStalledRunIds(
    before,
    options?.limit ?? DEFAULT_STALLED_RUN_LIMIT
  )

  const now = Date.now()
  const runIds: string[] = []
  for (const runId of found) {
    if (!backoff.isEligible(runId, now)) continue
    // Noted before the resume, not after: a run whose resume throws is exactly
    // the run most likely to still be here next tick, and re-driving it every
    // tick is the amplification this backoff exists to stop.
    backoff.note(runId, now)
    runIds.push(runId)
  }

  return {
    resumed: await resumeEach(
      runIds,
      backoff,
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
 *
 * A store opts in by overriding `findUndispatchedSteps`, and needs an atomic
 * `claimStepForExecution` first: the relay makes duplicate dispatch routine, and
 * the claim is what keeps a duplicate from becoming a second execution. Every
 * `@pikku/kysely` dialect qualifies on its status-guarded claim, `mongodb` on
 * the same claim as a single-document update, `in-memory` on being inline and
 * single-process.
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
      backoff,
      deps,
      (runId, detail) =>
        `Failed to re-dispatch workflow run ${runId}: ${detail}`
    ),
  }
}

/** A step parked on `scheduled`, waiting for a timer or a queue job. */
export type ScheduledStep = {
  runId: string
  stepId: string
  stepName: string
  /** `null` is a `workflow.sleep`; anything else is a dispatched step. */
  rpcName: string | null
  data: unknown
  fromStepName?: string
  retries?: number
  retryDelay?: string | number
  /** When the step went `scheduled`, on the writer's clock. */
  scheduledAt: Date
}

type ScheduledStepDeps = {
  /** Set the sleep's result and re-drive its run; `false` if it was left alone. */
  wake: (step: ScheduledStep) => Promise<boolean>
  /** Arm a fresh wake-up `remainingMs` from now. */
  rearm: (step: ScheduledStep, remainingMs: number) => Promise<void>
  /** Send a dispatched step to the step queue again. */
  redispatch: (step: ScheduledStep) => Promise<void>
  logger?: Logger
}

/**
 * Recover steps parked on `scheduled` whose timer or queue job may have died
 * with the process that armed them.
 *
 * Replay cannot do this: it reads `scheduled` as "something is coming" and
 * stops, which is right for every pass except the one after the something was
 * lost. Sleeps are judged by the clock. A sleep past its wake time is woken, and
 * `rearm` (set at startup, when this process has armed nothing) gives one that
 * is not yet due a timer for what remains of it, so a restart neither loses a
 * wake-up nor restarts the wait. Past startup a sleep is left alone until it is
 * `wakeGraceMs` overdue, since only then is its timer known to be lost.
 *
 * Both are safe to repeat across instances. Every instance that starts arms its
 * own timer for a sleep it cannot tell is someone else's, but a wake-up only
 * sets a sleep's result, which is the same `null` however many times it lands,
 * and resuming is idempotent. Dispatched steps are safe on the same terms as
 * the relay: age is the only signal, a redundant message costs one queue job,
 * and the claim is what keeps it from being a second execution.
 */
export const sweepScheduledSteps = async (
  findScheduledSteps: (
    limit: number,
    offset: number
  ) => Promise<ScheduledStep[]>,
  backoff: RedispatchBackoff,
  options: {
    rearm?: boolean
    wakeGraceMs?: number
    undispatchedAfterMs?: number
  },
  deps: ScheduledStepDeps
): Promise<{ woken: string[]; rearmed: string[]; redispatched: string[] }> => {
  const outcome = {
    woken: [] as string[],
    rearmed: [] as string[],
    redispatched: [] as string[],
  }
  const grace = options.wakeGraceMs ?? SLEEP_WAKE_GRACE_MS
  const lostBefore =
    Date.now() - (options.undispatchedAfterMs ?? DEFAULT_UNDISPATCHED_STEP_MS)

  const recover = async (step: ScheduledStep) => {
    const now = Date.now()
    if (step.rpcName !== null) {
      if (step.scheduledAt.getTime() >= lostBefore) return
      if (!backoff.isEligible(step.stepId, now)) return
      backoff.note(step.stepId, now)
      await deps.redispatch(step)
      outcome.redispatched.push(step.runId)
      return
    }
    const duration = (step.data as { duration?: number | string } | null)
      ?.duration
    if (duration === undefined) return
    const remaining =
      step.scheduledAt.getTime() + getDurationInMilliseconds(duration) - now
    if (options.rearm && remaining > 0) {
      await deps.rearm(step, remaining)
      outcome.rearmed.push(step.runId)
    } else if (remaining <= (options.rearm ? 0 : -grace)) {
      if (await deps.wake(step)) outcome.woken.push(step.runId)
    }
  }

  for (let offset = 0; ; offset += SCHEDULED_STEP_PAGE_SIZE) {
    const page = await findScheduledSteps(SCHEDULED_STEP_PAGE_SIZE, offset)
    for (const step of page) {
      try {
        await recover(step)
      } catch (err) {
        // One unrecoverable step must not stop the sweep from reaching the rest.
        deps.logger?.error(
          `Failed to recover scheduled step ${step.stepName} of workflow run ${step.runId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }
    if (page.length < SCHEDULED_STEP_PAGE_SIZE) return outcome
  }
}

/** A store may hand a numeric duration back as the string it wrote. */
const storedDurationMs = (duration: string | number): number =>
  /^\d+$/.test(String(duration))
    ? Number(duration)
    : getDurationInMilliseconds(duration)

/** A retry sitting out its `retryDelay` is idle on purpose, not stalled. */
const isWaitingOutRetryDelay = (steps: StepState[] | null): boolean => {
  const now = Date.now()
  return (steps ?? []).some(
    ({ status, attemptCount, retryDelay, updatedAt }) =>
      status === 'pending' &&
      attemptCount > 1 &&
      retryDelay != null &&
      updatedAt.getTime() + storedDurationMs(retryDelay) > now
  )
}

export type StalledSweepOptions = { stalledAfterMs?: number; limit?: number }

export type UndispatchedSweepOptions = {
  undispatchedAfterMs?: number
  limit?: number
}

/** `startup` is a process that has armed nothing yet. */
export type WorkflowRecoveryPass = WorkflowRecoveryOptions & {
  startup?: boolean
}

/** What recovery needs from the workflow service. */
export type WorkflowRecoveryHost = {
  leases: () => LeaseService | undefined
  listStepStates: (runId: string) => Promise<StepState[] | null>
  withRunLease: (runId: string, fn: () => Promise<void>) => Promise<void>
  findStalledRunIds: (before: Date, limit: number) => Promise<string[]>
  findUndispatchedSteps: (
    before: Date,
    limit: number
  ) => Promise<Array<{ runId: string; stepId: string }>>
  findScheduledSteps: (
    limit: number,
    offset: number
  ) => Promise<ScheduledStep[]>
  resumeWorkflow: (runId: string) => Promise<void>
  wakeSleep: (runId: string, stepId: string) => Promise<void>
  rearmSleep: (
    runId: string,
    stepId: string,
    remainingMs: number
  ) => Promise<unknown>
  queueStepWorker: (
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: WorkflowStepOptions,
    fromStepName?: string
  ) => Promise<void>
}

/** Every way a workflow service brings back work a dead process left behind. */
export class WorkflowRecovery {
  private readonly backoff = new RedispatchBackoff()
  private timer: ReturnType<typeof setInterval> | undefined
  private sweeping = false

  constructor(private readonly host: WorkflowRecoveryHost) {}

  private get logger() {
    return getSingletonServices()?.logger
  }

  /**
   * Do `drive` to a run unless something else owns it, reporting whether it
   * did. The run's lease is the ownership: a pass running anywhere holds it, and
   * it outlives a crashed holder by its TTL, so a sweep on one instance cannot
   * take a run from another and a dead instance's runs come free on their own.
   */
  private async driveUnlessOwned(
    runId: string,
    drive: () => Promise<void>
  ): Promise<boolean> {
    if (isWaitingOutRetryDelay(await this.host.listStepStates(runId))) {
      return false
    }
    try {
      await this.host.withRunLease(runId, drive)
      return true
    } catch (error) {
      if (isRunLeaseError(error)) return false
      throw error
    }
  }

  private get sweepDeps() {
    return {
      resume: (runId: string) =>
        this.driveUnlessOwned(runId, () => this.host.resumeWorkflow(runId)),
      logger: this.logger,
    }
  }

  public recoverStalledRuns(
    options?: StalledSweepOptions
  ): Promise<{ resumed: string[] }> {
    return sweepStalledRuns(
      this.host.findStalledRunIds,
      this.backoff,
      options,
      this.sweepDeps
    )
  }

  public relayUndispatchedSteps(
    options?: UndispatchedSweepOptions
  ): Promise<{ redispatched: string[] }> {
    return sweepUndispatchedSteps(
      this.host.findUndispatchedSteps,
      this.backoff,
      options,
      this.sweepDeps
    )
  }

  /**
   * Bring back everything a dead process left behind, once: steps parked on
   * `scheduled`, runs with nothing in flight, and steps whose dispatch was
   * lost. `startup` is a process that has armed nothing yet, so its sleeps get
   * timers and nothing has to look idle first.
   *
   * One pass per lease, so a fleet does not sweep the same rows in step.
   */
  public async recover(options: WorkflowRecoveryPass = {}): Promise<void> {
    const { host } = this
    const { startup = false } = options
    const undispatchedAfterMs = startup
      ? 0
      : (options.undispatchedAfterMs ?? DEFAULT_UNDISPATCHED_STEP_MS)

    const pass = async () => {
      const scheduled = await sweepScheduledSteps(
        host.findScheduledSteps,
        this.backoff,
        { rearm: startup, undispatchedAfterMs },
        {
          wake: ({ runId, stepId }) =>
            this.driveUnlessOwned(runId, () => host.wakeSleep(runId, stepId)),
          rearm: async ({ runId, stepId }, remainingMs) => {
            await host.rearmSleep(runId, stepId, remainingMs)
          },
          redispatch: (step) =>
            host.queueStepWorker(
              step.runId,
              step.stepName,
              step.rpcName!,
              step.data,
              { retries: step.retries, retryDelay: step.retryDelay },
              step.fromStepName
            ),
          logger: this.logger,
        }
      )
      const { resumed } = await this.recoverStalledRuns({
        stalledAfterMs: startup
          ? 0
          : (options.stalledAfterMs ?? DEFAULT_RECOVERY_STALLED_MS),
      })
      const { redispatched } = await this.relayUndispatchedSteps({
        undispatchedAfterMs,
      })
      const { woken, rearmed } = scheduled
      if (
        woken.length +
          rearmed.length +
          scheduled.redispatched.length +
          resumed.length +
          redispatched.length >
        0
      ) {
        this.logger?.info(
          `Workflow recovery: ${woken.length} sleeps woken, ${rearmed.length} re-armed, ${scheduled.redispatched.length} steps re-dispatched, ${resumed.length} stalled runs and ${redispatched.length} undispatched runs resumed`
        )
      }
    }

    const leases = host.leases()
    if (!leases) return pass()
    try {
      await holdLease(leases, 'workflow-recovery', pass)
    } catch (error) {
      if (!(error instanceof LeaseTakenError)) throw error
    }
  }

  /** `false` is the `workflow.recovery` config saying not to. */
  public start(options?: WorkflowRecoveryOptions | false): void {
    if (options === false || this.timer) return
    this.timer = setInterval(
      () => void this.sweep(options, false),
      options?.intervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS
    )
    this.timer.unref?.()
    // Fire-and-forget: `sweep` logs every failure itself.
    void this.sweep(options, true)
  }

  public stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  private async sweep(
    options: WorkflowRecoveryOptions | undefined,
    startup: boolean
  ): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      await this.recover({ ...options, startup })
    } catch (error) {
      this.logger?.error(
        `Workflow recovery sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      this.sweeping = false
    }
  }
}
