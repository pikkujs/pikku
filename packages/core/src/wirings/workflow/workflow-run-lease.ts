import {
  LeaseLostError,
  LeaseTakenError,
} from '../../services/lease-service.js'

/** The run is, or was meanwhile, orchestrated by someone else. */
export const isRunLeaseError = (error: unknown): boolean =>
  error instanceof LeaseTakenError || error instanceof LeaseLostError
