import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import {
  DEFAULT_STEP_LEASE_MS,
  STEP_LEASE_REFRESH_FACTOR,
  STEP_LEASE_REFRESH_MIN_MS,
} from './workflow-constants.js'

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
 */
export const startStepLeaseRefresh = (
  stepId: string,
  leaseMs: number,
  refresh: (expiresAt: Date) => Promise<void>
): (() => void) => {
  const timer = setInterval(
    () => {
      refresh(new Date(Date.now() + leaseMs)).catch((error) =>
        getSingletonServices()?.logger?.warn(
          `Workflow step ${stepId}: could not refresh its lease; another worker may take the step`,
          error
        )
      )
    },
    Math.max(
      STEP_LEASE_REFRESH_MIN_MS,
      Math.floor(leaseMs * STEP_LEASE_REFRESH_FACTOR)
    )
  )
  timer.unref?.()
  return () => clearInterval(timer)
}
