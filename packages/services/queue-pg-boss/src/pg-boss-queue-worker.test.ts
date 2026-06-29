import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PgBossQueueWorkers } from './pg-boss-queue-worker.js'

describe('PgBossQueueWorkers', () => {
  test('requires setJobRunner before registerQueues', async () => {
    const workers = new PgBossQueueWorkers({} as any)

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'PgBossQueueWorkers requires setJobRunner() before registerQueues()',
    })
  })
})
