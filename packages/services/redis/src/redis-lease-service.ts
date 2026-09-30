import type { Lease, LeaseService } from '@pikku/core/services'
import { Redis, type RedisOptions } from 'ioredis'

/**
 * Every script reads the time from Redis, so a lease is judged, and its
 * `expiresAt` reported, on the server's clock rather than the worker's.
 *
 * A lease is a hash that Redis expires on its own. Its token comes from a
 * counter kept beside it that is never deleted, so a key taken again after a
 * lapse or a release always gets a higher token than any holder before.
 */
const NOW_MS = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
`

const ACQUIRE = `${NOW_MS}
local ttl = tonumber(ARGV[2])
local current = redis.call('HMGET', KEYS[1], 'holder', 'token')
local token
if current[1] then
  if current[1] ~= ARGV[1] then return false end
  token = tonumber(current[2])
else
  token = redis.call('INCR', KEYS[2])
  redis.call('HSET', KEYS[1], 'holder', ARGV[1], 'token', token)
end
redis.call('PEXPIRE', KEYS[1], ttl)
return {token, now + ttl}
`

const REFRESH = `${NOW_MS}
local current = redis.call('HMGET', KEYS[1], 'holder', 'token')
if current[1] ~= ARGV[1] or current[2] ~= ARGV[2] then return false end
local ttl = tonumber(ARGV[3])
redis.call('PEXPIRE', KEYS[1], ttl)
return now + ttl
`

const RELEASE = `
local current = redis.call('HMGET', KEYS[1], 'holder', 'token')
if current[1] ~= ARGV[1] or current[2] ~= ARGV[2] then return 0 end
return redis.call('DEL', KEYS[1])
`

const GET = `${NOW_MS}
local current = redis.call('HMGET', KEYS[1], 'holder', 'token')
if not current[1] then return false end
local left = redis.call('PTTL', KEYS[1])
if left <= 0 then return false end
return {current[1], tonumber(current[2]), now + left}
`

export interface RedisLeaseServiceConfig {
  /** Redis key prefix (default: 'pikku') */
  keyPrefix?: string
}

/**
 * `LeaseService` on Redis. Every check-and-set is one Lua script, and every
 * lease is judged by Redis's own clock, so a worker whose clock runs fast can
 * neither take a live lease nor stretch its own.
 *
 * @example
 * ```typescript
 * const redis = new Redis('redis://localhost:6379')
 * const leaseService = new RedisLeaseService(redis)
 * ```
 */
export class RedisLeaseService implements LeaseService {
  private redis: Redis
  private ownsConnection: boolean
  private keyPrefix: string

  /**
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   */
  constructor(
    connectionOrConfig: Redis | RedisOptions | string | undefined,
    config: RedisLeaseServiceConfig = {}
  ) {
    if (
      typeof connectionOrConfig === 'object' &&
      connectionOrConfig !== null &&
      'hgetall' in connectionOrConfig &&
      'hset' in connectionOrConfig
    ) {
      this.redis = connectionOrConfig as Redis
      this.ownsConnection = false
    } else {
      this.redis = new Redis(connectionOrConfig as any)
      this.ownsConnection = true
    }
    this.keyPrefix = config.keyPrefix ?? 'pikku'
  }

  async acquire(
    key: string,
    holder: string,
    ttlMs: number
  ): Promise<Lease | null> {
    const acquired = (await this.redis.eval(
      ACQUIRE,
      2,
      this.leaseKey(key),
      this.tokenKey(key),
      holder,
      toPexpire(ttlMs)
    )) as [number, number] | null
    if (!acquired) return null
    const [token, expiresAt] = acquired
    return { key, holder, token, expiresAt: new Date(expiresAt) }
  }

  async refresh(lease: Lease, ttlMs: number): Promise<Lease | null> {
    const expiresAt = (await this.redis.eval(
      REFRESH,
      1,
      this.leaseKey(lease.key),
      lease.holder,
      String(lease.token),
      toPexpire(ttlMs)
    )) as number | null
    if (expiresAt === null) return null
    return { ...lease, expiresAt: new Date(expiresAt) }
  }

  async release(lease: Lease): Promise<void> {
    await this.redis.eval(
      RELEASE,
      1,
      this.leaseKey(lease.key),
      lease.holder,
      String(lease.token)
    )
  }

  async get(key: string): Promise<Lease | null> {
    const current = (await this.redis.eval(GET, 1, this.leaseKey(key))) as
      [string, number, number] | null
    if (!current) return null
    const [holder, token, expiresAt] = current
    return { key, holder, token, expiresAt: new Date(expiresAt) }
  }

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }

  /**
   * The `{key}` hash tag puts a lease and its token counter in the same
   * cluster slot, which a script touching both requires.
   */
  private leaseKey(key: string) {
    return `${this.keyPrefix}:lease:{${key}}`
  }

  private tokenKey(key: string) {
    return `${this.keyPrefix}:lease-token:{${key}}`
  }
}

/** `PEXPIRE` takes a whole number of milliseconds, and deletes the key at 0. */
const toPexpire = (ttlMs: number) => Math.max(1, Math.ceil(ttlMs))
