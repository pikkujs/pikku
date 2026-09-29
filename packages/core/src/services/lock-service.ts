/** A held lock. `token` rises every time the lock changes hands, so a write can be fenced to the holder that made it. */
export type LockLease = {
  key: string
  holder: string
  token: number
  expiresAt: Date
}

/** Named, lease-based mutual exclusion across processes. Nothing blocks: a lock that is taken is answered with `null`. */
export interface LockService {
  /** Takes `key` when it is free, lapsed, or already held by `holder`; `null` while someone else holds it. */
  acquire(key: string, holder: string, ttlMs: number): Promise<LockLease | null>
  /** Extends a lease still held under its token; `null` once it has lapsed to another holder. */
  refresh(lease: LockLease, ttlMs: number): Promise<LockLease | null>
  /** Gives up a lease; a no-op when it has already passed to someone else. */
  release(lease: LockLease): Promise<void>
  /** The live lease on `key`, if any. */
  get(key: string): Promise<LockLease | null>
}

export class InMemoryLockService implements LockService {
  private leases = new Map<string, LockLease>()

  constructor(private now: () => number = Date.now) {}

  async acquire(
    key: string,
    holder: string,
    ttlMs: number
  ): Promise<LockLease | null> {
    const current = this.leases.get(key)
    const expiresAt = new Date(this.now() + ttlMs)
    if (!current) return this.set({ key, holder, token: 1, expiresAt })
    if (this.lapsed(current)) {
      return this.set({ key, holder, token: current.token + 1, expiresAt })
    }
    if (current.holder === holder) return this.set({ ...current, expiresAt })
    return null
  }

  async refresh(lease: LockLease, ttlMs: number): Promise<LockLease | null> {
    const current = this.leases.get(lease.key)
    if (!this.holds(current, lease) || this.lapsed(current!)) return null
    return this.set({ ...current!, expiresAt: new Date(this.now() + ttlMs) })
  }

  async release(lease: LockLease) {
    const current = this.leases.get(lease.key)
    if (this.holds(current, lease)) {
      this.set({ ...current!, expiresAt: new Date(0) })
    }
  }

  async get(key: string): Promise<LockLease | null> {
    const current = this.leases.get(key)
    if (!current || this.lapsed(current)) return null
    return { ...current }
  }

  private lapsed(lease: LockLease) {
    return lease.expiresAt.getTime() <= this.now()
  }

  private holds(current: LockLease | undefined, lease: LockLease) {
    return (
      !!current &&
      current.holder === lease.holder &&
      current.token === lease.token
    )
  }

  private set(lease: LockLease): LockLease {
    this.leases.set(lease.key, lease)
    return { ...lease }
  }
}
