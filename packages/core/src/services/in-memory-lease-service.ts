import type { Lease, LeaseService } from './lease-service.js'

export class InMemoryLeaseService implements LeaseService {
  private leases = new Map<string, Lease>()

  constructor(private now: () => number = Date.now) {}

  async acquire(
    key: string,
    holder: string,
    ttlMs: number
  ): Promise<Lease | null> {
    const current = this.leases.get(key)
    const expiresAt = new Date(this.now() + ttlMs)
    if (!current) return this.set({ key, holder, token: 1, expiresAt })
    if (this.lapsed(current)) {
      return this.set({ key, holder, token: current.token + 1, expiresAt })
    }
    if (current.holder === holder) return this.set({ ...current, expiresAt })
    return null
  }

  async refresh(lease: Lease, ttlMs: number): Promise<Lease | null> {
    const current = this.leases.get(lease.key)
    if (!this.holds(current, lease) || this.lapsed(current!)) return null
    return this.set({ ...current!, expiresAt: new Date(this.now() + ttlMs) })
  }

  async release(lease: Lease): Promise<void> {
    const current = this.leases.get(lease.key)
    if (this.holds(current, lease)) {
      this.set({ ...current!, expiresAt: new Date(0) })
    }
  }

  async get(key: string): Promise<Lease | null> {
    const current = this.leases.get(key)
    if (!current || this.lapsed(current)) return null
    return { ...current }
  }

  private lapsed(lease: Lease) {
    return lease.expiresAt.getTime() <= this.now()
  }

  private holds(current: Lease | undefined, lease: Lease) {
    return (
      !!current &&
      current.holder === lease.holder &&
      current.token === lease.token
    )
  }

  private set(lease: Lease): Lease {
    this.leases.set(lease.key, lease)
    return { ...lease }
  }
}
