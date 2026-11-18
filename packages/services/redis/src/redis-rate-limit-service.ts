import {
  assertRateLimitArgs,
  type RateLimitResult,
  type RateLimitService,
} from '@pikku/core/services'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * One script counts and compares, so concurrent hits never admit more than the
 * limit. A refused hit is taken back out, which is what keeps it uncounted, and
 * the window is the key's own TTL, so Redis ends it with no sweeping.
 */
const HIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local allowed = 1
if count > tonumber(ARGV[1]) then
  count = redis.call('DECR', KEYS[1])
  allowed = 0
end
return {allowed, count, redis.call('PTTL', KEYS[1])}
`

export interface RedisRateLimitServiceConfig {
  /** Redis key prefix (default: 'pikku') */
  keyPrefix?: string
}

/**
 * `RateLimitService` on Redis. Counts are shared by every process using the
 * same Redis and survive their restarts.
 *
 * @example
 * ```typescript
 * const redis = new Redis('redis://localhost:6379')
 * const rateLimitService = new RedisRateLimitService(redis)
 * ```
 */
export class RedisRateLimitService implements RateLimitService {
  private redis: Redis
  private keyPrefix: string

  /**
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   */
  constructor(
    connectionOrConfig: Redis | RedisOptions | string | undefined,
    config: RedisRateLimitServiceConfig = {}
  ) {
    if (connectionOrConfig instanceof Redis) {
      this.redis = connectionOrConfig
    } else if (typeof connectionOrConfig === 'string') {
      this.redis = new Redis(connectionOrConfig)
    } else {
      this.redis = new Redis(connectionOrConfig ?? {})
    }
    this.keyPrefix = config.keyPrefix ?? 'pikku'
  }

  async hit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    assertRateLimitArgs(limit, windowMs)
    const [allowed, count, left] = (await this.redis.eval(
      HIT,
      1,
      `${this.keyPrefix}:rate-limit:${key}`,
      String(limit),
      String(windowMs)
    )) as [number, number, number]
    const retryAfterMs = Math.min(windowMs, Math.max(0, left))
    return {
      allowed: allowed === 1,
      count,
      limit,
      resetAt: new Date(Date.now() + retryAfterMs),
      retryAfterMs,
    }
  }
}
