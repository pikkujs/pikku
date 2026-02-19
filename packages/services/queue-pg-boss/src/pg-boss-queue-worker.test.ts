import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PgBossQueueWorkers } from './pg-boss-queue-worker.js'
import { createNoopLogger } from '@pikku/core/services'

describe('PgBossQueueWorkers', () => {
  test('requires setPikkuFunctionRunner before registerQueues', async () => {
    const workers = new PgBossQueueWorkers({} as any, createNoopLogger())

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'PgBossQueueWorkers requires setPikkuFunctionRunner() before registerQueues()',
    })
  })
})
