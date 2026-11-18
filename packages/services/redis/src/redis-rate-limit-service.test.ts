import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Redis } from 'ioredis'
import { defineServiceTests } from '@pikku/core/testing'
import { RedisRateLimitService } from './redis-rate-limit-service.js'

const redisUrl = process.env.REDIS_URL

describe(
  'RedisRateLimitService',
  { skip: !redisUrl ? 'REDIS_URL not set' : undefined },
  () => {
    const redis = new Redis(redisUrl!, { lazyConnect: true })
    const prefixes: string[] = []
    const create = async () => {
      const keyPrefix = `test-${crypto.randomUUID()}`
      prefixes.push(keyPrefix)
      return new RedisRateLimitService(redis, { keyPrefix })
    }

    after(async () => {
      for (const prefix of prefixes) {
        const keys = await redis.keys(`${prefix}:*`)
        if (keys.length > 0) await redis.del(...keys)
      }
      await redis.quit()
    })

    defineServiceTests({
      name: 'redis',
      services: { rateLimitService: create },
    })

    test('a new service on the same Redis sees the count', async () => {
      const keyPrefix = `test-${crypto.randomUUID()}`
      prefixes.push(keyPrefix)
      const first = new RedisRateLimitService(redis, { keyPrefix })
      await first.hit('k', 2, 60 * 60_000)
      await first.hit('k', 2, 60 * 60_000)

      const restarted = new RedisRateLimitService(redis, { keyPrefix })
      const hit = await restarted.hit('k', 2, 60 * 60_000)
      assert.equal(hit.allowed, false)
      assert.equal(hit.count, 2)
    })

    test('the window is the key TTL, so Redis ends it on its own', async () => {
      const keyPrefix = `test-${crypto.randomUUID()}`
      prefixes.push(keyPrefix)
      const limiter = new RedisRateLimitService(redis, { keyPrefix })
      await limiter.hit('k', 1, 60 * 60_000)
      const ttl = await redis.pttl(`${keyPrefix}:rate-limit:k`)
      assert.ok(ttl > 0 && ttl <= 60 * 60_000)
    })
  }
)
