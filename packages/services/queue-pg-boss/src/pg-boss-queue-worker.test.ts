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

  test('groupConcurrency caps how much of the worker one group can take', () => {
    assert.deepEqual(mapPikkuWorkerToPgBoss({ groupConcurrency: 2 }), {
      localConcurrency: 10,
      batchSize: 1,
      localGroupConcurrency: 2,
    })
  })

  test('tiered groupConcurrency passes tiers through', () => {
    assert.deepEqual(
      mapPikkuWorkerToPgBoss({
        batchSize: 20,
        groupConcurrency: { default: 2, tiers: { slowWorkflow: 1 } },
      }),
      {
        localConcurrency: 20,
        batchSize: 1,
        localGroupConcurrency: { default: 2, tiers: { slowWorkflow: 1 } },
      }
    )
  })

  test('group limits are clamped to the worker concurrency', () => {
    // pg-boss asserts every group limit is <= localConcurrency and throws at
    // worker start otherwise — clamp so an over-eager config degrades to "this
    // group may use the whole worker" instead of failing to start.
    assert.deepEqual(
      mapPikkuWorkerToPgBoss({
        batchSize: 4,
        groupConcurrency: { default: 10, tiers: { greedy: 99 } },
      }),
      {
        localConcurrency: 4,
        batchSize: 1,
        localGroupConcurrency: { default: 4, tiers: { greedy: 4 } },
      }
    )

    assert.deepEqual(
      mapPikkuWorkerToPgBoss({ batchSize: 3, groupConcurrency: 8 }),
      { localConcurrency: 3, batchSize: 1, localGroupConcurrency: 3 }
    )
  })

  test('no group config means no group limits', () => {
    assert.equal(
      'localGroupConcurrency' in mapPikkuWorkerToPgBoss({ batchSize: 5 }),
      false
    )
  })
})
