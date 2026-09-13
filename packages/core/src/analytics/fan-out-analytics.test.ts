import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { fanOutAnalytics } from './fan-out-analytics.js'
import type { AnalyticsRecord, AnalyticsService } from './analytics.types.js'

const record = (name: string): AnalyticsRecord => ({
  name,
  occurredAt: '2026-09-13T10:00:00.000Z',
  userIdentity: { userId: 'u1' },
  source: 'server',
})

class Collector implements AnalyticsService {
  public seen: AnalyticsRecord[] = []
  public batches = 0
  constructor(public fail = false) {}

  async record(event: AnalyticsRecord): Promise<void> {
    if (this.fail) throw new Error('destination is down')
    this.seen.push(event)
  }

  async write(batch: AnalyticsRecord[]): Promise<void> {
    if (this.fail) throw new Error('destination is down')
    this.batches++
    this.seen.push(...batch)
  }
}

/** No `write`, so the fan-out must fall back to one `record` per event. */
class RecordOnly implements AnalyticsService {
  public seen: AnalyticsRecord[] = []
  async record(event: AnalyticsRecord): Promise<void> {
    this.seen.push(event)
  }
}

describe('fanOutAnalytics', () => {
  test('sends every event to every destination', async () => {
    const a = new Collector()
    const b = new Collector()
    await fanOutAnalytics([a, b]).write!([record('signedUp')])

    assert.equal(a.seen.length, 1)
    assert.equal(b.seen.length, 1)
  })

  test('honours a destination that only implements record', async () => {
    const sink = new RecordOnly()
    await fanOutAnalytics([sink]).write!([record('a'), record('b')])

    assert.deepEqual(
      sink.seen.map((event) => event.name),
      ['a', 'b']
    )
  })

  test('keeps the batch whole for a destination that takes one', async () => {
    const sink = new Collector()
    await fanOutAnalytics([sink]).write!([record('a'), record('b')])

    assert.equal(sink.batches, 1, 'a batched destination is called once')
  })

  test('accepts filters per destination', async () => {
    const all = new Collector()
    const conversions = new Collector()

    await fanOutAnalytics([
      all,
      { service: conversions, accepts: (r) => r.name === 'checkoutCompleted' },
    ]).write!([record('signedUp'), record('checkoutCompleted')])

    assert.equal(all.seen.length, 2)
    assert.deepEqual(
      conversions.seen.map((event) => event.name),
      ['checkoutCompleted']
    )
  })

  test('skips a destination its filter emptied', async () => {
    const sink = new Collector()
    await fanOutAnalytics([{ service: sink, accepts: () => false }]).write!([
      record('signedUp'),
    ])

    assert.equal(sink.batches, 0, 'no destination is called with nothing')
  })

  test('one destination down does not cost the others their events', async () => {
    const healthy = new Collector()
    const down = new Collector(true)

    await assert.rejects(
      () => fanOutAnalytics([down, healthy]).write!([record('signedUp')]),
      (error: Error) => error instanceof AggregateError
    )

    assert.equal(
      healthy.seen.length,
      1,
      'the healthy destination was written before the failure surfaced'
    )
  })
})
