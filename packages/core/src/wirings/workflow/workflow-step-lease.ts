import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import {
  DEFAULT_STEP_LEASE_MS,
  STEP_LEASE_REFRESH_MIN_MS,
  isStepLeaseLive,
} from './workflow-constants.js'
import {
  keepLeaseAlive,
  leaseRenewalIntervalMs,
  RENEWALS_PER_LEASE,
} from '../../services/lease-service.js'
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
 * stop once it is not. It renews on the same loop as `holdLease`.
 *
 * Stopping waits for a refresh already in flight, so a caller that releases the
 * lease after stopping cannot have that release overwritten by a late renewal.
 *
 * A refresh that resolves `false` means another dispatch has claimed the step
 * since: renewing stops there, and says so, because the step's outcome will
 * now be refused rather than recorded.
 */
export const startStepLeaseRefresh = (
  stepId: string,
  leaseMs: number,
  refresh: () => Promise<boolean>
): (() => Promise<void>) => {
  const interval = leaseRenewalIntervalMs(leaseMs)
  if (interval < STEP_LEASE_REFRESH_MIN_MS) {
    getSingletonServices()?.logger?.warn(
      `Workflow step ${stepId}: a ${leaseMs}ms lease is refreshed every ${interval}ms. Raise the queue's lockDuration or visibilityTimeout above ${
        STEP_LEASE_REFRESH_MIN_MS * RENEWALS_PER_LEASE
      }ms.`
    )
  }

  const renewal = keepLeaseAlive(`workflow-step:${stepId}`, leaseMs, () =>
    refresh().catch((error) => {
      getSingletonServices()?.logger?.warn(
        `Workflow step ${stepId}: could not refresh its lease; another worker may take the step`,
        error
      )
      throw error
    })
  )
  renewal.signal.addEventListener('abort', () =>
    getSingletonServices()?.logger?.warn(
      `Workflow step ${stepId}: lost its lease, so another dispatch may claim it; this one stops renewing and its outcome will be refused if it does`
    )
  )
  return renewal.stop
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
