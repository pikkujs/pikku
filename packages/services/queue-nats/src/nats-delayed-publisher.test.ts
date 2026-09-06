import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { NatsDelayedPublisher } from './nats-delayed-publisher.js'
import {
  ATTEMPTS_HEADER,
  BACKOFF_DELAY_HEADER,
  BACKOFF_TYPE_HEADER,
  NATS_MSG_ID_HEADER,
  PIKKU_USER_ID_HEADER,
  SCHEDULE_HEADER,
  SCHEDULE_SUBJECT_SEGMENT,
  SCHEDULE_TARGET_HEADER,
} from './utils.js'

interface Published {
  subject: string
  payload: string
  headers: Record<string, string>
}

/** Records what would have been published, which is the whole contract here:
 *  the server does the rest, so the headers are the behaviour. */
const fakeJs = (seq = 11) => {
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

describe('NatsDelayedPublisher — schedule headers', () => {
  test('the delay becomes an @at timestamp the server can parse', async () => {
    const { js, published } = fakeJs()
    const before = Date.now()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 60_000)
    const after = Date.now()

    const schedule = published[0]!.headers[SCHEDULE_HEADER]!
    assert.match(schedule, /^@at /)
    const at = new Date(schedule.slice(4)).getTime()
    assert.ok(at >= before + 60_000 && at <= after + 60_000, `@at ${schedule} is out of range`)
  })

  test('the target is the real queue subject, never the schedule subject', async () => {
    // The server rejects a schedule that targets its own subject (10190), and
    // one that did would reproduce itself forever.
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('my.queue', {}, 1_000)
    assert.equal(published[0]!.headers[SCHEDULE_TARGET_HEADER], 'pikku.my_queue')
    assert.notEqual(published[0]!.headers[SCHEDULE_TARGET_HEADER], published[0]!.subject)
  })

  test('the schedule lands under the reserved segment, which nothing consumes', async () => {
    // On a WorkQueue stream an acked schedule is a deleted schedule, so it is
    // load-bearing that no consumer filters this subject.
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 1_000)
    assert.ok(published[0]!.subject.startsWith(`pikku.${SCHEDULE_SUBJECT_SEGMENT}.q.`))
  })

  test('the body is published verbatim, since the server produces it untouched', async () => {
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', { hello: 'world' }, 1_000)
    assert.equal(published[0]!.payload, JSON.stringify({ hello: 'world' }))
  })

  test('the returned id is the schedule message sequence', async () => {
    const { js } = fakeJs(99)
    assert.equal(await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 1), '99')
  })
})

describe('NatsDelayedPublisher — unique subjects', () => {
  test('two delayed jobs on one queue never share a subject', async () => {
    // Republishing to a schedule subject REPLACES the schedule, so a shared
    // subject would make two concurrent delayed jobs silently cancel each other.
    const { js, published } = fakeJs()
    const publisher = new NatsDelayedPublisher(js, 'pikku')
    await publisher.publishAfter('q', { n: 1 }, 1_000)
    await publisher.publishAfter('q', { n: 2 }, 1_000)
    assert.notEqual(published[0]!.subject, published[1]!.subject)
  })
})

describe('NatsDelayedPublisher — job options that survive the delay', () => {
  test('the retry policy is copied onto the schedule, so it reaches the worker', async () => {
    // Every non-schedule header is reproduced verbatim by the server, which is
    // the only way a delayed job keeps its retry policy.
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter(
      'q',
      {},
      1_000,
      { attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
    )
    assert.equal(published[0]!.headers[ATTEMPTS_HEADER], '3')
    assert.equal(published[0]!.headers[BACKOFF_TYPE_HEADER], 'exponential')
    assert.equal(published[0]!.headers[BACKOFF_DELAY_HEADER], '2000')
  })

  test('a string backoff sets a type with no base delay', async () => {
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 1, { backoff: 'fixed' })
    assert.equal(published[0]!.headers[BACKOFF_TYPE_HEADER], 'fixed')
    assert.equal(published[0]!.headers[BACKOFF_DELAY_HEADER], undefined)
  })

  test('pikkuUserId survives the delay', async () => {
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 1, { pikkuUserId: 'u1' })
    assert.equal(published[0]!.headers[PIKKU_USER_ID_HEADER], 'u1')
  })

  test('jobId is dropped rather than carried, in both of its meanings', async () => {
    // As Nats-Msg-Id it could not work: the server strips it when producing the
    // target message, so it never reaches the stream's dedupe window. As the
    // schedule subject it would be actively wrong — a shared subject replaces
    // the schedule, so two delayed jobs with one jobId would cancel each other.
    const { js, published } = fakeJs()
    const publisher = new NatsDelayedPublisher(js, 'pikku')
    await publisher.publishAfter('q', {}, 1_000, { jobId: 'same' })
    await publisher.publishAfter('q', {}, 1_000, { jobId: 'same' })
    assert.equal(published[0]!.headers[NATS_MSG_ID_HEADER], undefined)
    assert.notEqual(published[0]!.subject, published[1]!.subject)
  })

  test('the delay itself is not copied through as a job option', async () => {
    const { js, published } = fakeJs()
    await new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 1_000, { delay: 1_000 })
    assert.equal(published[0]!.headers['Pikku-Delay'], undefined)
  })

  test('an unenforceable attempts value is refused instead of retrying forever', async () => {
    const { js } = fakeJs()
    await assert.rejects(
      () => new NatsDelayedPublisher(js, 'pikku').publishAfter('q', {}, 1, { attempts: 0 }),
      { message: /not a positive integer/ },
    )
  })
})
