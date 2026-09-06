import assert from 'node:assert/strict'
import test from 'node:test'
import { headers } from '@nats-io/nats-core'
import type { JsMsg } from '@nats-io/jetstream'
import {
  ATTEMPTS_HEADER,
  BACKOFF_DELAY_HEADER,
  BACKOFF_TYPE_HEADER,
  DEFAULT_BACKOFF_DELAY_MS,
  SCHEDULE_SUBJECT_SEGMENT,
  attemptsFor,
  backoffDelayMs,
  backoffFor,
  consumerNameForQueue,
  queueNameToToken,
  scheduleSubjectFor,
  subjectForQueue,
} from './utils.js'

test('ordinary queue names pass through unchanged', () => {
  assert.equal(
    subjectForQueue('pikku', 'pikku-remote-internal-rpc'),
    'pikku.pikku-remote-internal-rpc',
  )
})

test('subject wildcards in a queue name cannot widen a consumer filter', () => {
  // `>` and `*` are NATS wildcards. Left intact in a filter_subject they would
  // make one queue's consumer match other queues' subjects and steal their
  // messages, so they must never survive into a subject.
  assert.equal(subjectForQueue('pikku', 'evil>'), 'pikku.evil_')
  assert.equal(subjectForQueue('pikku', 'ev*il'), 'pikku.ev_il')
  assert.equal(subjectForQueue('pikku', '>'), 'pikku._')
})

test('dots in a queue name cannot inject extra subject tokens', () => {
  assert.equal(subjectForQueue('pikku', 'a.b.c'), 'pikku.a_b_c')
})

test('whitespace is replaced, since subjects may not contain it', () => {
  assert.equal(queueNameToToken('two words'), 'two_words')
})

test('mapping is stable — the same queue name always resolves the same way', () => {
  assert.equal(queueNameToToken('a.b'), queueNameToToken('a.b'))
  assert.equal(consumerNameForQueue('pikku', 'a.b'), 'pikku_a_b')
})

test('consumer names avoid dots, which NATS rejects in durable names', () => {
  assert.ok(!consumerNameForQueue('pikku', 'some.queue.name').includes('.'))
})

test('a hierarchical prefix is tokenised too, not just the queue name', () => {
  // `app.dispatch` is a valid subject prefix but an invalid durable name —
  // the server rejects the whole consumer if the dot survives.
  assert.equal(consumerNameForQueue('app.dispatch', 'fast'), 'app_dispatch_fast')
  assert.ok(!consumerNameForQueue('app.dispatch.fast', 'a.b').includes('.'))
})

/** Just enough of a JsMsg for the header/delivery-count readers. */
const fakeMsg = (deliveryCount: number, hdrs: Record<string, string> = {}): JsMsg => {
  const h = headers()
  for (const [key, value] of Object.entries(hdrs)) h.set(key, value)
  return { headers: h, info: { deliveryCount } } as unknown as JsMsg
}

test('a schedule subject is stable for a named schedule, so republishing replaces it', () => {
  // The last message on the subject *is* the schedule, so a stable subject is
  // what makes re-registering a changed cron an update rather than a duplicate.
  const first = scheduleSubjectFor('pikku', 'recurring', 'my.task')
  assert.equal(first, scheduleSubjectFor('pikku', 'recurring', 'my.task'))
  assert.equal(first, `pikku.${SCHEDULE_SUBJECT_SEGMENT}.recurring.my_task`)
})

test('an unnamed schedule gets a unique subject, so two delayed jobs cannot overwrite each other', () => {
  const a = scheduleSubjectFor('pikku', 'q')
  const b = scheduleSubjectFor('pikku', 'q')
  assert.notEqual(a, b)
  assert.ok(a.startsWith(`pikku.${SCHEDULE_SUBJECT_SEGMENT}.q.`))
})

test('the schedule segment cannot collide with a queue token', () => {
  // queueNameToToken never introduces a leading underscore, so no queue name
  // can be mistaken for the reserved segment.
  assert.equal(queueNameToToken('schedule').startsWith('_'), false)
  assert.ok(SCHEDULE_SUBJECT_SEGMENT.startsWith('_'))
})

test('no backoff type means no delay — a bare nak, redelivered as fast as the server can', () => {
  assert.equal(backoffDelayMs(1, undefined), 0)
  assert.equal(backoffDelayMs(9, undefined), 0)
})

test('fixed backoff is flat across attempts', () => {
  assert.equal(backoffDelayMs(1, 'fixed', 5_000), 5_000)
  assert.equal(backoffDelayMs(4, 'fixed', 5_000), 5_000)
})

test('exponential backoff doubles per attempt, starting at the base', () => {
  assert.equal(backoffDelayMs(1, 'exponential', 1_000), 1_000)
  assert.equal(backoffDelayMs(2, 'exponential', 1_000), 2_000)
  assert.equal(backoffDelayMs(3, 'exponential', 1_000), 4_000)
})

test('exponential backoff is capped at an hour, so a long retry cannot outgrow any ack_wait reasoning', () => {
  assert.equal(backoffDelayMs(50, 'exponential', 1_000), 60 * 60_000)
})

test('an unrecognised backoff type grows rather than hot-loops', () => {
  // Guessing wrong should mean retrying too slowly, never too fast.
  assert.equal(backoffDelayMs(3, 'nonsense', 1_000), 4_000)
})

test('attemptsFor reads the job\'s own retry limit off the header', () => {
  assert.equal(attemptsFor(fakeMsg(1, { [ATTEMPTS_HEADER]: '3' })), 3)
})

test('an absent or unusable attempts header means no per-job limit', () => {
  // undefined, not 0 — the worker treats a limit of undefined as "no cap",
  // which is the only safe reading of a header that was never set.
  assert.equal(attemptsFor(fakeMsg(1)), undefined)
  assert.equal(attemptsFor(fakeMsg(1, { [ATTEMPTS_HEADER]: 'abc' })), undefined)
  assert.equal(attemptsFor(fakeMsg(1, { [ATTEMPTS_HEADER]: '0' })), undefined)
  assert.equal(attemptsFor(fakeMsg(1, { [ATTEMPTS_HEADER]: '-2' })), undefined)
})

test('backoffFor combines the message headers with its delivery count', () => {
  const msg = fakeMsg(3, {
    [BACKOFF_TYPE_HEADER]: 'exponential',
    [BACKOFF_DELAY_HEADER]: '500',
  })
  assert.equal(backoffFor(msg), 2_000)
})

test('a backoff type with no base delay falls back to the default base', () => {
  const msg = fakeMsg(1, { [BACKOFF_TYPE_HEADER]: 'fixed' })
  assert.equal(backoffFor(msg), DEFAULT_BACKOFF_DELAY_MS)
})

test('a message with no backoff headers is redelivered immediately', () => {
  assert.equal(backoffFor(fakeMsg(2)), 0)
})
