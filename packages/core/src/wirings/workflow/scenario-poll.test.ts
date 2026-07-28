import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pollUntil } from './scenario-poll.js'

describe('pollUntil', () => {
  test('answers with the first attempt that produced something', async () => {
    let attempts = 0
    const found = await pollUntil(
      () => {
        attempts++
        return attempts === 3 ? 'ready' : undefined
      },
      { intervalMs: 1 }
    )

    assert.equal(found, 'ready')
    assert.equal(attempts, 3)
  })

  test('gives up at the deadline rather than looping forever', async () => {
    const started = Date.now()
    const found = await pollUntil(() => undefined, {
      timeoutMs: 30,
      intervalMs: 5,
    })

    assert.equal(found, undefined)
    assert.ok(Date.now() - started < 1_000, 'returned promptly')
  })

  test('always attempts at least once, however short the deadline', async () => {
    let attempts = 0
    const found = await pollUntil(
      () => {
        attempts++
        return 'immediate'
      },
      { timeoutMs: 0 }
    )

    assert.equal(attempts, 1)
    assert.equal(found, 'immediate')
  })

  test('awaits an async attempt', async () => {
    const found = await pollUntil(async () => 'awaited', { intervalMs: 1 })
    assert.equal(found, 'awaited')
  })

  test('treats a falsy-but-defined answer as an answer', async () => {
    // `false` is what a "did it happen?" probe returns, and it is a result —
    // only `undefined` means "not yet".
    let attempts = 0
    const found = await pollUntil(
      () => {
        attempts++
        return false
      },
      { timeoutMs: 50, intervalMs: 1 }
    )

    assert.equal(found, false)
    assert.equal(attempts, 1)
  })
})
