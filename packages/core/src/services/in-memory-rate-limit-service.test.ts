import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineServiceTests } from '../testing/service-tests.js'
import { InMemoryRateLimitService } from './in-memory-rate-limit-service.js'

defineServiceTests({
  name: 'in-memory',
  services: { rateLimitService: async () => new InMemoryRateLimitService() },
})

describe('InMemoryRateLimitService clock', () => {
  test('the window follows the injected clock', async () => {
    let now = 1_000
    const limiter = new InMemoryRateLimitService(() => now)

    assert.equal((await limiter.hit('k', 2, 10_000)).retryAfterMs, 10_000)
    now = 4_000
    const second = await limiter.hit('k', 2, 10_000)
    assert.equal(second.allowed, true)
    assert.equal(second.retryAfterMs, 7_000)
    assert.equal((await limiter.hit('k', 2, 10_000)).allowed, false)

    now = 11_000
    const reopened = await limiter.hit('k', 2, 10_000)
    assert.equal(reopened.allowed, true)
    assert.equal(reopened.count, 1)
    assert.equal(reopened.resetAt.getTime(), 21_000)
  })

  test('a refused hit does not move the window', async () => {
    let now = 0
    const limiter = new InMemoryRateLimitService(() => now)
    const first = await limiter.hit('k', 1, 1_000)
    now = 900
    const refused = await limiter.hit('k', 1, 1_000)
    assert.equal(refused.allowed, false)
    assert.equal(refused.resetAt.getTime(), first.resetAt.getTime())
    now = 1_000
    assert.equal((await limiter.hit('k', 1, 1_000)).allowed, true)
  })

  test('expired windows are swept so keys do not pile up', async () => {
    let now = 0
    const limiter = new InMemoryRateLimitService(() => now)
    for (let i = 0; i < 10_000; i++) await limiter.hit(`k${i}`, 1, 1_000)
    now = 2_000
    await limiter.hit('fresh', 1, 1_000)
    assert.equal((limiter as any).windows.size, 1)
  })
})
