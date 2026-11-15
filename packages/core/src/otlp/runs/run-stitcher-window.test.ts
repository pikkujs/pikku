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
  denied,
} from './stitcher-test-helpers.js'

describe('health window: order and the clock domain', () => {
  // Time base: `at` of a sample is the span's end time, `nowMs` is the caller's clock. They must be one domain (unix ms);
  // these tests use it, and the docs say so.
  const fn = { 'pikku.function.id': 'f' }

  test('samples that arrive out of order never count a stale entry', () => {
    const stitcher = createRunStitcher({ limits: { healthWindowMs: 1000 } })
    stitcher.end(
      syn({ id: 'ra', trace: 'a', startMs: 4900, endMs: 5000, attributes: fn }),
      5000
    )
    stitcher.end(
      syn({ id: 'rb', trace: 'b', startMs: 0, endMs: 10, attributes: fn }),
      5000
    )
    stitcher.end(
      syn({ id: 'rc', trace: 'c', startMs: 0, endMs: 10, attributes: fn }),
      5000
    )
    const entries = stitcher.snapshot(5500).health.entries
    assert.deepEqual(
      entries.map((e) => [e.key, e.runs]),
      [['f', 1]]
    )
  })

  test('a sample in the future of the clock is not counted until the clock reaches it', () => {
    const stitcher = createRunStitcher({ limits: { healthWindowMs: 1000 } })
    stitcher.end(
      syn({ id: 'ra', trace: 'a', startMs: 4000, endMs: 4100, attributes: fn }),
      4100
    )
    stitcher.end(
      syn({ id: 'rb', trace: 'b', startMs: 5000, endMs: 5100, attributes: fn }),
      4100
    )
    assert.equal(stitcher.snapshot(4200).health.entries[0]!.runs, 1)
    assert.equal(stitcher.snapshot(5100).health.entries[0]!.runs, 2)
  })

  test('an unchanged window is not re-emitted by sweep, and a change is', () => {
    const stitcher = createRunStitcher({ limits: { healthWindowMs: 1000 } })
    const events = collect(stitcher)
    stitcher.end(
      syn({ id: 'ra', trace: 'a', startMs: 100, endMs: 200, attributes: fn }),
      200
    )
    for (const now of [210, 220, 230, 240]) stitcher.sweep(now)
    assert.equal(ofType(events, 'health').length, 1)
    stitcher.sweep(1300) // the sample leaves the window
    assert.equal(ofType(events, 'health').length, 2)
    assert.deepEqual(ofType(events, 'health')[1]!.entries, [])
  })

  test('the busiest-key bound drops the least recently recorded key, not the first one seen', () => {
    const stitcher = createRunStitcher({
      limits: { healthWindowMs: 1_000_000 },
    })
    stitcher.end(
      syn({
        id: 'hot',
        trace: 'hot',
        startMs: 0,
        endMs: 1,
        attributes: { 'pikku.function.id': 'hot' },
      }),
      1
    )
    for (let i = 0; i < 2100; i++) {
      stitcher.end(
        syn({
          id: `k${i}`,
          // fixed width: syn pads trace ids with zeros, so `k1` and `k10` would otherwise be one trace
          trace: `k${String(i).padStart(5, '0')}`,
          startMs: 0,
          endMs: 2,
          attributes: { 'pikku.function.id': `k${i}` },
        }),
        2
      )
      if (i % 100 === 0 && i < 1600)
        stitcher.end(
          syn({
            id: `h${i}`,
            trace: `h${String(i).padStart(5, '0')}`,
            startMs: 0,
            endMs: 3,
            attributes: { 'pikku.function.id': 'hot' },
          }),
          3
        )
    }
    const entries = stitcher.snapshot(10).health.entries
    // the cap was really reached, and the busy key survived it
    assert.equal(entries.length, 2000)
    assert.ok(entries.some((e) => e.key === 'hot'))
    // the oldest never-refreshed key went; the newest stayed
    assert.ok(!entries.some((e) => e.key === 'k0'))
    assert.ok(entries.some((e) => e.key === 'k2099'))
  })
})

describe('attributes: default-deny, the exporter allow-list', () => {
  test('a custom attribute never reaches an event or a view; the allow-listed ones do', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({
      id: 'root',
      startMs: T0,
      endMs: T0 + 5,
      attributes: {
        'pikku.wire.type': 'http',
        'pikku.user.id': 'user-7',
        'customer.email': 'someone@example.com',
        password: 'hunter2',
        'db.namespace': 'main',
      },
    })
    stitcher.start(toOpen(root), T0)
    stitcher.end(root, T0 + 5)
    const attrs = [
      ofType(events, 'run.started')[0]!.attributes,
      ofType(events, 'run.hop').find((h) => h.phase === 'start')!.attributes,
      ofType(events, 'run.hop').find((h) => h.phase === 'end')!.attributes,
      stitcher.snapshot(T0 + 5).recent[0]!.attributes,
    ]
    for (const a of attrs) {
      assert.equal(a['customer.email'], undefined)
      assert.equal(a['password'], undefined)
      assert.equal(a['pikku.user.id'], 'user-7')
      assert.equal(a['pikku.wire.type'], 'http')
      // the exporter's plugin prefix (db.*) is kept, as it is there
      assert.equal(a['db.namespace'], 'main')
    }
  })

  test('the 64-entry cap cannot drop a pikku.* key, however many other keys come first', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const attributes: Record<string, string | number | boolean> = {}
    for (let i = 0; i < 200; i++) attributes[`db.k${i}`] = i
    attributes['pikku.wire.type'] = 'http'
    attributes['pikku.user.id'] = 'user-9'
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 5, attributes })
    stitcher.start(toOpen(root), T0)
    stitcher.end(root, T0 + 5)
    const started = ofType(events, 'run.started')[0]!.attributes
    assert.ok(Object.keys(started).length <= 64)
    assert.equal(started['pikku.wire.type'], 'http')
    assert.equal(started['pikku.user.id'], 'user-9')
  })
})

describe('the span cap', () => {
  const hopIds = (events: RunEvent[]) =>
    ofType(events, 'run.hop').map((e) => `${e.phase}:${e.spanId}`)

  test('a span past maxSpansPerRun is ignored: no event for it, none in the views, a duplicate end counts once', () => {
    const stitcher = createRunStitcher({ limits: { maxSpansPerRun: 2 } })
    const events = collect(stitcher)
    const root = syn({ id: 'r', startMs: T0, endMs: T0 + 100 })
    const a = syn({ id: 'a', parent: 'r', startMs: T0 + 1, endMs: T0 + 10 })
    const b = syn({ id: 'b', parent: 'r', startMs: T0 + 2, endMs: T0 + 10 })
    stitcher.start(toOpen(root), T0)
    stitcher.start(toOpen(a), T0 + 1)
    stitcher.start(toOpen(b), T0 + 2)
    stitcher.end(b, T0 + 10)
    stitcher.end(b, T0 + 10)
    stitcher.end(a, T0 + 10)
    stitcher.end(a, T0 + 10)
    stitcher.end(root, T0 + 100)
    assert.deepEqual(hopIds(events), ['start:r', 'start:a', 'end:a', 'end:r'])
    const view = stitcher.snapshot(T0 + 200).recent[0]!
    assert.deepEqual(view.hops.map((h) => h.spanId).sort(), ['a', 'r'])
    const health = stitcher.snapshot(T0 + 200).health.entries
    assert.deepEqual(
      health.map((e) => [e.key, e.runs]),
      [
        ['a', 1],
        ['r', 1],
      ]
    )
  })

  test('an end past the cap in an end-only trace is ignored the same way', () => {
    const stitcher = createRunStitcher({ limits: { maxSpansPerRun: 2 } })
    const events = collect(stitcher)
    stitcher.end(
      syn({ id: 'x', parent: 'r', startMs: T0 + 1, endMs: T0 + 2 }),
      T0 + 2
    )
    stitcher.end(
      syn({ id: 'y', parent: 'r', startMs: T0 + 1, endMs: T0 + 3 }),
      T0 + 3
    )
    stitcher.end(
      syn({ id: 'z', parent: 'r', startMs: T0 + 1, endMs: T0 + 4 }),
      T0 + 4
    )
    stitcher.end(
      syn({ id: 'z', parent: 'r', startMs: T0 + 1, endMs: T0 + 4 }),
      T0 + 4
    )
    stitcher.end(syn({ id: 'r', startMs: T0, endMs: T0 + 9 }), T0 + 9)
    assert.deepEqual(
      ofType(events, 'run.hop').filter((e) => e.spanId === 'z'),
      []
    )
    assert.equal(
      ofType(events, 'run.hop').filter((e) => e.phase === 'end').length,
      new Set(
        ofType(events, 'run.hop')
          .filter((e) => e.phase === 'end')
          .map((e) => e.spanId)
      ).size
    )
  })
})

describe('a closed trace stays closed', () => {
  test('a late child after the closed run left retention is ignored, never a second run rooted on itself', () => {
    const stitcher = createRunStitcher({ limits: { maxRetained: 1 } })
    const events = collect(stitcher)
    for (const t of ['t1', 't2']) {
      const root = syn({ id: `r${t}`, trace: t, startMs: T0, endMs: T0 + 5 })
      stitcher.start(toOpen(root), T0)
      stitcher.end(root, T0 + 5)
    }
    const before = events.length
    const late = syn({
      id: 'late',
      trace: 't1',
      parent: 'rt1',
      startMs: T0 + 6,
      endMs: T0 + 9,
    })
    stitcher.start(toOpen(late), T0 + 6)
    stitcher.end(late, T0 + 9)
    stitcher.sweep(T0 + 1_000_000)
    assert.equal(
      events.slice(before).filter((e) => e.type !== 'health').length,
      0
    )
    assert.equal(stitcher.snapshot(T0 + 1_000_000).open.length, 0)
    assert.equal(
      ofType(events, 'run.started').filter(
        (e) => e.traceId === 't1'.padEnd(32, '0')
      ).length,
      1
    )
  })

  test('the closed-trace memory is bounded: past maxClosedTraces the oldest id is forgotten', () => {
    const stitcher = createRunStitcher({
      limits: { maxRetained: 1, maxClosedTraces: 3 },
    })
    const events = collect(stitcher)
    for (const t of ['a', 'b', 'c', 'd', 'e']) {
      const root = syn({ id: `r${t}`, trace: t, startMs: T0, endMs: T0 + 1 })
      stitcher.start(toOpen(root), T0)
      stitcher.end(root, T0 + 1)
    }
    const before = events.length
    // 'e' is retained, 'b'..'d' are remembered as closed, 'a' is forgotten: the bound's edge.
    const late = (trace: string, id: string, parent?: string) =>
      stitcher.end(
        syn({ id, trace, parent, startMs: T0, endMs: T0 + 2 }),
        T0 + 2
      )
    late('c', 'late-c', 'rc')
    assert.equal(events.length, before, 'a remembered trace is still ignored')
    late('a', 'late-a')
    assert.ok(
      events.length > before,
      'past the bound the oldest id is accepted again (a new run)'
    )
    assert.ok(
      ofType(events, 'run.started').some(
        (e) => e.traceId === 'a'.padEnd(32, '0') && e.rootSpanId === 'late-a'
      )
    )
  })
})

describe('eviction by recency and total size', () => {
  test('the open run evicted is the least recently seen, not the oldest created', () => {
    const stitcher = createRunStitcher({ limits: { maxOpenRuns: 2 } })
    const events = collect(stitcher)
    const open = (t: string, now: number) =>
      stitcher.start(toOpen(syn({ id: `r${t}`, trace: t, startMs: now })), now)
    open('a', T0)
    open('b', T0 + 1)
    stitcher.start(
      toOpen(syn({ id: 'child', trace: 'a', parent: 'ra', startMs: T0 + 2 })),
      T0 + 2
    )
    open('c', T0 + 3)
    assert.deepEqual(
      ofType(events, 'run.expired').map((e) => e.traceId),
      ['b'.padEnd(32, '0')]
    )
  })

  test('closed runs are evicted least recently seen too: a late child keeps its run', () => {
    const stitcher = createRunStitcher({ limits: { maxRetained: 2 } })
    const close = (t: string, now: number) => {
      const root = syn({ id: `r${t}`, trace: t, startMs: now, endMs: now + 1 })
      stitcher.start(toOpen(root), now)
      stitcher.end(root, now + 1)
    }
    close('a', T0)
    close('b', T0 + 10)
    stitcher.end(
      syn({
        id: 'late',
        trace: 'a',
        parent: 'ra',
        startMs: T0 + 20,
        endMs: T0 + 21,
      }),
      T0 + 21
    )
    close('c', T0 + 30)
    const kept = stitcher.snapshot(T0 + 40).recent.map((r) => r.traceId)
    assert.ok(kept.includes('a'.padEnd(32, '0')))
    assert.ok(!kept.includes('b'.padEnd(32, '0')))
  })

  test('traces that never find a root are bounded in total frames, least recently seen first', () => {
    const stitcher = createRunStitcher({
      limits: { maxTotalSpans: 10, settleMs: 100 },
    })
    const events = collect(stitcher)
    const rootless = (t: string, now: number) => {
      for (let i = 0; i < 6; i++)
        stitcher.end(
          syn({
            id: `${t}${i}`,
            trace: t,
            parent: `gone${t}`,
            startMs: now,
            endMs: now + 1,
          }),
          now + 1
        )
    }
    rootless('p', T0)
    rootless('q', T0 + 1)
    stitcher.sweep(T0 + 1000)
    const started = ofType(events, 'run.started').map((e) => e.traceId)
    assert.deepEqual(started, ['q'.padEnd(32, '0')])
  })
})

describe('start frames: the first span seen for a trace is the root at once, parent or not', () => {
  test('a foreign-parent root (a worker, a trusted inbound traceparent) starts and streams live, never waiting for settleMs', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({
      id: 'w',
      parent: 'other-process',
      startMs: T0,
      endMs: T0 + 20,
    })
    stitcher.start(toOpen(root), T0)
    assert.deepEqual(
      events.map((e) => e.type),
      ['run.started', 'run.hop']
    )
    assert.equal(ofType(events, 'run.started')[0]!.rootSpanId, 'w')
    stitcher.end(root, T0 + 20)
    assert.equal(ofType(events, 'run.finished').length, 1)
  })

  test('known limit: a sink registered mid-request makes the first-seen child the root', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const child = syn({ id: 'c', parent: 'r', startMs: T0 + 1, endMs: T0 + 10 })
    stitcher.start(toOpen(child), T0 + 1)
    assert.equal(ofType(events, 'run.started')[0]!.rootSpanId, 'c')
    stitcher.end(child, T0 + 10)
    // the request's own root arrives later: a trace that closed with a root already, so it is ignored or attached,
    // never a second run
    stitcher.end(syn({ id: 'r', startMs: T0, endMs: T0 + 20 }), T0 + 20)
    assert.equal(ofType(events, 'run.started').length, 1)
  })

  test('end-only input still waits: a parent not yet seen is not a root before settleMs', () => {
    const stitcher = createRunStitcher({ limits: { settleMs: 100 } })
    const events = collect(stitcher)
    stitcher.end(
      syn({ id: 'c', parent: 'gone', startMs: T0 + 1, endMs: T0 + 3 }),
      T0 + 3
    )
    stitcher.sweep(T0 + 50)
    assert.equal(events.length, 0)
    stitcher.sweep(T0 + 200)
    assert.equal(ofType(events, 'run.started')[0]!.rootSpanId, 'c')
  })
})

describe('a db span that ends after its hop ended', () => {
  const dbAttrs = {
    'db.system': 'pg',
    'db.operation.name': 'select',
    'db.collection.name': 'booking',
  }

  test('is counted in db.dropped, announced by a run.hop update, and the view agrees', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({ id: 'r', startMs: T0, endMs: T0 + 50 })
    const hop = syn({ id: 'h', parent: 'r', startMs: T0 + 1, endMs: T0 + 10 })
    stitcher.start(toOpen(root), T0)
    stitcher.start(toOpen(hop), T0 + 1)
    stitcher.end(
      syn({
        id: 'd0',
        parent: 'h',
        startMs: T0 + 2,
        endMs: T0 + 4,
        attributes: dbAttrs,
      }),
      T0 + 4
    )
    stitcher.end(hop, T0 + 10)
    stitcher.end(
      syn({
        id: 'd1',
        parent: 'h',
        startMs: T0 + 5,
        endMs: T0 + 20,
        attributes: dbAttrs,
      }),
      T0 + 20
    )
    stitcher.end(
      syn({
        id: 'd2',
        parent: 'h',
        startMs: T0 + 5,
        endMs: T0 + 21,
        attributes: dbAttrs,
      }),
      T0 + 21
    )
    stitcher.end(root, T0 + 50)
    const view = stitcher
      .snapshot(T0 + 60)
      .recent[0]!.hops.find((x) => x.spanId === 'h')!
    assert.equal(view.db?.count, 1)
    assert.equal(view.db?.dropped, 2)
    const updates = ofType(events, 'run.hop').filter(
      (e) => e.phase === 'update'
    )
    // two late spans, one update: coalesced, carrying the final count
    assert.equal(updates.length, 1)
    assert.deepEqual(updates[0]!.db, view.db)
  })

  test('a hop whose only db spans came late still gets a summary with the count', () => {
    const stitcher = createRunStitcher()
    const root = syn({ id: 'r', startMs: T0, endMs: T0 + 50 })
    stitcher.start(toOpen(root), T0)
    stitcher.end(
      syn({ id: 'h', parent: 'r', startMs: T0 + 1, endMs: T0 + 10 }),
      T0 + 10
    )
    stitcher.end(
      syn({
        id: 'd',
        parent: 'h',
        startMs: T0 + 5,
        endMs: T0 + 20,
        attributes: dbAttrs,
      }),
      T0 + 20
    )
    stitcher.end(root, T0 + 50)
    const view = stitcher
      .snapshot(T0 + 60)
      .recent[0]!.hops.find((x) => x.spanId === 'h')!
    assert.deepEqual(view.db, { count: 0, totalMs: 0, byOp: {}, dropped: 1 })
  })

  test('a db span before the end carries no dropped key', () => {
    const stitcher = createRunStitcher()
    const root = syn({ id: 'r', startMs: T0, endMs: T0 + 50 })
    stitcher.start(toOpen(root), T0)
    stitcher.end(
      syn({
        id: 'd',
        parent: 'r',
        startMs: T0 + 5,
        endMs: T0 + 20,
        attributes: dbAttrs,
      }),
      T0 + 20
    )
    stitcher.end(root, T0 + 50)
    const view = stitcher.snapshot(T0 + 60).recent[0]!.hops[0]!
    assert.equal(view.db?.count, 1)
    assert.equal('dropped' in view.db!, false)
  })
})

describe('a failed producer span (a boundary)', () => {
  test('is the failure the run names, though it is not a hop and not a health key', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    stitcher.start(
      toOpen(syn({ id: 'r', name: 'checkout', startMs: T0, endMs: T0 + 50 })),
      T0
    )
    const pub = syn({
      id: 'p',
      name: 'publish mail',
      parent: 'r',
      kind: 'producer',
      startMs: T0 + 1,
      endMs: T0 + 5,
      error: 'QueueDownError',
    })
    stitcher.start(toOpen(pub), T0 + 1)
    stitcher.end(pub, T0 + 5)
    stitcher.end(
      syn({
        id: 'r',
        name: 'checkout',
        startMs: T0,
        endMs: T0 + 50,
        error: 'Boom',
      }),
      T0 + 50
    )
    const failed = ofType(events, 'run.failed')[0]!
    // the hop that was publishing, with the publish's error
    assert.deepEqual(failed.failure, {
      spanId: 'r',
      functionId: 'checkout',
      errorName: 'QueueDownError',
    })
    assert.ok(!ofType(events, 'run.hop').some((e) => e.spanId === 'p'))
    const keys = stitcher.snapshot(T0 + 60).health.entries.map((e) => e.key)
    assert.ok(!keys.includes('publish mail'))
  })

  test('a denied boundary is not a failure, as for a hop', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    stitcher.start(toOpen(syn({ id: 'r', startMs: T0, endMs: T0 + 50 })), T0)
    const pub = syn({
      id: 'p',
      parent: 'r',
      kind: 'producer',
      startMs: T0 + 1,
      endMs: T0 + 5,
      error: 'ForbiddenError',
    })
    stitcher.start(toOpen(pub), T0 + 1)
    stitcher.end(pub, T0 + 5)
    stitcher.end(
      syn({ id: 'r', startMs: T0, endMs: T0 + 50, error: 'Boom' }),
      T0 + 50
    )
    assert.equal(ofType(events, 'run.failed')[0]!.failure!.errorName, 'Boom')
  })
})

describe('views carry the seq of the events they stand for', () => {
  test('startedSeq, closedSeq, startSeq and endSeq equal the seqs of the events, so a rebuild can order exactly', () => {
    const stitcher = createRunStitcher({ limits: { maxRetained: 1000 } })
    const events = collect(stitcher)
    const batches = frames(sample).map((f) => [f])
    let last = 0
    for (const [{ at, kind, span }] of batches.map((b) => b)) {
      last = nsToMs(at)
      if (kind === 0) stitcher.start(toOpen(span), last)
      else stitcher.end(span, last)
    }
    stitcher.sweep(last + 600_000)
    const snapshot = stitcher.snapshot(last + 600_000)
    const views = [...snapshot.open, ...snapshot.recent]
    assert.ok(views.length > 0)
    for (const view of views) {
      const started = events.find(
        (e) => e.type === 'run.started' && e.traceId === view.traceId
      )!
      assert.equal(view.startedSeq, started.seq)
      const close = events.find(
        (e) =>
          (e.type === 'run.finished' ||
            e.type === 'run.failed' ||
            e.type === 'run.expired') &&
          e.traceId === view.traceId
      )
      assert.equal(view.closedSeq, close?.seq)
      for (const hop of view.hops) {
        const start = events.find(
          (e) =>
            e.type === 'run.hop' &&
            e.phase === 'start' &&
            e.spanId === hop.spanId &&
            e.traceId === view.traceId
        )
        const end = events.find(
          (e) =>
            e.type === 'run.hop' &&
            e.phase === 'end' &&
            e.spanId === hop.spanId &&
            e.traceId === view.traceId
        )
        assert.equal(hop.startSeq, start?.seq)
        assert.equal(hop.endSeq, end?.seq)
        assert.equal(hop.hadStart, start !== undefined)
      }
    }
  })

  test('an open run has no closedSeq and an open hop no endSeq', () => {
    const stitcher = createRunStitcher()
    stitcher.start(toOpen(syn({ id: 'r', startMs: T0 })), T0)
    stitcher.start(
      toOpen(syn({ id: 'h', parent: 'r', startMs: T0 + 1 })),
      T0 + 1
    )
    const view = stitcher.snapshot(T0 + 2).open[0]!
    assert.equal(view.closedSeq, undefined)
    assert.equal(view.hops[0]!.endSeq, undefined)
    assert.equal(typeof view.hops[0]!.startSeq, 'number')
  })
})

describe('eviction never forgets a trace that was not announced', () => {
  test('foreign-parent traces past maxOpenRuns each yield a run; an evicted one that started is expired and its later spans are ignored (the bound)', () => {
    const stitcher = createRunStitcher({ limits: { maxOpenRuns: 10 } })
    const events = collect(stitcher)
    const roots = Array.from({ length: 20 }, (_, i) =>
      syn({
        id: `r${i}`,
        trace: `t${String(i).padStart(2, '0')}`,
        parent: 'remote',
        startMs: T0 + i,
        endMs: T0 + 100 + i,
      })
    )
    for (const [i, root] of roots.entries())
      stitcher.start(toOpen(root), T0 + i)
    for (const [i, root] of roots.entries()) stitcher.end(root, T0 + 100 + i)
    stitcher.sweep(T0 + 10_000)
    // every trace was announced once; the first ten expired when the cap hit, so their ends arrived at a forgotten id
    assert.equal(ofType(events, 'run.started').length, 20)
    assert.equal(ofType(events, 'run.expired').length, 10)
    assert.equal(ofType(events, 'run.finished').length, 10)
  })

  test('an end-only trace still waiting for its root when the cap evicts it is settled, not lost: its spans are reported', () => {
    const stitcher = createRunStitcher({ limits: { maxOpenRuns: 2 } })
    const events = collect(stitcher)
    for (let i = 0; i < 6; i++) {
      stitcher.end(
        syn({
          id: `r${i}`,
          trace: `t${i}`,
          parent: 'remote',
          startMs: T0 + i,
          endMs: T0 + 5 + i,
        }),
        T0 + 5 + i
      )
    }
    stitcher.sweep(T0 + 100_000)
    assert.equal(ofType(events, 'run.started').length, 6)
    assert.equal(ofType(events, 'run.finished').length, 6)
  })

  test('a root-less trace dropped under memory pressure is not forgotten: its later spans start a fresh run', () => {
    const stitcher = createRunStitcher({ limits: { maxTotalSpans: 3 } })
    const events = collect(stitcher)
    // end-only children whose parent never shows: root-less, so they are the first victims
    for (let i = 0; i < 3; i++)
      stitcher.end(
        syn({
          id: `c${i}`,
          trace: 'lost',
          parent: 'gone',
          startMs: T0 + i,
          endMs: T0 + 5,
        }),
        T0 + 5
      )
    for (let i = 0; i < 4; i++)
      stitcher.end(
        syn({
          id: `o${i}`,
          trace: 'other',
          parent: 'gone2',
          startMs: T0 + i,
          endMs: T0 + 6,
        }),
        T0 + 6
      )
    stitcher.end(
      syn({ id: 'again', trace: 'lost', startMs: T0 + 7, endMs: T0 + 8 }),
      T0 + 8
    )
    assert.ok(
      ofType(events, 'run.started').some(
        (e) => e.traceId === 'lost'.padEnd(32, '0') && e.rootSpanId === 'again'
      )
    )
  })
})
