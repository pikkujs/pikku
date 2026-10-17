import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { mapBullJobToRecord, mapPikkuJobToBull } from './bull-queue-service.js'

// Same contract as the pg-boss adapter: the workflow's resolved retry policy
// (attempts + backoff) must reach BullMQ. backoff mapping in particular was
// previously dropped, so a step's backoff silently never applied on Redis.
describe('mapPikkuJobToBull — retry mapping', () => {
  test('attempts passes through unchanged (BullMQ uses attempts directly)', () => {
    assert.equal(mapPikkuJobToBull({ attempts: 6 }).attempts, 6)
    assert.equal(mapPikkuJobToBull({ attempts: 1 }).attempts, 1)
  })

  test("string backoff 'exponential' → { type: 'exponential' }", () => {
    assert.deepEqual(
      mapPikkuJobToBull({ attempts: 6, backoff: 'exponential' }).backoff,
      {
        type: 'exponential',
      }
    )
  })

  test('object backoff → { type, delay } (delay stays in ms)', () => {
    assert.deepEqual(
      mapPikkuJobToBull({ attempts: 4, backoff: { type: 'fixed', delay: 250 } })
        .backoff,
      { type: 'fixed', delay: 250 }
    )
  })

  test('no backoff → backoff left unset', () => {
    assert.equal(mapPikkuJobToBull({ attempts: 6 }).backoff, undefined)
  })

  test('no options → empty job options', () => {
    assert.deepEqual(mapPikkuJobToBull(undefined), {})
  })
})

describe('mapBullJobToRecord', () => {
  test('a failed job carries its timings and reason', () => {
    const record = mapBullJobToRecord(
      {
        id: '7',
        attemptsMade: 2,
        opts: { attempts: 3 },
        timestamp: 1000,
        processedOn: 1500,
        finishedOn: 1750,
        failedReason: 'boom',
      } as any,
      'failed'
    )
    assert.deepEqual(record, {
      jobId: '7',
      status: 'failed',
      attemptsMade: 2,
      maxAttempts: 3,
      createdAt: new Date(1000),
      processedAt: new Date(1500),
      finishedAt: new Date(1750),
      durationMs: 250,
      error: 'boom',
    })
  })

  test('a waiting job has no timings or error', () => {
    const record = mapBullJobToRecord(
      { id: '8', attemptsMade: 0, opts: {}, timestamp: 1000 } as any,
      'waiting'
    )
    assert.equal(record.processedAt, null)
    assert.equal(record.durationMs, null)
    assert.equal(record.error, null)
    assert.equal(record.maxAttempts, 1)
  })
})
