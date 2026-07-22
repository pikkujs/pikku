import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PgBossQueueWorkers,
  mapPikkuWorkerToPgBoss,
} from './pg-boss-queue-worker.js'

describe('PgBossQueueWorkers', () => {
  test('requires a logger (explicit or from singleton services)', async () => {
    const workers = new PgBossQueueWorkers({} as any)

    await assert.rejects(() => workers.registerQueues(), {
      message:
        'Logger is required for registerQueues — pass it explicitly or ensure singleton services are initialized first',
    })
  })
})

describe('mapPikkuWorkerToPgBoss', () => {
  test('parallelism maps to independent workers (localConcurrency), never batch fetching', () => {
    // batchSize: 1 keeps each worker single-job so a slow job can never hold its
    // batch siblings — head-of-line blocking is impossible.
    assert.deepEqual(mapPikkuWorkerToPgBoss(), {
      localConcurrency: 10,
      batchSize: 1,
    })

    assert.deepEqual(mapPikkuWorkerToPgBoss({ batchSize: 25 }), {
      localConcurrency: 25,
      batchSize: 1,
    })
  })

  test('pollInterval is converted from ms to seconds', () => {
    assert.deepEqual(mapPikkuWorkerToPgBoss({ pollInterval: 3000 }), {
      localConcurrency: 10,
      batchSize: 1,
      pollingIntervalSeconds: 3,
    })
  })
})
