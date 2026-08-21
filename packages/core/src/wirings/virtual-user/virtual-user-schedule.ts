import type { VirtualUserRunStore } from './virtual-user-run-store.js'
import type {
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from './virtual-user-schedule-store.js'

/**
 * How long a run may sit at `running` before it is read as dead rather than
 * busy.
 *
 * A run holds no process across a restart — see {@link VirtualUserRunRecord} —
 * so a deploy mid-run strands the record, and a stranded record would block its
 * persona's schedule for good. Twice the longest duration budget anyone sets in
 * practice, because the failure this guards against is cheap to recover from
 * and expensive to trigger early: reaping a run that was still working loses
 * its findings.
 */
export const STALE_RUN_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * The cadence a schedule gets when it is written without one: roughly a run a
 * day, at an hour nobody can predict.
 *
 * Sparse on purpose. Every tick spends model budget with no caller present to
 * notice, so the default is the one an app can leave switched on and forget,
 * not the one that finds the most.
 */
export const DEFAULT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000
export const DEFAULT_MAX_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Whether a row is the tick's business, for stores that cannot ask in a query. */
export const isDue = (schedule: VirtualUserScheduleRecord, now: Date) =>
  schedule.enabled && schedule.nextRunAt.getTime() <= now.getTime()

/**
 * When this persona should next appear, drawn from its own interval.
 *
 * Uniform between the two bounds. Reversed bounds are read as a range rather
 * than rejected, because a schedule is configuration and a swapped pair is a
 * typo, not an attack.
 */
export const nextRunAt = (
  schedule: Pick<VirtualUserScheduleRecord, 'minIntervalMs' | 'maxIntervalMs'>,
  now: Date,
  random: () => number
) => {
  const low = Math.max(
    0,
    Math.min(schedule.minIntervalMs, schedule.maxIntervalMs)
  )
  const high = Math.max(
    0,
    Math.max(schedule.minIntervalMs, schedule.maxIntervalMs)
  )
  return new Date(now.getTime() + low + random() * (high - low))
}

export type VirtualUserSkipReason = 'in-flight' | 'dispatch-failed'

export interface VirtualUserTickResult {
  dispatched: { persona: string; runId: string }[]
  skipped: { persona: string; reason: VirtualUserSkipReason }[]
  /** Runs found stranded at `running` and marked failed. */
  reaped: string[]
}

export interface VirtualUserTickParams {
  schedules: VirtualUserScheduleStore
  runs: VirtualUserRunStore
  /** Starts one run and answers with its id. Nothing here knows how. */
  dispatch: (schedule: VirtualUserScheduleRecord) => Promise<string>
  now?: Date
  random?: () => number
  staleAfterMs?: number
}

/**
 * Acts on whichever personas are due, once.
 *
 * The whole cadence lives in this one call, so what schedules it is the host's
 * choice — a cron wiring, a platform scheduler, or a person clicking a button.
 * Pikku does not start a timer on an app's behalf; a scaffold that did would
 * begin spending model budget the moment a project ran `pikku all`.
 *
 * A persona is skipped, not queued, while its previous run is still going. Two
 * copies of the same user acting at once is not a heavier test, it is a
 * different one, and every finding it produces is unreproducible.
 */
export const tickVirtualUserSchedules = async ({
  schedules,
  runs,
  dispatch,
  now = new Date(),
  random = Math.random,
  staleAfterMs = STALE_RUN_AFTER_MS,
}: VirtualUserTickParams): Promise<VirtualUserTickResult> => {
  const result: VirtualUserTickResult = {
    dispatched: [],
    skipped: [],
    reaped: [],
  }

  for (const schedule of await schedules.due(now)) {
    const [latest] = await runs.list({ persona: schedule.persona, limit: 1 })
    if (latest?.status === 'running') {
      if (now.getTime() - latest.createdAt.getTime() < staleAfterMs) {
        result.skipped.push({ persona: schedule.persona, reason: 'in-flight' })
        continue
      }
      await runs.fail(
        latest.runId,
        `Abandoned: still running ${Math.round((now.getTime() - latest.createdAt.getTime()) / 60000)}m after it started, which is longer than any budget allows.`
      )
      result.reaped.push(latest.runId)
    }

    const due = nextRunAt(schedule, now, random)
    await schedules.claim(schedule.persona, {
      nextRunAt: due,
      runId: null,
      at: now,
    })

    let runId: string
    try {
      runId = await dispatch(schedule)
    } catch {
      result.skipped.push({
        persona: schedule.persona,
        reason: 'dispatch-failed',
      })
      continue
    }

    await schedules.claim(schedule.persona, { nextRunAt: due, runId, at: now })
    result.dispatched.push({ persona: schedule.persona, runId })
  }

  return result
}
