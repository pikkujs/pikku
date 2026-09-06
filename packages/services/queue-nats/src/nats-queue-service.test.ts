import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { NatsQueueService, type DelayedPublisher } from './nats-queue-service.js'
import {
  ATTEMPTS_HEADER,
  BACKOFF_DELAY_HEADER,
  BACKOFF_TYPE_HEADER,
  NATS_MSG_ID_HEADER,
  PIKKU_USER_ID_HEADER,
} from './utils.js'

interface Published {
  subject: string
  payload: string
  headers: Record<string, string>
}

/**
 * Minimal JetStream client: records what would have been published and hands
 * back a sequence, which is all `add` reads off the ack.
 */
const fakeJs = (seq = 7) => {
  const published: Published[] = []
  const js = {
    publish: async (subject: string, payload: string, opts?: any) => {
      const hdrs: Record<string, string> = {}
      for (const [key] of opts?.headers ?? []) {
        hdrs[key] = opts.headers.get(key)
      }
      published.push({ subject, payload, headers: hdrs })
      return { seq }
    },
  }
  return { js: js as any, published }
}

describe('NatsQueueService — result support', () => {
  test('supportsResults is false, because an acked message is gone', () => {
    const { js } = fakeJs()
    assert.equal(new NatsQueueService(js, 'pikku').supportsResults, false)
  })

  test('getJob returns null rather than throwing, so optional polling still works', async () => {
    const { js } = fakeJs()
    assert.equal(await new NatsQueueService(js, 'pikku').getJob('q', '1'), null)
  })
})

describe('NatsQueueService.add — publish target and identity', () => {
  test('the job lands on the queue subject with a JSON body', async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('my.queue', { a: 1 })
    assert.equal(published[0]!.subject, 'pikku.my_queue')
    assert.equal(published[0]!.payload, JSON.stringify({ a: 1 }))
  })

  test('the returned id is the stream sequence, not the caller jobId', async () => {
    const { js } = fakeJs(42)
    const id = await new NatsQueueService(js, 'pikku').add('q', {}, { jobId: 'mine' })
    assert.equal(id, '42')
  })
})

describe('NatsQueueService.add — headers', () => {
  test('jobId becomes Nats-Msg-Id, which is what JetStream dedupes on', async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('q', {}, { jobId: 'singleton-key' })
    assert.equal(published[0]!.headers[NATS_MSG_ID_HEADER], 'singleton-key')
  })

  test('pikkuUserId rides along so the worker can restore the session', async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('q', {}, { pikkuUserId: 'user-1' })
    assert.equal(published[0]!.headers[PIKKU_USER_ID_HEADER], 'user-1')
  })

  test('attempts travels per-job, since max_deliver is only per-consumer', async () => {
    // The workflow engine sets attempts per step and uses 1 to mean "never
    // retry"; a per-consumer max_deliver cannot express that, so it must be a
    // header the worker enforces.
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('q', {}, { attempts: 1 })
    assert.equal(published[0]!.headers[ATTEMPTS_HEADER], '1')
  })

  test("string backoff sets a type with no base delay", async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('q', {}, { backoff: 'exponential' })
    assert.equal(published[0]!.headers[BACKOFF_TYPE_HEADER], 'exponential')
    assert.equal(published[0]!.headers[BACKOFF_DELAY_HEADER], undefined)
  })

  test('object backoff sets both the type and the base delay in ms', async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add(
      'q',
      {},
      { backoff: { type: 'fixed', delay: 5_000 } },
    )
    assert.equal(published[0]!.headers[BACKOFF_TYPE_HEADER], 'fixed')
    assert.equal(published[0]!.headers[BACKOFF_DELAY_HEADER], '5000')
  })

  test('no options means no pikku headers at all', async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('q', {})
    assert.deepEqual(published[0]!.headers, {})
  })
})

describe('NatsQueueService.add — delay', () => {
  test('a delay is handed to the delayed publisher, not published inline', async () => {
    const { js, published } = fakeJs()
    const seen: Array<[string, unknown, number]> = []
    const publisher: DelayedPublisher = {
      publishAfter: async (queueName, data, delayMs) => {
        seen.push([queueName, data, delayMs])
        return 'delayed-id'
      },
    }
    const service = new NatsQueueService(js, 'pikku')
    service.setDelayedPublisher(publisher)

    const id = await service.add('q', { a: 1 }, { delay: 60_000 })
    assert.equal(id, 'delayed-id')
    assert.deepEqual(seen, [['q', { a: 1 }, 60_000]])
    assert.equal(published.length, 0, 'nothing may be published immediately')
  })

  test('a delay with no publisher throws instead of firing immediately', async () => {
    // Silently dropping the delay would turn a one-hour workflow.sleep() into a
    // zero-second one and an exponential backoff into a hot retry loop.
    const { js } = fakeJs()
    await assert.rejects(() => new NatsQueueService(js, 'pikku').add('q', {}, { delay: 1_000 }), {
      message: /no delayedPublisher is configured/,
    })
  })

  test('delay: 0 is not a delay — it publishes inline', async () => {
    const { js, published } = fakeJs()
    await new NatsQueueService(js, 'pikku').add('q', {}, { delay: 0 })
    assert.equal(published.length, 1)
  })
})
