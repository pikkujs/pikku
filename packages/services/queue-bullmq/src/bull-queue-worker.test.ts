import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { BullQueueWorkers } from './bull-queue-worker.js'

describe('BullQueueWorkers', () => {
  test('requires setJobRunner before registerQueues', async () => {
    const workers = new BullQueueWorkers({})

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'BullQueueWorkers requires setJobRunner() before registerQueues()',
    })
  })
})
