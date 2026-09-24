import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import {
  DEFAULT_STEP_LEASE_MS,
  STEP_LEASE_REFRESH_FACTOR,
  STEP_LEASE_REFRESH_MIN_MS,
  isStepLeaseLive,
} from './workflow-constants.js'
import type { StepState } from './workflow.types.js'

/**
 * How long a claim on a step dispatched through `queueName` is good for, taken
 * from that queue's own lock so the two never disagree about who owns the job.
 */
export const stepLeaseMsForQueue = (queueName: string): number => {
  const worker = pikkuState(null, 'queue', 'registrations').get(queueName)
  const { lockDuration, visibilityTimeout } = worker?.config ?? {}
  if (lockDuration !== undefined) {
    return lockDuration
  }
  if (visibilityTimeout !== undefined) {
    return visibilityTimeout * 1000
  }
  return DEFAULT_STEP_LEASE_MS
}

/**
 * Keep a dispatch's claim alive for as long as it is working, and report how to
 * stop once it is not.
 *
 * The timer is unreferenced: a lease outliving its step must not be what keeps
 * a process from exiting.
 *
 * Stopping waits for a refresh already in flight, so a caller that releases the
 * lease after stopping cannot have that release overwritten by a late renewal.
 */
export const startStepLeaseRefresh = (
  stepId: string,
  leaseMs: number,
  refresh: (expiresAt: Date) => Promise<void>
): (() => Promise<void>) => {
  // Half the lease, and never more. The floor is there to stop a short lease
  // spinning the timer, but it may not be applied as a maximum: a lease under
  // twice the floor would then be renewed for the first time after it had
  // already lapsed, and a duplicate dispatch is free to claim and run the step
  // alongside the worker still executing it — the exact race the lease exists
  // to close. A lease that short spins instead, and says so once, because a
  // busy timer is cheaper than two workers on one step.
  const interval = Math.max(1, Math.floor(leaseMs * STEP_LEASE_REFRESH_FACTOR))
  if (interval < STEP_LEASE_REFRESH_MIN_MS) {
    getSingletonServices()?.logger?.warn(
      `Workflow step ${stepId}: a ${leaseMs}ms lease is refreshed every ${interval}ms. Raise the queue's lockDuration or visibilityTimeout above ${
        STEP_LEASE_REFRESH_MIN_MS * 2
      }ms.`
    )
  }

  let inFlight: Promise<void> = Promise.resolve()
  const timer = setInterval(() => {
    inFlight = refresh(new Date(Date.now() + leaseMs)).catch((error) =>
      getSingletonServices()?.logger?.warn(
        `Workflow step ${stepId}: could not refresh its lease; another worker may take the step`,
        error
      )
    )
  }, interval)
  timer.unref?.()
  return async () => {
    clearInterval(timer)
    await inFlight
  }
}

/**
 * Who a `running` step belongs to, for a resumed run that meets it. `held` is a
 * dispatch still working it. `lapsed` is one that died: the step is dispatched
 * again but left `running`, so the claim counts it as another attempt rather
 * than a first run — a step that kills its worker every time then runs out.
 */
export const runningStepLease = (
  stepState: StepState
): 'held' | 'lapsed' | undefined => {
  if (stepState.status !== 'running' || stepState.leaseExpiresAt == null) {
    return undefined
  }
  return isStepLeaseLive(stepState.leaseExpiresAt) ? 'held' : 'lapsed'
}
