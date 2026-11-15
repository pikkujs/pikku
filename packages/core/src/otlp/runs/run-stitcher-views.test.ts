import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FinishedSpan, SpanKind } from '../../tracer.js'
import { createTrace } from '../../trace.js'
import { OtlpTracer } from '../otlp-tracer.js'
import {
  createOtlpSinks,
  fanOutOtlp,
  type OpenSpan,
  type OtlpSinkBase,
} from '../otlp-sink.js'
import { createRunStitcher } from './index.js'
import type {
  RunEvent,
  RunSnapshot,
  RunStitcher,
  StitcherOptions,
} from './types.js'
import {
  toOpen,
  nsToMs,
  T0,
  syn,
  collect,
  ofType,
  frames,
  sample,
  mulberry32,
  shuffledBatches,
  emptyState,
  fromSnapshot,
  fold,
  normalise,
} from './stitcher-test-helpers.js'

describe('views carry what the events carry', () => {
  /** Runs the property: every snapshot cut plus the later events equals the whole stream. */
  const assertSnapshotsRebuild = (
    stitcher: RunStitcher,
    batches: { at: bigint; kind: 0 | 1; span: FinishedSpan }[][],
    startFor: (span: FinishedSpan) => boolean
  ) => {
    const events = collect(stitcher)
    const cuts = new Set([0, 4, 19, 77, 150, 250, batches.length - 1])
    const snapshots: RunSnapshot[] = []
    let last = 0
    batches.forEach((batch, i) => {
      for (const f of batch) {
        last = nsToMs(f.at)
        if (f.kind === 0) {
          if (startFor(f.span)) stitcher.start(toOpen(f.span), last)
        } else stitcher.end(f.span, last)
      }
      stitcher.sweep(last)
      if (cuts.has(i)) snapshots.push(stitcher.snapshot(last))
    })
    stitcher.sweep(last + 600_000)
    const whole = fold(emptyState(), events)
    assert.ok(whole.size > 0)
    for (const snapshot of snapshots) {
      const rebuilt = fold(
        fromSnapshot(snapshot),
        events.filter((e) => e.seq > snapshot.seq)
      )
      assert.deepEqual(
        normalise(rebuilt),
        normalise(whole),
        `cut at seq ${snapshot.seq}`
      )
    }
    return { events, whole }
  }

  test('a snapshot plus later events equals the whole stream, attributes, end time, kind and start flag included (starts and ends)', () => {
    const batches = shuffledBatches(frames(sample), 6, mulberry32(7))
    const { whole } = assertSnapshotsRebuild(
      createRunStitcher({ limits: { maxRetained: 1000 } }),
      batches,
      () => true
    )
    const runs = [...whole.values()]
    assert.ok(runs.some((r) => Object.keys(r.attributes).length > 0))
    assert.ok(runs.every((r) => r.endedAt !== undefined))
    assert.ok(runs.some((r) => [...r.hops.values()].some((h) => h.hadStart)))
  })

  test('the same holds when half the spans never send a start frame', () => {
    const batches = shuffledBatches(frames(sample), 6, mulberry32(99))
    const hasStart = (span: FinishedSpan) =>
      parseInt(span.spanId.slice(-1), 16) % 2 === 0
    const { whole } = assertSnapshotsRebuild(
      createRunStitcher({ limits: { maxRetained: 1000 } }),
      batches,
      hasStart
    )
    const hops = [...whole.values()].flatMap((r) => [...r.hops.values()])
    assert.ok(hops.some((h) => h.hadStart))
    assert.ok(hops.some((h) => !h.hadStart))
  })

  test('the same holds past maxSpansPerRun, with every end delivered twice', () => {
    const doubled = frames(sample).flatMap((f) => (f.kind === 1 ? [f, f] : [f]))
    const batches = shuffledBatches(doubled, 6, mulberry32(5))
    const stitcher = createRunStitcher({
      limits: { maxRetained: 1000, maxSpansPerRun: 4 },
    })
    const { events, whole } = assertSnapshotsRebuild(
      stitcher,
      batches,
      () => true
    )
    // the cap really bit: some trace has more spans than 4
    const bySpan = new Map<string, Set<string>>()
    for (const span of sample) {
      const set = bySpan.get(span.traceId) ?? new Set()
      set.add(span.spanId)
      bySpan.set(span.traceId, set)
    }
    assert.ok([...bySpan.values()].some((set) => set.size > 4))
    for (const run of whole.values()) assert.ok(run.hops.size <= 4)
    // no hop is reported twice
    const ends = ofType(events, 'run.hop').filter((e) => e.phase === 'end')
    assert.equal(
      new Set(ends.map((e) => `${e.traceId}|${e.spanId}`)).size,
      ends.length
    )
  })

  test('hadStart is true only for a hop whose start event was sent', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 10 })
    const withStart = syn({
      id: 'a',
      parent: 'root',
      startMs: T0 + 1,
      endMs: T0 + 3,
    })
    const endOnly = syn({
      id: 'b',
      parent: 'root',
      startMs: T0 + 4,
      endMs: T0 + 6,
    })
    stitcher.start(toOpen(root), T0)
    stitcher.start(toOpen(withStart), T0 + 1)
    stitcher.end(withStart, T0 + 3)
    stitcher.end(endOnly, T0 + 6)
    stitcher.end(root, T0 + 10)
    const view = stitcher.snapshot(T0 + 10).recent[0]!
    const flag = (id: string) =>
      view.hops.find((h) => h.spanId === id)?.hadStart
    assert.equal(flag('root'), true)
    assert.equal(flag('a'), true)
    assert.equal(flag('b'), false)
    const starts = ofType(events, 'run.hop')
      .filter((h) => h.phase === 'start')
      .map((h) => h.spanId)
    assert.deepEqual(starts, ['root', 'a'])
  })

  test('queue and workflow wires, user id and the run end time survive a snapshot rebuild', () => {
    const stitcher = createRunStitcher()
    const root = syn({
      id: 'root',
      kind: 'server',
      startMs: T0,
      endMs: T0 + 20,
      attributes: { 'pikku.wire.type': 'http', 'pikku.user.id': 'u-1' },
    })
    const job = syn({
      id: 'job',
      parent: 'root',
      kind: 'consumer',
      startMs: T0 + 2,
      endMs: T0 + 9,
      attributes: {
        'pikku.wire.type': 'queue',
        'messaging.destination.name': 'emails',
      },
    })
    stitcher.end(job, T0 + 9)
    stitcher.end(root, T0 + 20)
    const view = stitcher.snapshot(T0 + 20).recent[0]!
    assert.equal(view.attributes['pikku.user.id'], 'u-1')
    assert.equal(view.attributes['pikku.wire.type'], 'http')
    assert.equal(view.endedAt, T0 + 20)
    assert.equal(view.outcome, 'ok')
    const hop = view.hops.find((h) => h.spanId === 'job')!
    assert.equal(hop.attributes['pikku.wire.type'], 'queue')
    assert.equal(hop.attributes['messaging.destination.name'], 'emails')
  })

  test('an expired run has an end time', () => {
    const stitcher = createRunStitcher({ limits: { ttlMs: 1000 } })
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 5 })
    stitcher.start(toOpen(root), T0)
    stitcher.sweep(T0 + 5000)
    const view = stitcher.snapshot(T0 + 5000).recent[0]!
    assert.equal(view.status, 'expired')
    assert.equal(view.endedAt, T0)
  })

  test('attributes are bounded in count and value length, JSON-safe, and the same in events and views', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const attributes: Record<string, string | number | boolean> = {
      'pikku.wire.id': 'x'.repeat(10_000),
      'pikku.function.duration_ms': Number.NaN,
      'server.port': Number.POSITIVE_INFINITY,
      'pikku.function.version': 3,
      'pikku.impersonated': true,
    }
    for (let i = 0; i < 500; i++) attributes[`db.k${i}`] = i
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 5, attributes })
    stitcher.start(toOpen(root), T0)
    stitcher.end(root, T0 + 5)
    const started = ofType(events, 'run.started')[0]!
    const end = ofType(events, 'run.hop').find((h) => h.phase === 'end')!
    const view = stitcher.snapshot(T0 + 5).recent[0]!
    for (const attrs of [
      started.attributes,
      end.attributes,
      view.attributes,
      view.hops[0]!.attributes,
    ]) {
      assert.ok(Object.keys(attrs).length <= 64)
      for (const value of Object.values(attrs)) {
        if (typeof value === 'string') assert.ok(value.length <= 256)
        if (typeof value === 'number') assert.ok(Number.isFinite(value))
      }
      assert.deepEqual(JSON.parse(JSON.stringify(attrs)), attrs)
    }
    assert.equal(view.attributes['pikku.function.version'], 3)
    assert.equal(view.attributes['pikku.impersonated'], true)
    assert.equal(view.attributes['pikku.function.duration_ms'], undefined)
    assert.deepEqual(view.attributes, started.attributes)
    assert.deepEqual(view.hops[0]!.attributes, end.attributes)
  })

  test('mutating a snapshot never changes the stitcher', () => {
    const stitcher = createRunStitcher()
    const root = syn({
      id: 'root',
      startMs: T0,
      endMs: T0 + 5,
      attributes: { 'pikku.wire.id': 'one' },
    })
    stitcher.end(root, T0 + 5)
    const first = stitcher.snapshot(T0 + 5)
    first.recent[0]!.attributes['pikku.wire.id'] = 'changed'
    first.recent[0]!.hops[0]!.attributes['pikku.wire.id'] = 'changed'
    const second = stitcher.snapshot(T0 + 5)
    assert.equal(second.recent[0]!.attributes['pikku.wire.id'], 'one')
    assert.equal(second.recent[0]!.hops[0]!.attributes['pikku.wire.id'], 'one')
  })
})

describe('the default classify', () => {
  test('a producer span is a boundary: not drawn, its consumer hangs off the nearest hop', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({
      id: 'root',
      kind: 'server',
      startMs: T0,
      endMs: T0 + 10,
    })
    const publish = syn({
      id: 'pub',
      parent: 'root',
      kind: 'producer',
      name: 'queue.publish q',
      startMs: T0 + 1,
      endMs: T0 + 2,
    })
    const job = syn({
      id: 'job',
      parent: 'pub',
      kind: 'consumer',
      startMs: T0 + 3,
      endMs: T0 + 8,
    })
    for (const s of [root, publish, job])
      stitcher.start(toOpen(s), nsToMs(s.startTimeUnixNano))
    for (const s of [publish, job, root])
      stitcher.end(s, nsToMs(s.endTimeUnixNano))
    const hops = ofType(events, 'run.hop')
    assert.ok(hops.every((h) => h.spanId !== 'pub'))
    assert.equal(
      hops.find((h) => h.spanId === 'job' && h.phase === 'end')?.parentSpanId,
      'root'
    )
    assert.deepEqual(
      stitcher.snapshot(T0 + 10).recent[0]!.hops.map((h) => h.spanId),
      ['root', 'job']
    )
  })

  test('a db span stays db even when its kind is producer, and other kinds stay hops', () => {
    const stitcher = createRunStitcher()
    const root = syn({
      id: 'root',
      kind: 'server',
      startMs: T0,
      endMs: T0 + 10,
    })
    const db = syn({
      id: 'db',
      parent: 'root',
      kind: 'producer',
      startMs: T0 + 1,
      endMs: T0 + 2,
      attributes: { 'db.system': 'sqlite' },
    })
    const client = syn({
      id: 'cl',
      parent: 'root',
      kind: 'client',
      startMs: T0 + 3,
      endMs: T0 + 4,
    })
    for (const s of [db, client, root])
      stitcher.end(s, nsToMs(s.endTimeUnixNano))
    const view = stitcher.snapshot(T0 + 10).recent[0]!
    assert.deepEqual(view.hops.map((h) => h.spanId).sort(), ['cl', 'root'])
    assert.equal(view.hops.find((h) => h.spanId === 'root')?.db?.count, 1)
  })
})

describe('start frames give live, per-hop events', () => {
  const trace = () => {
    const root = syn({
      id: 'root',
      kind: 'server',
      startMs: T0,
      endMs: T0 + 30,
    })
    const a = syn({ id: 'a', parent: 'root', startMs: T0 + 5, endMs: T0 + 20 })
    const b = syn({ id: 'b', parent: 'a', startMs: T0 + 8, endMs: T0 + 12 })
    return { root, a, b }
  }

  test('with start frames every hop emits its start the moment it opens, long before the root ends', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const { root, a, b } = trace()
    stitcher.start(toOpen(root), T0)
    assert.deepEqual(
      events.map((e) => e.type),
      ['run.started', 'run.hop']
    )
    stitcher.start(toOpen(a), T0 + 5)
    assert.equal(events.length, 3)
    stitcher.start(toOpen(b), T0 + 8)
    assert.equal(events.length, 4)
    assert.ok(ofType(events, 'run.hop').every((h) => h.phase === 'start'))
    assert.deepEqual(
      ofType(events, 'run.hop').map((h) => h.spanId),
      ['root', 'a', 'b']
    )
    assert.equal(ofType(events, 'run.finished').length, 0)
  })

  test('with ends only nothing is seen until the root ends, then the whole trace arrives in one burst', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const { root, a, b } = trace()
    stitcher.end(b, T0 + 12)
    stitcher.end(a, T0 + 20)
    assert.equal(events.length, 0)
    stitcher.end(root, T0 + 30)
    assert.equal(events.length, 5)
    assert.equal(events[0]!.type, 'run.started')
  })
})
