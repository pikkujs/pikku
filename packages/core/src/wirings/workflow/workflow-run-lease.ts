import {
  holdLease,
  LeaseLostError,
  LeaseTakenError,
  type LeaseService,
} from '../../services/lease-service.js'
import { isRunLeaseKey, throwIfLeaseLost } from './workflow-lost-lease.js'

/** The run is, or was meanwhile, orchestrated by someone else. */
export const isRunLeaseError = (error: unknown): boolean =>
  error instanceof LeaseTakenError || error instanceof LeaseLostError

/**
 * Run `fn` holding `key` on the lease service a workflow service was built
 * with. It never waits: a key held elsewhere throws `LeaseTakenError`.
 */
export const holdWorkflowLease = <T>(
  service: object,
  leases: LeaseService | undefined,
  key: string,
  fn: (lost: AbortSignal) => Promise<T>
): Promise<T> => {
  if (!leases) {
    throw new Error(
      `${service.constructor.name} was constructed without a leaseService, so it cannot exclude a second process from a run or step. Pass the app's leaseService to its constructor.`
    )
  }
  return holdLease(leases, key, async (_lease, lost) => {
    try {
      return await fn(lost)
    } catch (error) {
      // Whatever a pass threw after losing its run, the loss is the news. A
      // step's lock covers a gate, whose own exception is how the run suspends.
      if (isRunLeaseKey(key)) throwIfLeaseLost(lost)
      throw error
    }
  })
}

/** A step whose lease is held elsewhere belongs to another dispatch. */
export const nullWhenStepHeld = async <T>(
  claim: () => Promise<T>
): Promise<T | null> => {
  try {
    return await claim()
  } catch (error) {
    if (error instanceof LeaseTakenError) {
      return null
    }
    throw error
  }
}
