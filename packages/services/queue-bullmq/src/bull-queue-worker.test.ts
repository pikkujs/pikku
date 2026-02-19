import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { BullQueueWorkers } from './bull-queue-worker.js'
import { createNoopLogger } from '@pikku/core/services'

describe('BullQueueWorkers', () => {
  test('requires setPikkuFunctionRunner before registerQueues', async () => {
    const workers = new BullQueueWorkers({}, createNoopLogger())

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'BullQueueWorkers requires setPikkuFunctionRunner() before registerQueues()',
    })
  })
})
