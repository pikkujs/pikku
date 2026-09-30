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

export abstract class PikkuLockService implements LockService {
  abstract acquire(
    key: string,
    holder: string,
    ttlMs: number
  ): Promise<LockLease | null>
  abstract refresh(lease: LockLease, ttlMs: number): Promise<LockLease | null>
  abstract release(lease: LockLease): Promise<void>
  abstract get(key: string): Promise<LockLease | null>

  async withLock<T>(
    key: string,
    fn: (lease: LockLease, signal: AbortSignal) => Promise<T>,
    ttlMs = 30_000
  ): Promise<T> {
    let lease = await this.acquire(key, crypto.randomUUID(), ttlMs)
    if (!lease) throw new LockTakenError(key)
    const lost = new AbortController()
    // Measured on this process's own clock from the last renewal it saw, so a
    // store whose clock disagrees cannot stretch how long this holder trusts it.
    let heldUntil = Date.now() + ttlMs
    let refreshing: Promise<unknown> = Promise.resolve()
    const renew = async () => {
      const renewedAt = Date.now()
      const next = await this.refresh(lease!, ttlMs)
      if (next) {
        lease = next
        heldUntil = renewedAt + ttlMs
      } else {
        lost.abort(new LockLostError(key))
      }
    }
    // A refresh that fails outright says nothing about the lease, but one that
    // keeps failing past its expiry means another holder may have taken it.
    const refresher = setInterval(
      () => {
        refreshing = refreshing.then(renew).catch(() => {
          if (heldUntil <= Date.now()) lost.abort(new LockLostError(key))
        })
      },
      Math.max(1, Math.floor(ttlMs / 3))
    )
    refresher.unref?.()
    let result: T
    try {
      result = await fn(lease, lost.signal)
      clearInterval(refresher)
      await refreshing
      // The last renewal may be up to a third of the lease old, and a stalled
      // event loop can make it older: confirm the lease is still this
      // holder's before vouching for what the body did under it.
      if (!lost.signal.aborted) {
        await renew().catch(() => lost.abort(new LockLostError(key)))
      }
    } finally {
      clearInterval(refresher)
      await refreshing
      await this.release(lease).catch(() => {})
    }
    // The body ran to completion, but not necessarily alone: a caller must not
    // treat its result as having been produced under the lock.
    if (lost.signal.aborted) throw new LockLostError(key)
    return result
  }
}
