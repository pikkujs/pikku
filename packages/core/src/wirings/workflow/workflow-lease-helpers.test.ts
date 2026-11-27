import { leaseRenewalIntervalMs } from '../../services/lease-service.js'

/** The wait between two renewals of a run's lease. */
const RUN_LEASE_RENEWAL_MS = leaseRenewalIntervalMs(30_000)

/**
 * Renew run leases every few milliseconds, so a test can lose one without
 * sitting out the real interval. Returns how to put the timers back.
 */
export const fastLeaseRenewals = (): (() => void) => {
  const real = globalThis.setTimeout
  globalThis.setTimeout = ((handler: any, ms?: number, ...args: any[]) =>
    real(
      handler,
      ms === RUN_LEASE_RENEWAL_MS ? 5 : ms,
      ...args
    )) as typeof setTimeout
  return () => {
    globalThis.setTimeout = real
  }
}

export const gate = () => {
  let open!: () => void
  const passed = new Promise<void>((resolve) => (open = resolve))
  return { open, passed }
}

/** Resolves `true` once `condition` holds, or `false` after `ms`. */
export const until = async (
  condition: () => boolean,
  ms = 5_000
): Promise<boolean> => {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return true
}
