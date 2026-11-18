export type RateLimitResult = {
  /** Whether this hit was admitted. */
  allowed: boolean
  /** Hits admitted in the current window, this one included when `allowed`. */
  count: number
  limit: number
  /** When the current window ends and the count starts again. */
  resetAt: Date
  /** How long until `resetAt`, in whole milliseconds. */
  retryAfterMs: number
}

/**
 * Fixed-window hit counter shared by every process on the same store.
 *
 * A window opens at a key's first hit after the previous window ended and lasts
 * `windowMs`. A hit is admitted while fewer than `limit` have been admitted in
 * the window; a refused hit is not counted, so a caller that keeps hitting a
 * full window cannot hold it open. Counting and comparing happen in one atomic
 * step, so concurrent hits never admit more than `limit`.
 */
export interface RateLimitService {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
}

/**
 * Rejects a limit or window no store can count against.
 *
 * @example snippet: assertRateLimitArgs
 */
export const assertRateLimitArgs = (limit: number, windowMs: number): void => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`Rate limit must be a positive integer, got ${limit}`)
  }
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new RangeError(
      `Rate limit window must be a positive whole number of milliseconds, got ${windowMs}`
    )
  }
}
