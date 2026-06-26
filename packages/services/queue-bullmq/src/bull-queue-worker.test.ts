import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { BullQueueWorkers } from './bull-queue-worker.js'

describe('BullQueueWorkers', () => {
  test('requires a logger (explicit or from singleton services)', async () => {
    const workers = new BullQueueWorkers({})

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'Logger is required for registerQueues — pass it explicitly or ensure singleton services are initialized first',
    })
  })
})
