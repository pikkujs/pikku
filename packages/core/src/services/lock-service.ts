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

export type HoldLockOptions = {
  /** Lease length; refreshed every third of it while `fn` runs. */
  ttlMs?: number
  /** How long to wait for a taken lock before `LockTimeoutError`. `0` waits forever. */
  waitMs?: number
  pollMs?: number
  /** Longest `fn` may hold the lock before it is released and the caller rejected with `LockHoldTimeoutError`. `0` is unbounded. */
  maxHoldMs?: number
}

export class LockTimeoutError extends Error {
  constructor(
    public readonly key: string,
    public readonly waitedMs: number
  ) {
    super(`Lock ${key} was not free within ${waitedMs}ms`)
    this.name = 'LockTimeoutError'
  }
}

export class LockHoldTimeoutError extends Error {
  constructor(
    public readonly key: string,
    public readonly heldForMs: number
  ) {
    super(
      `Lock ${key} was held for longer than ${heldForMs}ms and was released`
    )
    this.name = 'LockHoldTimeoutError'
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Runs `fn` under `key`, waiting for the lock and keeping its lease alive until `fn` settles. */
export const holdLock = async <T>(
  locks: LockService,
  key: string,
  fn: () => Promise<T>,
  {
    ttlMs = 30_000,
    waitMs = 0,
    pollMs = 250,
    maxHoldMs = 0,
  }: HoldLockOptions = {}
): Promise<T> => {
  const holder = crypto.randomUUID()
  const deadline = waitMs > 0 ? Date.now() + waitMs : Infinity
  let lease = await locks.acquire(key, holder, ttlMs)
  while (!lease) {
    if (Date.now() >= deadline) throw new LockTimeoutError(key, waitMs)
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())))
    lease = await locks.acquire(key, holder, ttlMs)
  }

  let current: LockLease = lease
  let refreshing: Promise<unknown> = Promise.resolve()
  const refresher = setInterval(
    () => {
      refreshing = refreshing
        .then(() => locks.refresh(current, ttlMs))
        .then((next) => {
          if (next) current = next
        })
        .catch(() => {})
    },
    Math.max(1, Math.floor(ttlMs / 3))
  )
  refresher?.unref?.()

  let holdTimer: ReturnType<typeof setTimeout> | undefined
  try {
    if (maxHoldMs <= 0) return await fn()
    return await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        holdTimer = setTimeout(
          () => reject(new LockHoldTimeoutError(key, maxHoldMs)),
          maxHoldMs
        )
      }),
    ])
  } finally {
    clearTimeout(holdTimer)
    clearInterval(refresher)
    await refreshing
    await locks.release(current).catch(() => {})
  }
}
