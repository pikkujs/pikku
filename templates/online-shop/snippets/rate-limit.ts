import { addGlobalRateLimiter } from '@pikku/core/middleware'
import {
  assertRateLimitArgs,
  type RateLimitResult,
  type RateLimitService,
} from '@pikku/core/services'

/** Registered by an app that sets a limit; the template itself runs without one. */
export const limitExternalCalls = () =>
  // @snippet start addGlobalRateLimiter
  addGlobalRateLimiter({
    limit: 100,
    windowMs: 60_000,
    ipHeader: 'cf-connecting-ip',
  })
// @snippet end addGlobalRateLimiter

/** A store that keeps its counts in a map, to show what a `RateLimitService` has to check. */
export class MapRateLimitService implements RateLimitService {
  private windows = new Map<string, { count: number; resetAt: number }>()

  async hit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    // @snippet start assertRateLimitArgs
    assertRateLimitArgs(limit, windowMs)
    // @snippet end assertRateLimitArgs
    const now = Date.now()
    const current = this.windows.get(key)
    const window =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + windowMs }
    const allowed = window.count < limit
    if (allowed) window.count++
    this.windows.set(key, window)
    return {
      allowed,
      count: window.count,
      limit,
      resetAt: new Date(window.resetAt),
      retryAfterMs: window.resetAt - now,
    }
  }
}
