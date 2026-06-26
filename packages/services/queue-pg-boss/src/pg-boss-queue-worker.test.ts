import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PgBossQueueWorkers } from './pg-boss-queue-worker.js'

describe('PgBossQueueWorkers', () => {
  test('requires a logger (explicit or from singleton services)', async () => {
    const workers = new PgBossQueueWorkers({} as any)

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'Logger is required for registerQueues — pass it explicitly or ensure singleton services are initialized first',
    })
  })
})
