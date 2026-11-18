import {
  assertRateLimitArgs,
  type RateLimitResult,
  type RateLimitService,
} from './rate-limit-service.js'

/** Entries kept before expired ones are swept out on the next hit. */
const SWEEP_THRESHOLD = 10_000

type Window = { count: number; resetAt: number }

/**
 * Counts in this process only: the counts reset on restart and are not shared
 * between instances. Use a store-backed service wherever either matters.
 */
export class InMemoryRateLimitService implements RateLimitService {
  private windows = new Map<string, Window>()

  constructor(private now: () => number = Date.now) {}

  async hit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    assertRateLimitArgs(limit, windowMs)
    const now = this.now()
    if (this.windows.size >= SWEEP_THRESHOLD) this.sweep(now)

    let current = this.windows.get(key)
    if (!current || current.resetAt <= now) {
      current = { count: 0, resetAt: now + windowMs }
      this.windows.set(key, current)
    }

    const allowed = current.count < limit
    if (allowed) current.count++

    return {
      allowed,
      count: current.count,
      limit,
      resetAt: new Date(current.resetAt),
      retryAfterMs: current.resetAt - now,
    }
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}
