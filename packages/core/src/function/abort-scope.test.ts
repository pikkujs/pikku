import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AbandonedError,
  beginChanges,
  getAbortScope,
  runInAbortScope,
  type AbortScope,
} from './abort-scope.js'

describe('beginChanges', () => {
  test('is a no-op outside a scope, so a function need not know how it was called', async () => {
    await beginChanges()
    assert.equal(getAbortScope(), undefined)
  })

  test('lets the mutation proceed while the caller is still there', async () => {
    let declared = false
    const scope: AbortScope = {
      abandoned: false,
      onBeginChanges: () => {
        declared = true
      },
    }

    let mutated = false
    await runInAbortScope(scope, async () => {
      await beginChanges()
      mutated = true
    })

    assert.equal(mutated, true)
    assert.equal(declared, true)
  })

  test('stops the mutation when the caller has gone, and reports why', async () => {
    let mutated = false
    const scope: AbortScope = { abandoned: true, reason: 'speech' }

    await assert.rejects(
      () =>
        runInAbortScope(scope, async () => {
          await beginChanges()
          mutated = true
        }),
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
    // AsyncLocalStorage is the reason this works — the checkpoint is usually
    // several awaits deep inside helpers that never took the scope as an
    // argument.
    const scope: AbortScope = { abandoned: true }
    const nestedHelper = async () => {
      await new Promise((resolve) => setImmediate(resolve))
      await beginChanges()
    }

    await assert.rejects(
      () =>
        runInAbortScope(scope, async () => {
          await new Promise((resolve) => setImmediate(resolve))
          return nestedHelper()
        }),
      AbandonedError
    )
  })

  test('reads the scope live, so an interrupt mid-function is still caught', async () => {
    let aborted = false
    const scope: AbortScope = {
      get abandoned() {
        return aborted
      },
    }

    await assert.rejects(
      () =>
        runInAbortScope(scope, async () => {
          // Plenty of interruptible work happens before the checkpoint.
          await new Promise((resolve) => setImmediate(resolve))
          aborted = true
          await beginChanges()
        }),
      AbandonedError
    )
  })
})
