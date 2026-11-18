import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { RateLimitService } from '../../services/rate-limit-service.js'

const HOUR = 60 * 60 * 1000
/** A window a test lets run out, long enough for a real database's round-trips. */
const SHORT = 500
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Conformance suite for `rateLimitService`. Each test gets a fresh service. */
export const defineRateLimitServiceTests = (
  name: string,
  create: () => Promise<RateLimitService>
): void => {
  describe(`RateLimitService [${name}]`, () => {
    test('admits exactly the limit, then refuses', async () => {
      const limiter = await create()
      for (let i = 1; i <= 3; i++) {
        const hit = await limiter.hit('contact', 3, HOUR)
        assert.equal(hit.allowed, true)
        assert.equal(hit.count, i)
        assert.equal(hit.limit, 3)
      }
      const refused = await limiter.hit('contact', 3, HOUR)
      assert.equal(refused.allowed, false)
      assert.equal(refused.count, 3)
    })

    test('a refused hit is not counted', async () => {
      const limiter = await create()
      await limiter.hit('k', 1, HOUR)
      for (let i = 0; i < 5; i++) await limiter.hit('k', 1, HOUR)
      assert.equal((await limiter.hit('k', 1, HOUR)).count, 1)
    })

    test('keys are independent', async () => {
      const limiter = await create()
      await limiter.hit('one', 1, HOUR)
      assert.equal((await limiter.hit('one', 1, HOUR)).allowed, false)
      assert.equal((await limiter.hit('two', 1, HOUR)).allowed, true)
    })

    test('reports when the window ends', async () => {
      const limiter = await create()
      const before = Date.now()
      const hit = await limiter.hit('k', 1, HOUR)
      assert.ok(hit.retryAfterMs > 0 && hit.retryAfterMs <= HOUR)
      assert.ok(hit.resetAt.getTime() >= before + HOUR - 1_000)
      const refused = await limiter.hit('k', 1, HOUR)
      assert.equal(refused.allowed, false)
      assert.ok(refused.retryAfterMs > 0 && refused.retryAfterMs <= HOUR)
      assert.equal(refused.resetAt.getTime(), hit.resetAt.getTime())
    })

    test('a new window opens once the last one ends', async () => {
      const limiter = await create()
      await limiter.hit('k', 1, SHORT)
      assert.equal((await limiter.hit('k', 1, SHORT)).allowed, false)
      await wait(SHORT + 250)
      const next = await limiter.hit('k', 1, SHORT)
      assert.equal(next.allowed, true)
      assert.equal(next.count, 1)
    })

    test('concurrent hits never admit more than the limit', async () => {
      const limiter = await create()
      const hits = await Promise.all(
        Array.from({ length: 50 }, () => limiter.hit('burst', 10, HOUR))
      )
      assert.equal(hits.filter((h) => h.allowed).length, 10)
    })

    test('rejects a limit or window it cannot count against', async () => {
      const limiter = await create()
      await assert.rejects(limiter.hit('k', 0, HOUR), RangeError)
      await assert.rejects(limiter.hit('k', 1.5, HOUR), RangeError)
      await assert.rejects(limiter.hit('k', 1, 0), RangeError)
    })
  })
}
