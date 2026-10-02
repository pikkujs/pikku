import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { AbandonedError, beginChanges, type AbortScope } from './abort-scope.js'

describe('beginChanges', () => {
  test('is a no-op without a scope, so a function need not know how it was called', async () => {
    await beginChanges()
    await beginChanges(undefined)
  })

  test('lets the mutation proceed while the caller is still there', async () => {
    let declared = false
    const scope: AbortScope = {
      abandoned: false,
      onBeginChanges: () => {
        declared = true
      },
    }

    await beginChanges(scope)

    assert.equal(declared, true)
  })

  test('stops the mutation when the caller has gone, and reports why', async () => {
    let mutated = false
    const scope: AbortScope = { abandoned: true, reason: 'speech' }

    await assert.rejects(
      async () => {
        await beginChanges(scope)
        mutated = true
      },
      (error: unknown) => {
        assert.ok(error instanceof AbandonedError)
        assert.match(error.message, /speech/)
        return true
      }
    )

    // The whole point: the irreversible line never ran.
    assert.equal(mutated, false)
  })

  test('survives the await boundaries a real function has', async () => {
    // The scope is a plain value handed down, so await depth is irrelevant.
    const scope: AbortScope = { abandoned: true }
    const nestedHelper = async () => {
      await new Promise((resolve) => setImmediate(resolve))
      await beginChanges(scope)
    }

    await assert.rejects(async () => {
      await new Promise((resolve) => setImmediate(resolve))
      return nestedHelper()
    }, AbandonedError)
  })

  test('reads the scope live, so an interrupt mid-function is still caught', async () => {
    let aborted = false
    const scope: AbortScope = {
      get abandoned() {
        return aborted
      },
    }

    await assert.rejects(async () => {
      // Plenty of interruptible work happens before the checkpoint.
      await new Promise((resolve) => setImmediate(resolve))
      aborted = true
      await beginChanges(scope)
    }, AbandonedError)
  })

  test('interleaved calls with different scopes do not cross-talk', async () => {
    const gone: AbortScope = { abandoned: true }
    const here: AbortScope = { abandoned: false }
    const run = async (scope: AbortScope) => {
      await new Promise((resolve) => setImmediate(resolve))
      await beginChanges(scope)
      return 'ok'
    }

    const [a, b] = await Promise.allSettled([run(gone), run(here)])
    assert.equal(a.status, 'rejected')
    assert.equal(b.status, 'fulfilled')
  })
})
