import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { fanOutAnalytics } from './fan-out-analytics.js'
import type { AnalyticsSinkItem } from './fan-out-analytics.js'
import type { ProviderCollectionEntry } from '../provider/provider.types.js'
import type {
  AnalyticsEventSink,
  AnalyticsRecord,
  AnalyticsService,
} from './analytics.types.js'

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

  async write(batch: AnalyticsRecord[]): Promise<void> {
    if (this.fail) throw new Error('destination is down')
    this.batches++
    this.seen.push(...batch)
  }
}

class ThrowsSynchronously implements AnalyticsService {
  write(): Promise<void> {
    throw new Error('a sink with a bug in it')
  }
}

const fallback = new Collector()

const entriesOf = (
  ...items: [AnalyticsEventSink<any>, Record<string, unknown>][]
): ProviderCollectionEntry<AnalyticsSinkItem>[] =>
  items.map(([sink, map], index) => ({
    label: `sink${index}`,
    item: { sink, map },
  }))

describe('fanOutAnalytics', () => {
  test('an event goes to every sink whose map names it', async () => {
    const a = new Collector()
    const b = new Collector()
    const sinks = entriesOf([a, { signedUp: true }], [b, { signedUp: true }])
    await fanOutAnalytics(sinks, fallback).write([record('signedUp')])

    assert.equal(a.seen.length, 1)
    assert.equal(b.seen.length, 1)
  })

  test('fails closed: an event absent from a sink map never reaches it', async () => {
    const all = new Collector()
    const conversions = new Collector()
    const sinks = entriesOf(
      [all, { signedUp: true, checkoutCompleted: true }],
      [conversions, { checkoutCompleted: true }]
    )

    await fanOutAnalytics(sinks, fallback).write([
      record('signedUp'),
      record('checkoutCompleted'),
      record('undeclared'),
    ])

    assert.deepEqual(
      all.seen.map((event) => event.name),
      ['signedUp', 'checkoutCompleted']
    )
    assert.deepEqual(
      conversions.seen.map((event) => event.name),
      ['checkoutCompleted']
    )
  })

  test('a sink with an empty map receives nothing', async () => {
    const sink = new Collector()
    const sinks = entriesOf([sink, {}])
    await fanOutAnalytics(sinks, fallback).write([record('signedUp')])

    assert.equal(sink.batches, 0)
  })

  test('keeps the batch whole for a sink that takes one', async () => {
    const sink = new Collector()
    const sinks = entriesOf([sink, { a: true, b: true }])
    await fanOutAnalytics(sinks, fallback).write([record('a'), record('b')])

    assert.equal(sink.batches, 1, 'a batched destination is called once')
  })

  test('an empty collection writes to the fallback', async () => {
    const logged = new Collector()
    await fanOutAnalytics([], logged).write([record('signedUp')])
    await fanOutAnalytics(undefined, logged).write([record('signedUp')])

    assert.equal(logged.seen.length, 2)
  })

  test('a sink replaces the fallback', async () => {
    const logged = new Collector()
    const sink = new Collector()
    const sinks = entriesOf([sink, { other: true }])
    await fanOutAnalytics(sinks, logged).write([record('signedUp')])

    assert.equal(logged.batches, 0)
  })

  test('the map is handed to the sink once per entry', () => {
    const received: unknown[] = []
    const sink: AnalyticsEventSink<{ signedUp: { vendorName: string } }> = {
      write: async () => {},
      setMap: (map) => void received.push(map),
    }
    const map = { signedUp: { vendorName: 'sign_up' } }
    const sinks = entriesOf([sink, map])
    fanOutAnalytics(sinks, fallback)
    fanOutAnalytics(sinks, fallback)

    assert.deepEqual(received, [map])
  })

  test('an item with no map is refused, naming its label', () => {
    const sinks = [
      { label: 'vendor/bad', item: { sink: new Collector() } as never },
    ]
    assert.throws(
      () => fanOutAnalytics(sinks, fallback),
      /analyticsSinks item 'vendor\/bad' has no map/
    )
  })

  test('a sink throwing synchronously does not cost the others', async () => {
    const healthy = new Collector()
    const sinks = entriesOf(
      [new ThrowsSynchronously(), { signedUp: true }],
      [healthy, { signedUp: true }]
    )

    await assert.rejects(
      () => fanOutAnalytics(sinks, fallback).write([record('signedUp')]),
      (error: Error) => error instanceof AggregateError
    )

    assert.equal(healthy.seen.length, 1)
  })

  test('one destination down does not cost the others their events', async () => {
    const healthy = new Collector()
    const sinks = entriesOf(
      [new Collector(true), { signedUp: true }],
      [healthy, { signedUp: true }]
    )

    await assert.rejects(
      () => fanOutAnalytics(sinks, fallback).write([record('signedUp')]),
      (error: Error) => error instanceof AggregateError
    )

    assert.equal(healthy.seen.length, 1)
  })
})
