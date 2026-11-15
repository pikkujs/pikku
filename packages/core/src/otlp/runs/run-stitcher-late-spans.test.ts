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
import { toOpen, T0, syn, collect, ofType } from './stitcher-test-helpers.js'

describe('attribute keys on the allow-list are own keys', () => {
  test('object prototype names are not allowed', async () => {
    const { isAllowedAttributeKey } = await import('../attribute-types.js')
    for (const key of [
      'toString',
      'constructor',
      'hasOwnProperty',
      '__proto__',
      'valueOf',
    ])
      assert.equal(isAllowedAttributeKey(key), false, key)
    assert.equal(isAllowedAttributeKey('pikku.function.id'), true)
  })

  test('a custom attribute named like a prototype member never reaches an event', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    stitcher.start(
      toOpen(
        syn({
          id: 'r',
          startMs: T0,
          attributes: { toString: 'a', constructor: 'b', hasOwnProperty: 'c' },
        })
      ),
      T0
    )
    assert.deepEqual(
      Object.keys(ofType(events, 'run.started')[0]!.attributes).sort(),
      ['pikku.function.id']
    )
  })
})

describe('a failed producer under a root that ends ok', () => {
  const run = (rootError?: string) => {
    const stitcher = createRunStitcher({
      limits: { healthWindowMs: 1_000_000 },
    })
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
        ...(rootError ? { error: rootError } : {}),
      }),
      T0 + 50
    )
    return { stitcher, events }
  }

  test('run.finished stays ok and carries the failure of the hop that was publishing', () => {
    const { stitcher, events } = run()
    const finished = ofType(events, 'run.finished')[0]!
    assert.equal(finished.outcome, 'ok')
    assert.deepEqual(finished.failure, {
      spanId: 'r',
      functionId: 'checkout',
      errorName: 'QueueDownError',
    })
    assert.equal(ofType(events, 'run.failed').length, 0)
    const view = stitcher.snapshot(T0 + 60).recent[0]!
    assert.equal(view.status, 'finished')
    assert.equal(view.outcome, 'ok')
    assert.deepEqual(view.failure, finished.failure)
  })

  test('the hop keeps its own outcome, but health counts the failed publish against it', () => {
    const { stitcher, events } = run()
    const end = ofType(events, 'run.hop').find(
      (e) => e.phase === 'end' && e.spanId === 'r'
    )!
    assert.equal(end.outcome, 'ok')
    const entry = stitcher
      .snapshot(T0 + 60)
      .health.entries.find((e) => e.key === 'checkout')!
    assert.equal(entry.runs, 1)
    assert.equal(entry.errors, 1)
  })

  test('a run with no failed boundary has no failure on run.finished', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const r = syn({ id: 'r', startMs: T0, endMs: T0 + 5 })
    stitcher.start(toOpen(r), T0)
    stitcher.end(r, T0 + 5)
    assert.equal(ofType(events, 'run.finished')[0]!.failure, undefined)
  })
})

describe('late db spans are coalesced per hop', () => {
  const dbAttrs = { 'db.system': 'pg', 'db.operation.name': 'select' }
  const setup = () => {
    const stitcher = createRunStitcher({ limits: { maxRetained: 2 } })
    const events = collect(stitcher)
    const root = syn({ id: 'r', startMs: T0, endMs: T0 + 5 })
    stitcher.start(toOpen(root), T0)
    stitcher.end(root, T0 + 5)
    return { stitcher, events }
  }
  const late = (i: number) =>
    syn({
      id: `d${i}`,
      parent: 'r',
      startMs: T0 + 1,
      endMs: T0 + 6 + (i % 50),
      attributes: dbAttrs,
    })

  test('five hundred late db spans make one update per flush, with the final count', () => {
    const { stitcher, events } = setup()
    for (let i = 0; i < 500; i++) stitcher.end(late(i), T0 + 6)
    const snap = stitcher.snapshot(T0 + 10)
    assert.equal(
      ofType(events, 'run.hop').filter((e) => e.phase === 'update').length,
      1
    )
    assert.equal(snap.recent[0]!.hops[0]!.db?.dropped, 500)
    const update = ofType(events, 'run.hop').find((e) => e.phase === 'update')!
    assert.deepEqual(update.db, snap.recent[0]!.hops[0]!.db)
  })

  test('a snapshot always equals the events up to its seq, pending updates included', () => {
    const { stitcher, events } = setup()
    for (let i = 0; i < 5; i++) stitcher.end(late(i), T0 + 6)
    const snap = stitcher.snapshot(T0 + 10)
    assert.equal(snap.seq, events[events.length - 1]!.seq)
    const update = ofType(events, 'run.hop').filter((e) => e.phase === 'update')
    assert.deepEqual(update[update.length - 1]!.db, snap.recent[0]!.hops[0]!.db)
  })

  test('a pending update is flushed by the next sweep', () => {
    const { stitcher, events } = setup()
    stitcher.end(late(0), T0 + 6)
    assert.equal(
      ofType(events, 'run.hop').filter((e) => e.phase === 'update').length,
      0
    )
    stitcher.sweep(T0 + 7)
    assert.equal(
      ofType(events, 'run.hop').filter((e) => e.phase === 'update').length,
      1
    )
  })

  test('late db spans do not keep a closed run alive against eviction (a late child of another kind does)', () => {
    const closeRun = (
      stitcher: RunStitcher,
      trace: string,
      at: number
    ): void => {
      const r = syn({ id: `r${trace}`, trace, startMs: at, endMs: at + 5 })
      stitcher.start(toOpen(r), at)
      stitcher.end(r, at + 5)
    }
    const survivors = (kind: 'db' | 'hop'): string[] => {
      const stitcher = createRunStitcher({ limits: { maxRetained: 2 } })
      closeRun(stitcher, 'a', T0)
      closeRun(stitcher, 'b', T0 + 60_000)
      stitcher.end(
        syn({
          id: 'x',
          trace: 'a',
          parent: 'ra',
          startMs: T0 + 1,
          endMs: T0 + 6,
          attributes: kind === 'db' ? dbAttrs : {},
        }),
        T0 + 120_000
      )
      closeRun(stitcher, 'c', T0 + 130_000)
      return stitcher.snapshot(T0 + 140_000).recent.map((r) => r.rootSpanId)
    }
    assert.deepEqual(survivors('db'), ['rc', 'rb'])
    assert.deepEqual(survivors('hop'), ['rc', 'ra'])
  })
})

describe('span names and health keys are bounded', () => {
  test('a 100 KB name is cut in events, views and health keys', () => {
    const big = 'x'.repeat(100_000)
    const stitcher = createRunStitcher({
      limits: { healthWindowMs: 1_000_000 },
    })
    const events = collect(stitcher)
    const root = {
      ...syn({ id: 'r', startMs: T0, endMs: T0 + 5, name: big }),
      attributes: {},
    }
    stitcher.start(toOpen(root), T0)
    stitcher.end(root, T0 + 5)
    for (const e of ofType(events, 'run.hop')) assert.ok(e.name.length <= 256)
    const view = stitcher.snapshot(T0 + 10)
    assert.ok(view.recent[0]!.hops[0]!.name.length <= 256)
    for (const entry of view.health.entries) assert.ok(entry.key.length <= 256)
    assert.ok(JSON.stringify(events).length < 10_000)
  })

  test('a 100 KB function id and error name are cut too', () => {
    const big = 'y'.repeat(100_000)
    const stitcher = createRunStitcher({
      limits: { healthWindowMs: 1_000_000 },
    })
    const events = collect(stitcher)
    const root = syn({
      id: 'r',
      startMs: T0,
      endMs: T0 + 5,
      attributes: { 'pikku.function.id': big },
      error: big,
    })
    stitcher.start(toOpen(root), T0)
    stitcher.end(root, T0 + 5)
    assert.ok(JSON.stringify(events).length < 10_000)
    for (const entry of stitcher.snapshot(T0 + 10).health.entries)
      assert.ok(entry.key.length <= 256)
  })
})
