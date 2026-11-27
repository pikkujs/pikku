import {
  LeaseLostError,
  LeaseTakenError,
} from '../../services/lease-service.js'
import type { Logger } from '../../services/logger.js'
import { WORKFLOW_END_STATES } from './workflow-constants.js'
import { WorkflowStepSupersededError } from './workflow-errors.js'

const RUN_LEASE_PREFIX = 'workflow-run:'

export const runLeaseKey = (runId: string) => `${RUN_LEASE_PREFIX}${runId}`

/** Throws, once the pass holding the lease `lost` belongs to has lost it. */
export const throwIfLeaseLost = (lost: AbortSignal | undefined): void => {
  if (lost?.aborted) throw lost.reason
}

/**
 * An error that says the work is someone else's now: a run's lease was lost or
 * taken, or a step write was refused. Nothing may be recorded about it. A
 * function's own lease is not a run's, so its errors are ordinary failures.
 *
 * knowledge: decisions/internals/a-pass-that-lost-its-lease-writes-nothing.md
 */
export const isOwnershipError = (error: unknown): boolean =>
  error instanceof WorkflowStepSupersededError ||
  ((error instanceof LeaseLostError || error instanceof LeaseTakenError) &&
    error.key.startsWith(RUN_LEASE_PREFIX))

/** Throws, before anything is written about `error`, if the pass may not. */
export const throwIfNotOwned = (
  error: unknown,
  lost: AbortSignal | undefined
): void => {
  throwIfLeaseLost(lost)
  if (isOwnershipError(error)) throw error
}

/** How many times a lost run lease is taken again before the run is left. */
export const LOST_LEASE_PICKUPS = 3

const isLostLeaseOn = (error: unknown, runId: string): boolean =>
  error instanceof LeaseLostError && error.key === runLeaseKey(runId)

/** How a pass ends when it has gone as far as it can for now. */
const PASS_ENDINGS: ReadonlySet<string> = new Set([
  'WorkflowAsyncException',
  'WorkflowSuspendedException',
  'WorkflowCancelledException',
  'WorkflowDispatchException',
])

export type LostRunHost = {
  getRun(runId: string): Promise<{ status: string } | null>
  /** Ask for the run to be looked at again, where there is a queue to ask. */
  wake(runId: string): Promise<void>
  logger(): Logger | undefined
}

const hasEnded = async (host: LostRunHost, runId: string): Promise<boolean> => {
  const run = await host.getRun(runId).catch(() => null)
  return !!run && WORKFLOW_END_STATES.has(run.status)
}

/**
 * Run `drive`, which works a run under its lease. If it loses that lease, take
 * it again and carry on with `again`, a few times over. A run that cannot be
 * taken again is left to whoever has it, or to the queue, and the loss is
 * thrown.
 *
 * knowledge: decisions/internals/a-pass-that-lost-its-lease-writes-nothing.md
 */
export const pickingUpLostRun = async <T>(
  host: LostRunHost,
  runId: string,
  drive: () => Promise<T>,
  again: () => Promise<T> = drive
): Promise<{ value: T; pickedUp: boolean }> => {
  let lost: unknown
  try {
    return { value: await drive(), pickedUp: false }
  } catch (error) {
    if (!isLostLeaseOn(error, runId)) throw error
    lost = error
  }
  for (let pickup = 0; pickup < LOST_LEASE_PICKUPS; pickup++) {
    // A run that ended has nothing left to pick up.
    if (await hasEnded(host, runId)) throw lost
    try {
      return { value: await again(), pickedUp: true }
    } catch (error) {
      if (isLostLeaseOn(error, runId)) {
        lost = error
        continue
      }
      if (error instanceof LeaseTakenError) break
      // The run's own outcome. Anything else says the run could not be taken.
      if (
        PASS_ENDINGS.has((error as Error).name) ||
        (await hasEnded(host, runId))
      ) {
        throw error
      }
      host
        .logger()
        ?.warn(
          `Workflow run ${runId}: could not carry on after losing its lease`,
          error
        )
      break
    }
  }
  await host.wake(runId).catch((error) => {
    host
      .logger()
      ?.error(
        `Workflow run ${runId}: could not enqueue a wake after losing its lease`,
        error
      )
  })
  throw lost
}
