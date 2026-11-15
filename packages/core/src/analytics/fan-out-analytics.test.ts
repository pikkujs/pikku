import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { createAnalyticsSinks, fanOutAnalytics } from './fan-out-analytics.js'
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

describe('fanOutAnalytics', () => {
  test('an event goes to every sink whose map names it', async () => {
    const a = new Collector()
    const b = new Collector()
    const sinks = createAnalyticsSinks()
    sinks.add(a, { signedUp: true })
    sinks.add(b, { signedUp: true })
    await fanOutAnalytics(sinks, fallback).write([record('signedUp')])

    assert.equal(a.seen.length, 1)
    assert.equal(b.seen.length, 1)
  })

  test('fails closed: an event absent from a sink map never reaches it', async () => {
    const all = new Collector()
    const conversions = new Collector()
    const sinks = createAnalyticsSinks()
    sinks.add(all, { signedUp: true, checkoutCompleted: true })
    sinks.add(conversions, { checkoutCompleted: true })

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
    const sinks = createAnalyticsSinks()
    sinks.add(sink, {})
    await fanOutAnalytics(sinks, fallback).write([record('signedUp')])

    assert.equal(sink.batches, 0)
  })

  test('keeps the batch whole for a sink that takes one', async () => {
    const sink = new Collector()
    const sinks = createAnalyticsSinks()
    sinks.add(sink, { a: true, b: true })
    await fanOutAnalytics(sinks, fallback).write([record('a'), record('b')])

    assert.equal(sink.batches, 1, 'a batched destination is called once')
  })

  test('an empty registry writes to the fallback', async () => {
    const logged = new Collector()
    await fanOutAnalytics(createAnalyticsSinks(), logged).write([
      record('signedUp'),
    ])
    await fanOutAnalytics(undefined, logged).write([record('signedUp')])

    assert.equal(logged.seen.length, 2)
  })

  test('a registered sink replaces the fallback', async () => {
    const logged = new Collector()
    const sink = new Collector()
    const sinks = createAnalyticsSinks()
    sinks.add(sink, { other: true })
    await fanOutAnalytics(sinks, logged).write([record('signedUp')])

    assert.equal(logged.batches, 0)
  })

  test('a sink added after the fan-out was built still receives events', async () => {
    const sinks = createAnalyticsSinks()
    const fan = fanOutAnalytics(sinks, fallback)
    const late = new Collector()
    sinks.add(late, { signedUp: true })
    await fan.write([record('signedUp')])

    assert.equal(late.seen.length, 1)
  })

  test('add hands the map to the sink', () => {
    const received: unknown[] = []
    const sink: AnalyticsEventSink<{ signedUp: { vendorName: string } }> = {
      write: async () => {},
      setMap: (map) => void received.push(map),
    }
    const map = { signedUp: { vendorName: 'sign_up' } }
    createAnalyticsSinks().add(sink, map)

    assert.deepEqual(received, [map])
  })

  test('a sink throwing synchronously does not cost the others', async () => {
    const healthy = new Collector()
    const sinks = createAnalyticsSinks()
    sinks.add(new ThrowsSynchronously(), { signedUp: true })
    sinks.add(healthy, { signedUp: true })

    await assert.rejects(
      () => fanOutAnalytics(sinks, fallback).write([record('signedUp')]),
      (error: Error) => error instanceof AggregateError
    )

    assert.equal(healthy.seen.length, 1)
  })

  test('one destination down does not cost the others their events', async () => {
    const healthy = new Collector()
    const sinks = createAnalyticsSinks()
    sinks.add(new Collector(true), { signedUp: true })
    sinks.add(healthy, { signedUp: true })

    await assert.rejects(
      () => fanOutAnalytics(sinks, fallback).write([record('signedUp')]),
      (error: Error) => error instanceof AggregateError
    )

    assert.equal(healthy.seen.length, 1)
  })
})
