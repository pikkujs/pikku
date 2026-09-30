import { PikkuLockService, type LockLease } from './lock-service.js'

export class InMemoryLockService extends PikkuLockService {
  private leases = new Map<string, LockLease>()

  constructor(private now: () => number = Date.now) {
    super()
  }

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

  async release(lease: LockLease): Promise<void> {
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
