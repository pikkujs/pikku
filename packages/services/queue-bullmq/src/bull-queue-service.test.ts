import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'

import {
  BullQueueService,
  mapBullJobToRecord,
  mapPikkuJobToBull,
} from './bull-queue-service.js'
import { mapBullJobToQueueJob } from './utils.js'

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

describe('traceparent on a BullMQ job', () => {
  const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`
  const job = (data: unknown) => ({ id: '1', name: 'q', data, opts: {} }) as any

  test('add wraps the payload and the worker unwraps it', async () => {
    const added: any[] = []
    const service = new BullQueueService()
    ;(service as any).createQueue = async () => ({
      add: async (name: string, data: unknown, opts: unknown) => {
        added.push({ name, data, opts })
        return { id: 'job-1' }
      },
    })

    await service.add('q', { n: 1 }, { traceparent })

    assert.notDeepEqual(added[0].data, { n: 1 })
    const mapped = await mapBullJobToQueueJob(
      job(added[0].data),
      undefined,
      new Map()
    )
    assert.deepEqual(mapped.data, { n: 1 })
    assert.equal(mapped.traceparent, traceparent)
  })

  test('a job with no trace stays raw', async () => {
    const added: any[] = []
    const service = new BullQueueService()
    ;(service as any).createQueue = async () => ({
      add: async (_name: string, data: unknown) => {
        added.push(data)
        return { id: 'job-1' }
      },
    })

    await service.add('q', { n: 1 })

    assert.deepEqual(added[0], { n: 1 })
  })

  test('a job enqueued before the envelope still parses', async () => {
    const mapped = await mapBullJobToQueueJob(
      job({ n: 1 }),
      undefined,
      new Map()
    )
    assert.deepEqual(mapped.data, { n: 1 })
    assert.equal(mapped.traceparent, undefined)
  })

  test('pikkuUserId is not carried by this adapter', async () => {
    assert.equal(
      'pikkuUserId' in mapPikkuJobToBull({ pikkuUserId: 'u1' } as any),
      false
    )
    const mapped = await mapBullJobToQueueJob(
      { ...job({ n: 1 }), opts: { pikkuUserId: 'u1' } },
      undefined,
      new Map()
    )
    assert.equal(mapped.pikkuUserId, undefined)
  })
})

describe('BullQueueService connection', () => {
  test('the producer connects to the Redis it was given', async () => {
    const server = createServer((socket) => socket.destroy())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const connected = new Promise<void>((resolve) =>
      server.once('connection', () => resolve())
    )
    const { port } = server.address() as AddressInfo
    const errors = console.error
    console.error = () => {}

    const service = new BullQueueService({
      host: '127.0.0.1',
      port,
      retryStrategy: () => null,
    })
    const added = service.add('connection-test', {}).catch(() => {})
    try {
      await Promise.race([
        connected,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('never connected')), 2000)
        ),
      ])
    } finally {
      console.error = errors
      server.close()
    }
    void added
  })
})
