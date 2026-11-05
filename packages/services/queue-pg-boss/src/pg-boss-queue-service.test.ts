import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PgBossQueueService,
  mapPikkuJobToPgBoss,
} from './pg-boss-queue-service.js'
import { runQueueJob } from '@pikku/core/queue'
import { defineQueueIdentityTransportTests } from '@pikku/core/testing'

import { mapPgBossJobToQueueJob } from './utils.js'

// These guard the contract the workflow engine relies on: a step's resolved
// retry policy (attempts + backoff) must survive translation into pg-boss
// terms, so "workflow owns retries" actually reaches the queue.
describe('mapPikkuJobToPgBoss — retry mapping', () => {
  test('attempts → retryLimit (attempts - 1)', () => {
    // Default policy: 5 retries → 6 attempts → retryLimit 5.
    assert.equal(mapPikkuJobToPgBoss({ attempts: 6 }).retryLimit, 5)
  })

  test('attempts: 1 (retries: 0) → retryLimit 0 (pg-boss never re-runs it)', () => {
    assert.equal(mapPikkuJobToPgBoss({ attempts: 1 }).retryLimit, 0)
  })

  test("backoff 'exponential' → retryBackoff true + 1s base delay", () => {
    const opts = mapPikkuJobToPgBoss({ attempts: 6, backoff: 'exponential' })
    assert.equal(opts.retryBackoff, true)
    // pg-boss multiplies retry_delay by 2^n and the queue default is 0 —
    // without a base, "exponential" retries all fire immediately.
    assert.equal(opts.retryDelay, 1)
  })

  test('sub-second fixed delay rounds up to 1s, not down to immediate', () => {
    const opts = mapPikkuJobToPgBoss({
      attempts: 4,
      backoff: { type: 'fixed', delay: 300 },
    })
    assert.equal(opts.retryDelay, 1)
  })

  test('fixed backoff → retryBackoff false + retryDelay in seconds', () => {
    const opts = mapPikkuJobToPgBoss({
      attempts: 4,
      backoff: { type: 'fixed', delay: 5000 },
    })
    assert.equal(opts.retryBackoff, false)
    // pg-boss takes seconds; our delay is milliseconds.
    assert.equal(opts.retryDelay, 5)
  })

  test('exponential object backoff → retryBackoff true + retryDelay in seconds', () => {
    const opts = mapPikkuJobToPgBoss({
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
    })
    assert.equal(opts.retryBackoff, true)
    assert.equal(opts.retryDelay, 2)
  })

  test('no options → no retry fields set', () => {
    const opts = mapPikkuJobToPgBoss(undefined)
    assert.equal(opts.retryLimit, undefined)
    assert.equal(opts.retryBackoff, undefined)
  })
})

describe('mapPikkuJobToPgBoss — group mapping', () => {
  test('group id is forwarded so the worker can enforce a per-group limit', () => {
    assert.deepEqual(
      mapPikkuJobToPgBoss({ group: { id: 'deployWorkflow' } }).group,
      { id: 'deployWorkflow' }
    )
  })

  test('tier is only set when provided', () => {
    const opts = mapPikkuJobToPgBoss({
      group: { id: 'deployWorkflow', tier: 'slow' },
    })
    assert.deepEqual(opts.group, { id: 'deployWorkflow', tier: 'slow' })
    assert.equal(
      'tier' in mapPikkuJobToPgBoss({ group: { id: 'a' } }).group!,
      false
    )
  })

  test('no group → no group field', () => {
    assert.equal(mapPikkuJobToPgBoss({ attempts: 2 }).group, undefined)
  })
})

describe('traceparent on a pg-boss job', () => {
  const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`
  const row = (data: unknown) =>
    ({ id: '1', name: 'q', data, state: 'active' }) as any

  const capture = () => {
    const sent: unknown[] = []
    const service = new PgBossQueueService({
      createQueue: async () => {},
      send: async (_queue: string, data: unknown) => {
        sent.push(data)
        return 'job-1'
      },
    } as any)
    return { service, sent }
  }

  test('add wraps the payload and the worker unwraps it', async () => {
    const { service, sent } = capture()
    await service.add('q', { n: 1 }, { traceparent })

    assert.notDeepEqual(sent[0], { n: 1 })
    const mapped = mapPgBossJobToQueueJob(row(sent[0]), {} as any)
    assert.deepEqual(mapped.data, { n: 1 })
    assert.equal(mapped.traceparent, traceparent)
  })

  test('a job with no trace stays raw', async () => {
    const { service, sent } = capture()
    await service.add('q', { n: 1 })
    assert.deepEqual(sent[0], { n: 1 })
  })

  test('a job enqueued before the envelope still parses', () => {
    const mapped = mapPgBossJobToQueueJob(row({ n: 1 }), {} as any)
    assert.deepEqual(mapped.data, { n: 1 })
    assert.equal(mapped.traceparent, undefined)
  })

  test('pikkuUserId travels in the envelope and not in the job options', () => {
    assert.equal(
      'pikkuUserId' in mapPikkuJobToPgBoss({ pikkuUserId: 'u1' } as any),
      false
    )
    const mapped = mapPgBossJobToQueueJob(
      { ...row({ n: 1 }), pikkuUserId: 'u1' },
      {} as any
    )
    assert.equal(mapped.pikkuUserId, undefined)
  })
})

const sent: unknown[] = []

defineQueueIdentityTransportTests('pg-boss', () => ({
  queueService: new PgBossQueueService({
    createQueue: async () => {},
    send: async (_queue: string, data: unknown) => {
      // The job table keeps JSON.
      sent.push(JSON.parse(JSON.stringify(data)))
      return `job-${sent.length}`
    },
  } as any),
  deliver: async () => {
    for (const data of sent.splice(0)) {
      await runQueueJob({
        job: mapPgBossJobToQueueJob(
          { id: '1', name: 'identity-transport', data, state: 'active' } as any,
          {} as any
        ),
      })
    }
  },
}))
