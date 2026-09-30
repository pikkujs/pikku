import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Redis } from 'ioredis'
import { defineServiceTests } from '@pikku/core/testing'
import { RedisLeaseService } from './redis-lease-service.js'

const HOUR = 60 * 60 * 1000
const redisUrl = process.env.REDIS_URL

/** Runs `fn` as a worker whose clock is an hour fast. */
const withSkewedClock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const realNow = Date.now
  Date.now = () => realNow() + HOUR
  try {
    return await fn()
  } finally {
    Date.now = realNow
  }
}

describe(
  'RedisLeaseService',
  { skip: !redisUrl ? 'REDIS_URL not set' : undefined },
  () => {
    const redis = new Redis(redisUrl!, { lazyConnect: true })
    const create = async () =>
      new RedisLeaseService(redis, {
        keyPrefix: `test-${crypto.randomUUID()}`,
      })

    after(async () => {
      await redis.quit()
    })

    defineServiceTests({ name: 'redis', services: { leaseService: create } })

    describe('a lease is judged by the Redis clock', () => {
      test('a worker with a fast clock cannot take a live lease', async () => {
        const leases = await create()
        assert.ok(await leases.acquire('skewed', 'worker-a', 60_000))

        const stolen = await withSkewedClock(() =>
          leases.acquire('skewed', 'worker-b', 60_000)
        )

        assert.equal(stolen, null, 'the lease was judged by the worker clock')
      })

      test('a worker with a fast clock does not make its lease outlive its ttl', async () => {
        const leases = await create()
        const a = await withSkewedClock(() =>
          leases.acquire('long', 'worker-a', 500)
        )
        assert.ok(
          a!.expiresAt.getTime() < Date.now() + HOUR / 2,
          'expiresAt was read off the worker clock'
        )
        await new Promise((r) => setTimeout(r, 1_500))

        assert.ok(
          await leases.acquire('long', 'worker-b', 60_000),
          'a lease written by a fast clock stayed live past its ttl'
        )
      })

      test('a refresh on a fast clock does not stretch the lease', async () => {
        const leases = await create()
        const a = await leases.acquire('refreshed', 'worker-a', 60_000)
        const refreshed = await withSkewedClock(() => leases.refresh(a!, 500))
        assert.ok(refreshed!.expiresAt.getTime() < Date.now() + HOUR / 2)
        await new Promise((r) => setTimeout(r, 1_500))

        assert.equal(await leases.get('refreshed'), null)
      })
    })

    test('the token counter survives the lease it numbered', async () => {
      const leases = await create()
      const a = await leases.acquire('stage', 'a', HOUR)
      await leases.release(a!)
      await leases.acquire('stage', 'a', HOUR).then((b) => leases.release(b!))
      const c = await leases.acquire('stage', 'c', HOUR)
      assert.equal(c?.token, a!.token + 2)
    })

    test('keyPrefix keeps two services apart on one Redis', async () => {
      const one = await create()
      const two = await create()
      assert.ok(await one.acquire('stage', 'a', HOUR))
      assert.equal((await two.acquire('stage', 'b', HOUR))?.token, 1)
    })
  }
)
