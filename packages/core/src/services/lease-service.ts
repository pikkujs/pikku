export type Lease = {
  key: string
  holder: string
  token: number
  expiresAt: Date
}

/**
 * Named leases shared by every process on the same store. A lease is held until
 * it is released or runs out, so it is not a mutex: a holder that stalls past
 * its expiry loses the key without knowing. `token` rises every time the key
 * changes hands, and a write that must not come from a stale holder checks it.
 */
export interface LeaseService {
  acquire(key: string, holder: string, ttlMs: number): Promise<Lease | null>
  refresh(lease: Lease, ttlMs: number): Promise<Lease | null>
  release(lease: Lease): Promise<void>
  get(key: string): Promise<Lease | null>
}

export class LeaseTakenError extends Error {
  constructor(public readonly key: string) {
    super(`Lease ${key} is held by another holder`)
    this.name = 'LeaseTakenError'
  }
}

/**
 * Thrown by `holdLease` when the lease lapsed or passed to another holder while
 * the body ran, so its result was not produced under the lease. The body's
 * `signal` is aborted with it as soon as the loss is seen.
 */
export class LeaseLostError extends Error {
  constructor(public readonly key: string) {
    super(`Lease ${key} was lost before the body finished`)
    this.name = 'LeaseLostError'
  }
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    timer.unref?.()
    signal.addEventListener('abort', done)
  })

/** How many renewals fit in one lease, so a failed one still leaves others before it runs out. */
export const RENEWALS_PER_LEASE = 3

/** How long a holder waits between renewals of a `ttlMs` lease. */
export const leaseRenewalIntervalMs = (ttlMs: number) =>
  Math.max(1, ttlMs / RENEWALS_PER_LEASE)

export type LeaseRenewal = {
  /** Aborts with `LeaseLostError` once the lease is no longer this holder's. */
  signal: AbortSignal
  /** Stops renewing, after waiting for a renewal already in flight. */
  stop: () => Promise<void>
}

/**
 * Renews a held lease every third of `ttlMs` until stopped, so a renewal that
 * fails still leaves two more before the lease runs out.
 *
 * `renew` resolves `true` while the lease is still this holder's and `false`
 * once another holder has it. A throw proves neither, so the lease is only
 * counted lost once renewals have kept failing past its expiry on this
 * process's clock.
 *
 * `stop` waits for a renewal in flight, so a release made after it cannot be
 * undone by a late one.
 */
export const keepLeaseAlive = (
  key: string,
  ttlMs: number,
  renew: () => Promise<boolean>
): LeaseRenewal => {
  const lost = new AbortController()
  const stopped = new AbortController()

  const renewing = (async () => {
    let heldUntil = Date.now() + ttlMs
    while (!lost.signal.aborted) {
      await sleep(leaseRenewalIntervalMs(ttlMs), stopped.signal)
      if (stopped.signal.aborted) return
      const renewedAt = Date.now()
      const held = await renew().catch(() => undefined)
      if (held) {
        heldUntil = renewedAt + ttlMs
      } else if (held === false || Date.now() >= heldUntil) {
        lost.abort(new LeaseLostError(key))
      }
    }
  })()

  return {
    signal: lost.signal,
    stop: async () => {
      stopped.abort()
      await renewing
    },
  }
}

/**
 * Runs `fn` holding `key` on `leases`, renewing the lease every third of
 * `ttlMs` until it settles. `ttlMs` is how long a crashed holder keeps the key
 * from everyone else. Never waits for a taken key: that throws
 * `LeaseTakenError`.
 */
export const holdLease = async <T>(
  leases: LeaseService,
  key: string,
  fn: (lease: Lease, signal: AbortSignal) => Promise<T>,
  ttlMs = 30_000
): Promise<T> => {
  const acquired = await leases.acquire(key, crypto.randomUUID(), ttlMs)
  if (!acquired) throw new LeaseTakenError(key)
  let lease = acquired

  const renew = async () => {
    const next = await leases.refresh(lease, ttlMs)
    if (next) lease = next
    return next !== null
  }
  const renewal = keepLeaseAlive(key, ttlMs, renew)

  try {
    const result = await fn(lease, renewal.signal)
    await renewal.stop()
    // The last renewal can be a third of a lease old, so check once more
    // before vouching that the body ran alone.
    const stillHeld =
      !renewal.signal.aborted && (await renew().catch(() => false))
    if (!stillHeld) throw new LeaseLostError(key)
    return result
  } finally {
    await renewal.stop()
    await leases.release(lease).catch(() => {})
  }
}
