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
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

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

  const lost = new AbortController()
  const finished = new AbortController()

  // `null` is an answer: someone else holds the key. A throw is not, so the
  // lease is only given up once this process's own clock says it has run out.
  const renew = async (heldUntil: number) => {
    const renewedAt = Date.now()
    const next = await leases.refresh(lease, ttlMs).catch(() => undefined)
    if (next) {
      lease = next
      return renewedAt + ttlMs
    }
    if (next === null || Date.now() >= heldUntil) {
      lost.abort(new LeaseLostError(key))
    }
    return heldUntil
  }

  const keepAlive = async () => {
    let heldUntil = Date.now() + ttlMs
    while (!lost.signal.aborted) {
      await sleep(Math.max(1, ttlMs / 3), finished.signal)
      if (finished.signal.aborted) return
      heldUntil = await renew(heldUntil)
    }
  }
  const renewing = keepAlive()

  try {
    const result = await fn(lease, lost.signal)
    finished.abort()
    await renewing
    // The last renewal can be a third of a lease old, so check once more
    // before vouching that the body ran alone.
    if (!lost.signal.aborted) await renew(0)
    if (lost.signal.aborted) throw new LeaseLostError(key)
    return result
  } finally {
    finished.abort()
    await renewing
    await leases.release(lease).catch(() => {})
  }
}
