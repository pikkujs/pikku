export type LockLease = {
  key: string
  holder: string
  token: number
  expiresAt: Date
}

export interface LockService {
  acquire(key: string, holder: string, ttlMs: number): Promise<LockLease | null>
  refresh(lease: LockLease, ttlMs: number): Promise<LockLease | null>
  release(lease: LockLease): Promise<void>
  get(key: string): Promise<LockLease | null>
  withLock<T>(
    key: string,
    fn: (lease: LockLease, signal: AbortSignal) => Promise<T>,
    ttlMs?: number
  ): Promise<T>
}

export class LockTakenError extends Error {
  constructor(public readonly key: string) {
    super(`Lock ${key} is held by another holder`)
    this.name = 'LockTakenError'
  }
}

/**
 * Thrown by `withLock` when the lease lapsed or passed to another holder while
 * the body ran, so its result was not produced under the lock. The body's
 * `signal` is aborted with it as soon as the loss is seen.
 */
export class LockLostError extends Error {
  constructor(public readonly key: string) {
    super(`Lock ${key} was lost before the body finished`)
    this.name = 'LockLostError'
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

export abstract class PikkuLockService implements LockService {
  abstract acquire(
    key: string,
    holder: string,
    ttlMs: number
  ): Promise<LockLease | null>
  abstract refresh(lease: LockLease, ttlMs: number): Promise<LockLease | null>
  abstract release(lease: LockLease): Promise<void>
  abstract get(key: string): Promise<LockLease | null>

  /**
   * Runs `fn` holding `key`, renewing the lease every third of `ttlMs` until
   * it settles. Never waits for a taken key: that throws `LockTakenError`.
   */
  async withLock<T>(
    key: string,
    fn: (lease: LockLease, signal: AbortSignal) => Promise<T>,
    ttlMs = 30_000
  ): Promise<T> {
    const acquired = await this.acquire(key, crypto.randomUUID(), ttlMs)
    if (!acquired) throw new LockTakenError(key)
    let lease = acquired

    const lost = new AbortController()
    const finished = new AbortController()

    // `null` is an answer: someone else holds the key. A throw is not, so the
    // lease is only given up once this process's own clock says it has run out.
    const renew = async (heldUntil: number) => {
      const renewedAt = Date.now()
      const next = await this.refresh(lease, ttlMs).catch(() => undefined)
      if (next) {
        lease = next
        return renewedAt + ttlMs
      }
      if (next === null || Date.now() >= heldUntil) {
        lost.abort(new LockLostError(key))
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
      if (lost.signal.aborted) throw new LockLostError(key)
      return result
    } finally {
      finished.abort()
      await renewing
      await this.release(lease).catch(() => {})
    }
  }
}
