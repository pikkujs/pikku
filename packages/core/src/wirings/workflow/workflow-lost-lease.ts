import {
  LeaseLostError,
  LeaseTakenError,
} from '../../services/lease-service.js'
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
