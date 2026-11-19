import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createOtlpSinks } from '../otlp-sink.js'
import {
  OTLP_RUNS_SCOPE,
  OTLP_RUNS_TOPIC,
  registerOtlpLive,
  type OtlpLiveClock,
  type OtlpRunsBatch,
} from './live.js'
import { syn, toOpen, T0 } from './stitcher-test-helpers.js'
import type { RunEvent } from './types.js'

const manualClock = (): OtlpLiveClock & {
  tick(): void
  at: number
} => {
  const timers: Array<() => void> = []
  return {
    at: T0,
    now() {
      return this.at
    },
    every(fn) {
      timers.push(fn)
      return () => {}
    },
    tick() {
      for (const fn of timers) fn()
    },
  }
}

const setup = (options: { maxQueue?: number; maxBatch?: number } = {}) => {
  const otlpSinks = createOtlpSinks()
  const clock = manualClock()
  const batches: OtlpRunsBatch[] = []
  const live = registerOtlpLive({
    otlpSinks,
    serviceName: 'test',
    publish: (topic, batch) => {
      assert.equal(topic, OTLP_RUNS_TOPIC)
      batches.push(batch)
    },
    clock,
    ...options,
  })
  const sink = otlpSinks.list()[0]
  const published = (): RunEvent[] => batches.flatMap((b) => b.events)
  return { otlpSinks, clock, live, sink, batches, published }
}

const finish = (sink: ReturnType<typeof setup>['sink'], id: string) => {
  const span = syn({ id, trace: id, startMs: T0, endMs: T0 + 5 })
  sink.onSpanStart?.(toOpen(span))
  sink.exportSpans([span])
}

describe('registerOtlpLive', () => {
  test('a full queue drops its oldest frame and counts it', () => {
    const { live, sink } = setup({ maxQueue: 2 })
    for (const id of ['a', 'b', 'c']) {
      sink.onSpanStart?.(toOpen(syn({ id, trace: id, startMs: T0 })))
    }
    assert.deepEqual(live.stats(), {
      queued: 2,
      dropped: 1,
      publishFailures: 0,
    })
    const open = live.snapshot().open.map((r) => r.rootSpanId)
    assert.deepEqual(open.sort(), ['b', 'c'])
  })

  test('the snapshot seq is the last seq the stream published', () => {
    const { live, sink, clock, published } = setup()
    finish(sink, 'a')
    clock.tick()
    const seqs = published().map((e) => e.seq)
    assert.ok(seqs.length > 0)
    assert.deepEqual(
      seqs,
      seqs.map((_, i) => seqs[0] + i)
    )
    const snapshot = live.snapshot()
    assert.equal(snapshot.seq, seqs[seqs.length - 1])

    finish(sink, 'b')
    const next = live.snapshot()
    clock.tick()
    const after = published().filter((e) => e.seq > snapshot.seq)
    assert.ok(after.length > 0)
    assert.equal(next.seq, after[after.length - 1].seq)
  })

  test('registering twice on one registry returns the first handle and adds one sink', () => {
    const { otlpSinks, live } = setup()
    const again = registerOtlpLive({
      otlpSinks,
      serviceName: 'test',
      publish: () => {},
    })
    assert.equal(again, live)
    assert.equal(otlpSinks.list().length, 1)
  })

  test('a closed handle is replaced by a fresh registration', () => {
    const { otlpSinks, live } = setup()
    live.close()
    const fresh = registerOtlpLive({
      otlpSinks,
      serviceName: 'test',
      publish: () => {},
    })
    assert.notEqual(fresh, live)
  })

  test('a failing publish is counted and never thrown', () => {
    const otlpSinks = createOtlpSinks()
    const clock = manualClock()
    const live = registerOtlpLive({
      otlpSinks,
      serviceName: 'test',
      publish: () => {
        throw new Error('hub down')
      },
      clock,
    })
    finish(otlpSinks.list()[0], 'a')
    clock.tick()
    assert.ok(live.stats().publishFailures > 0)
  })
})

describe('registerOtlpLive lifecycle', () => {
  test('a maxBatch below one is refused before a sink is attached', () => {
    for (const maxBatch of [0, -1, 1.5, Number.NaN]) {
      const otlpSinks = createOtlpSinks()
      assert.throws(
        () =>
          registerOtlpLive({
            otlpSinks,
            serviceName: 'test',
            publish: () => {},
            maxBatch,
          }),
        /maxBatch/
      )
      assert.equal(otlpSinks.list().length, 0)
    }
  })

  test('the snapshot publishes the update it emits, with no sweep in between', () => {
    const { live, sink, clock, published } = setup()
    finish(sink, 'r')
    clock.tick()
    const dbSpan = syn({
      id: 'd0',
      trace: 'r',
      parent: 'r',
      startMs: T0 + 1,
      endMs: T0 + 6,
      attributes: { 'db.system': 'pg', 'db.operation.name': 'select' },
    })
    sink.exportSpans([dbSpan])

    const snapshot = live.snapshot()

    const last = published()[published().length - 1]
    assert.equal(last.seq, snapshot.seq)
    assert.equal(last.type, 'run.hop')
    assert.equal((last as { phase?: string }).phase, 'update')
  })

  test('flushing the sink publishes what is queued', async () => {
    const { sink, published } = setup()
    finish(sink, 'a')
    assert.equal(published().length, 0)
    await sink.flush()
    assert.ok(published().length > 0)
  })

  test('closing the sink closes the handle and unregisters it', async () => {
    const { otlpSinks, live, sink, published } = setup()
    finish(sink, 'a')
    await sink.close()
    assert.ok(published().length > 0)
    assert.equal(otlpSinks.list().length, 0)
    sink.exportSpans([syn({ id: 'b', trace: 'b', startMs: T0, endMs: T0 + 1 })])
    assert.equal(live.stats().queued, 0)
  })

  test('closing the handle unregisters its sink, and a fresh registration adds one', () => {
    const { otlpSinks, live } = setup()
    live.close()
    assert.equal(otlpSinks.list().length, 0)
    registerOtlpLive({ otlpSinks, serviceName: 'test', publish: () => {} })
    assert.equal(otlpSinks.list().length, 1)
  })
})

describe('failure reporting', () => {
  const logged: string[] = []
  const logger = { warn: (m: unknown) => void logged.push(String(m)) }

  test('a publish failure is logged once, then at most once a minute with its count', () => {
    logged.length = 0
    const otlpSinks = createOtlpSinks()
    const clock = manualClock()
    registerOtlpLive({
      otlpSinks,
      serviceName: 't',
      publish: () => {
        throw new Error('hub down')
      },
      clock,
      logger,
    })
    const sink = otlpSinks.list()[0]!
    finish(sink, 'a')
    clock.tick()
    assert.equal(logged.length, 1)
    assert.match(logged[0]!, /publish failed \(hub down\)/)
    finish(sink, 'b')
    clock.tick()
    assert.equal(logged.length, 1)
    clock.at += 61_000
    finish(sink, 'c')
    clock.tick()
    assert.equal(logged.length, 2)
    assert.match(logged[1]!, /\d+ since the last report/)
  })

  test('dropped frames are logged', () => {
    logged.length = 0
    const otlpSinks = createOtlpSinks()
    const clock = manualClock()
    registerOtlpLive({
      otlpSinks,
      serviceName: 't',
      publish: () => {},
      clock,
      logger,
      maxQueue: 1,
    })
    const sink = otlpSinks.list()[0]!
    finish(sink, 'a')
    finish(sink, 'b')
    clock.tick()
    assert.ok(logged.some((m) => /queue full/.test(m)))
  })
})
