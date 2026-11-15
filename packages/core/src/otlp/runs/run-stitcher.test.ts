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

// ---------------------------------------------------------------------------
// Fixtures. `real-*.json` are converted from OTLP dumps of a real dev backend
// (seminarhof, Pikku core spans, attributes trimmed). Everything built with
// `syn` is SYNTHETIC: no dump has start frames, db.query.text, queue/channel/
// workflow spans or a child that ends after its root.
// ---------------------------------------------------------------------------

interface FixtureSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startNs: string
  endNs: string
  status: { code: 'unset' | 'ok' | 'error'; message?: string }
  attributes: Record<string, string | number | boolean>
  events?: {
    name: string
    timeNs: string
    attributes?: Record<string, string | number | boolean>
  }[]
}

const loadFixture = (file: string): FinishedSpan[] => {
  const url = new URL(`./fixtures/${file}`, import.meta.url)
  const parsed = JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as {
    spans: FixtureSpan[]
  }
  return parsed.spans.map((s) => ({
    traceId: s.traceId,
    spanId: s.spanId,
    ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
    name: s.name,
    kind: s.kind,
    startTimeUnixNano: BigInt(s.startNs),
    endTimeUnixNano: BigInt(s.endNs),
    status: s.status,
    attributes: s.attributes,
    ...(s.events
      ? {
          events: s.events.map((e) => ({
            name: e.name,
            timeUnixNano: BigInt(e.timeNs),
            ...(e.attributes ? { attributes: e.attributes } : {}),
          })),
        }
      : {}),
  }))
}

const toOpen = (span: FinishedSpan): OpenSpan => ({
  traceId: span.traceId,
  spanId: span.spanId,
  ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
  name: span.name,
  kind: span.kind,
  startTimeUnixNano: span.startTimeUnixNano,
  attributes: { ...span.attributes },
})

const nsToMs = (ns: bigint): number => Number((ns + 500_000n) / 1_000_000n)

const T0 = 1_800_000_000_000

/** SYNTHETIC span, built in ms offsets. */
const syn = (o: {
  id: string
  trace?: string
  parent?: string
  name?: string
  kind?: SpanKind
  startMs: number
  endMs?: number
  attributes?: Record<string, string | number | boolean>
  error?: string
}): FinishedSpan => ({
  traceId: (o.trace ?? 't1').padEnd(32, '0'),
  spanId: o.id,
  ...(o.parent ? { parentSpanId: o.parent } : {}),
  name: o.name ?? o.id,
  kind: o.kind ?? 'internal',
  startTimeUnixNano: BigInt(o.startMs) * 1_000_000n,
  endTimeUnixNano: BigInt(o.endMs ?? o.startMs + 1) * 1_000_000n,
  status: o.error
    ? { code: 'error', message: `${o.error}: failed` }
    : { code: 'ok' },
  attributes: { 'pikku.function.id': o.name ?? o.id, ...(o.attributes ?? {}) },
  ...(o.error
    ? {
        events: [
          {
            name: 'exception',
            timeUnixNano: BigInt(o.endMs ?? o.startMs + 1) * 1_000_000n,
            attributes: { 'exception.type': o.error },
          },
        ],
      }
    : {}),
})

const collect = (stitcher: RunStitcher): RunEvent[] => {
  const events: RunEvent[] = []
  stitcher.subscribe((e) => events.push(e))
  return events
}

const ofType = <T extends RunEvent['type']>(
  events: RunEvent[],
  type: T
): Extract<RunEvent, { type: T }>[] =>
  events.filter((e): e is Extract<RunEvent, { type: T }> => e.type === type)

/** Feeds finished spans in order, as a sink with no start hook sees them. Returns the last end in ms. */
const feedEnds = (stitcher: RunStitcher, spans: FinishedSpan[]): number => {
  let now = 0
  for (const span of spans) {
    now = nsToMs(span.endTimeUnixNano)
    stitcher.end(span, now)
  }
  return now
}

/** Start and end frames in time order (a start before an end at the same instant). */
const frames = (spans: FinishedSpan[]) =>
  spans
    .flatMap((span) => [
      { at: span.startTimeUnixNano, kind: 0 as const, span },
      { at: span.endTimeUnixNano, kind: 1 as const, span },
    ])
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind - b.kind))

const sample = loadFixture('real-seminarhof-sample.json')
const detail = loadFixture('real-getAdminBookingDetail.json')
const denied = loadFixture('real-scenarioCleanup-403.json')

describe('createRunStitcher', () => {
  test('1. end-only real traces root on the http span, never on a db span', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    feedEnds(stitcher, sample)

    const traces = new Map<string, FinishedSpan[]>()
    for (const span of sample) {
      traces.set(span.traceId, [...(traces.get(span.traceId) ?? []), span])
    }
    const started = ofType(events, 'run.started')
    assert.equal(started.length, traces.size)
    for (const run of started) {
      const root = traces
        .get(run.traceId)!
        .find((s) => s.parentSpanId === undefined)!
      assert.equal(run.rootSpanId, root.spanId)
      assert.ok(!root.attributes['db.system'])
      assert.equal(root.attributes['pikku.wire.type'], 'http')
    }
    const firstHop = new Map<string, string>()
    for (const e of ofType(events, 'run.hop')) {
      if (!firstHop.has(e.traceId)) firstHop.set(e.traceId, e.name)
    }
    assert.ok([...firstHop.values()].every((name) => !name.startsWith('db.')))
  })

  test('2. db spans fold into one DbSummary and are never hops', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    feedEnds(stitcher, detail)

    const hops = ofType(events, 'run.hop')
    assert.deepEqual(hops.map((h) => h.name).sort(), [
      'getAdminBookingDetail',
      'rpcCaller',
    ])
    const fn = hops.find((h) => h.name === 'getAdminBookingDetail')!
    assert.equal(fn.db?.count, 10)
    assert.equal(fn.db?.totalMs, 0.305)
    assert.deepEqual(fn.db?.byOp, {
      'select booking': 2,
      'select enquiry': 1,
      'select client': 1,
      'select client_contact': 1,
      'select participant': 1,
      'select room': 1,
      'select room_assignment': 1,
      'select room_bed': 1,
      'select invoice': 1,
    })
    assert.equal('repeated' in fn.db!, false)
    const root = hops.find((h) => h.name === 'rpcCaller')!
    assert.equal(root.db?.count, 1)
  })

  test('3. the scenarioCleanup 403 trace ends denied, not ok', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    feedEnds(stitcher, denied)

    assert.equal(ofType(events, 'run.failed').length, 0)
    const [finished] = ofType(events, 'run.finished')
    assert.equal(finished?.outcome, 'denied')
    const fn = ofType(events, 'run.hop').find(
      (h) => h.name === 'scenarioCleanup'
    )!
    assert.equal(fn.outcome, 'denied')
    assert.equal(fn.errorName, 'ForbiddenError')
  })

  test('4. a start with no end expires after the ttl', () => {
    const stitcher = createRunStitcher({ limits: { ttlMs: 10_000 } })
    const events = collect(stitcher)
    stitcher.start(
      {
        traceId: 'a'.repeat(32),
        spanId: 'root',
        name: 'root',
        kind: 'server',
        startTimeUnixNano: BigInt(T0) * 1_000_000n,
        attributes: {},
      },
      T0
    )
    stitcher.sweep(T0 + 9_999)
    assert.equal(ofType(events, 'run.expired').length, 0)
    stitcher.sweep(T0 + 10_000)
    const [expired] = ofType(events, 'run.expired')
    assert.equal(expired?.outcome, 'expired')
    assert.equal(expired?.traceId, 'a'.repeat(32))
    const snapshot = stitcher.snapshot(T0 + 10_000)
    assert.equal(snapshot.open.length, 0)
    assert.equal(snapshot.recent[0]?.status, 'expired')
  })

  test('5. a foreign parent waits out the settle window before it becomes the root', () => {
    const stitcher = createRunStitcher({ limits: { settleMs: 1_000 } })
    const events = collect(stitcher)
    stitcher.end(
      syn({ id: 'child', parent: 'caller-span', startMs: T0, endMs: T0 + 5 }),
      T0 + 5
    )
    stitcher.sweep(T0 + 5 + 999)
    assert.equal(events.length, 0)
    stitcher.sweep(T0 + 5 + 1_000)
    const [started] = ofType(events, 'run.started')
    assert.equal(started?.rootSpanId, 'child')
    assert.equal(ofType(events, 'run.finished').length, 1)
  })

  test('6. a child ending after its root closed links to its parent and is not a new run', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 10 })
    const child = syn({
      id: 'child',
      parent: 'root',
      startMs: T0 + 1,
      endMs: T0 + 5,
    })
    stitcher.start(toOpen(root), T0)
    stitcher.start(toOpen(child), T0 + 1)
    stitcher.end(child, T0 + 5)
    stitcher.end(root, T0 + 10)
    assert.equal(ofType(events, 'run.finished').length, 1)

    const late = syn({
      id: 'late',
      parent: 'child',
      startMs: T0 + 6,
      endMs: T0 + 40,
    })
    stitcher.end(late, T0 + 40)

    assert.equal(ofType(events, 'run.started').length, 1)
    const hop = ofType(events, 'run.hop').find((h) => h.spanId === 'late')!
    assert.equal(hop.parentSpanId, 'child')
    const snapshot = stitcher.snapshot(T0 + 40)
    assert.equal(snapshot.open.length, 0)
    assert.equal(snapshot.recent.length, 1)
    assert.ok(snapshot.recent[0]!.hops.some((h) => h.spanId === 'late'))
  })

  test('7. every event and the snapshot survive JSON.stringify', () => {
    const stitcher = createRunStitcher({
      resource: { serviceName: 'seminarhof' },
    })
    const events = collect(stitcher)
    for (const f of frames(sample)) {
      if (f.kind === 0) stitcher.start(toOpen(f.span), nsToMs(f.at))
      else stitcher.end(f.span, nsToMs(f.at))
    }
    const last = nsToMs(sample[sample.length - 1]!.endTimeUnixNano)
    stitcher.sweep(last)
    const snapshot = stitcher.snapshot(last)
    assert.ok(events.length > 0)
    for (const value of [...events, snapshot]) {
      const text = JSON.stringify(value)
      assert.deepEqual(JSON.parse(text), value)
    }
    assert.equal(ofType(events, 'run.started')[0]?.service, 'seminarhof')
  })

  test('8. seq rises by one, and a snapshot plus the events after it equals the whole stream', () => {
    const rng = mulberry32(42)
    const batches = shuffledBatches(frames(sample), 6, rng)
    const options: StitcherOptions = { limits: { maxRetained: 1000 } }
    const stitcher = createRunStitcher(options)
    const events = collect(stitcher)
    const cuts = new Set([0, 3, 17, 60, 140, 260, batches.length - 1])
    const snapshots: RunSnapshot[] = []
    batches.forEach((batch, i) => {
      let now = 0
      for (const f of batch) {
        now = nsToMs(f.at)
        if (f.kind === 0) stitcher.start(toOpen(f.span), now)
        else stitcher.end(f.span, now)
      }
      stitcher.sweep(now)
      if (cuts.has(i)) snapshots.push(stitcher.snapshot(now))
    })
    stitcher.sweep(nsToMs(sample[sample.length - 1]!.endTimeUnixNano) + 600_000)

    assert.ok(events.length > 100)
    events.forEach((e, i) => assert.equal(e.seq, i + 1))
    const whole = fold(emptyState(), events)
    assert.ok(whole.size > 0)
    for (const snapshot of snapshots) {
      assert.equal(snapshot.seq <= events.length, true)
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
  })

  test('9. the same frames and clock give byte-identical events, and the source has no clock', () => {
    const run = () => {
      const stitcher = createRunStitcher({ resource: { serviceName: 's' } })
      const events = collect(stitcher)
      const all = frames(sample)
      all.forEach((f, i) => {
        const now = nsToMs(f.at)
        if (f.kind === 0) stitcher.start(toOpen(f.span), now)
        else stitcher.end(f.span, now)
        if (i % 25 === 0) stitcher.sweep(now)
      })
      stitcher.sweep(
        nsToMs(sample[sample.length - 1]!.endTimeUnixNano) + 300_000
      )
      return JSON.stringify(events)
    }
    const first = run()
    assert.ok(first.length > 1000)
    assert.equal(run(), first)

    const dir = fileURLToPath(new URL('./', import.meta.url))
    const sources = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    )
    assert.ok(sources.includes('run-stitcher.ts'))
    for (const file of sources) {
      const text = readFileSync(dir + file, 'utf8')
      assert.doesNotMatch(
        text,
        /Date\.now|new Date\(|setTimeout|setInterval|performance\.now|Math\.random/,
        file
      )
    }
  })

  test('10. caps evict the oldest with an expiry, and memory stays bounded under 100k spans', () => {
    const open = createRunStitcher({ limits: { maxOpenRuns: 10 } })
    const events = collect(open)
    for (let i = 0; i < 25; i++) {
      open.start(
        toOpen(
          syn({
            id: `r${i}`,
            trace: `trace${String(i).padStart(2, '0')}`,
            startMs: T0 + i,
          })
        ),
        T0 + i
      )
    }
    const expired = ofType(events, 'run.expired')
    assert.deepEqual(
      expired.map((e) => e.traceId),
      Array.from({ length: 15 }, (_, i) =>
        `trace${String(i).padStart(2, '0')}`.padEnd(32, '0')
      )
    )
    assert.equal(open.snapshot(T0 + 30).open.length, 10)

    const big = createRunStitcher({
      limits: { maxOpenRuns: 50, maxSpansPerRun: 20, maxRetained: 30 },
    })
    // One run with 100k children: only maxSpansPerRun are remembered.
    big.start(
      toOpen(syn({ id: 'big', trace: 'big', startMs: T0, endMs: T0 + 1e6 })),
      T0
    )
    for (let i = 0; i < 100_000; i++) {
      big.end(
        syn({
          id: `c${i}`,
          trace: 'big',
          parent: 'big',
          startMs: T0 + 1,
          endMs: T0 + 2,
        }),
        T0 + 2
      )
    }
    // And many runs: open and retained stay within their caps.
    for (let i = 0; i < 20_000; i++) {
      const root = syn({
        id: `m${i}`,
        trace: `many${i}`,
        startMs: T0 + i,
        endMs: T0 + i + 1,
      })
      big.start(toOpen(root), T0 + i)
      if (i % 3) big.end(root, T0 + i + 1)
    }
    const snapshot = big.snapshot(T0 + 30_000)
    assert.ok(snapshot.open.length <= 50)
    assert.ok(snapshot.recent.length <= 30)
    for (const run of [...snapshot.open, ...snapshot.recent]) {
      assert.ok(run.hops.length <= 20)
    }
  })

  test('11. health counts, errors, denied and average over a sliding window, bounded', () => {
    const stitcher = createRunStitcher({ limits: { healthWindowMs: 10_000 } })
    const events = collect(stitcher)
    const run = (id: string, at: number, ms: number, error?: string) => {
      const span = syn({
        id,
        trace: id,
        name: 'checkout',
        startMs: at,
        endMs: at + ms,
        error,
      })
      stitcher.end(span, at + ms)
    }
    run('a', T0, 100)
    run('b', T0 + 1_000, 300, 'TypeError')
    run('c', T0 + 2_000, 200, 'ForbiddenError')
    run('d', T0 + 3_000, 400)
    stitcher.sweep(T0 + 5_000)

    const [health] = ofType(events, 'health')
    assert.equal(health?.windowMs, 10_000)
    assert.deepEqual(health?.entries, [
      { key: 'checkout', runs: 4, errors: 1, denied: 1, avgMs: 250 },
    ])
    stitcher.sweep(T0 + 5_001)
    assert.equal(ofType(events, 'health').length, 1)

    // Slides: only d (ends T0+3400) is still inside the window at T0+13_300.
    assert.deepEqual(stitcher.snapshot(T0 + 13_300).health.entries, [
      { key: 'checkout', runs: 1, errors: 0, denied: 0, avgMs: 400 },
    ])
    assert.deepEqual(stitcher.snapshot(T0 + 14_000).health.entries, [])

    const many = createRunStitcher({ limits: { healthWindowMs: 60_000 } })
    for (let i = 0; i < 3_000; i++) {
      many.end(
        syn({
          id: `x${i}`,
          trace: `x${i}`,
          name: 'hot',
          startMs: T0,
          endMs: T0 + 1,
        }),
        T0 + 1
      )
    }
    const entry = many.snapshot(T0 + 2).health.entries[0]!
    assert.ok(entry.runs <= 1_000)
    assert.ok(
      many
        .snapshot(T0 + 2)
        .health.entries.every((e) => !e.key.startsWith('db.'))
    )
  })

  test('12. repeated appears only when db.query.text is present (synthetic)', () => {
    const dbSpan = (id: string, text?: string) =>
      syn({
        id,
        parent: 'fn',
        name: 'db.select',
        kind: 'client',
        startMs: T0 + 1,
        endMs: T0 + 2,
        attributes: {
          'db.system': 'sqlite',
          'db.operation.name': 'select',
          'db.collection.name': 'room',
          ...(text ? { 'db.query.text': text } : {}),
        },
      })
    const run = (withText: boolean) => {
      const stitcher = createRunStitcher()
      const events = collect(stitcher)
      const text = withText ? 'select * from room where id = ?' : undefined
      stitcher.end(dbSpan('d1', text), T0 + 2)
      stitcher.end(dbSpan('d2', text), T0 + 2)
      stitcher.end(dbSpan('d3', withText ? 'select 1' : undefined), T0 + 2)
      stitcher.end(
        syn({ id: 'fn', parent: 'root', startMs: T0, endMs: T0 + 3 }),
        T0 + 3
      )
      stitcher.end(syn({ id: 'root', startMs: T0, endMs: T0 + 4 }), T0 + 4)
      return ofType(events, 'run.hop').find((h) => h.spanId === 'fn')!.db!
    }
    const withText = run(true)
    assert.equal(withText.count, 3)
    assert.equal(withText.repeated, 1)
    const without = run(false)
    assert.equal(without.count, 3)
    assert.equal('repeated' in without, false)
  })
})

describe('createRunStitcher behaviour beyond the twelve', () => {
  test('a boundary span is not drawn and its children hang off its nearest hop', () => {
    const stitcher = createRunStitcher({
      classify: (span) =>
        span.kind === 'producer'
          ? 'boundary'
          : span.attributes['db.system']
            ? 'db'
            : 'hop',
    })
    const events = collect(stitcher)
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 10 })
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
    assert.ok(hops.every((h) => h.name !== 'queue.publish q'))
    assert.equal(
      hops.find((h) => h.spanId === 'job' && h.phase === 'end')?.parentSpanId,
      'root'
    )
  })

  test('an unknown parent re-parents to the root and duplicate ids are ignored', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 10 })
    const orphan = syn({
      id: 'orphan',
      parent: 'never-seen',
      startMs: T0 + 1,
      endMs: T0 + 2,
    })
    stitcher.start(toOpen(root), T0)
    stitcher.start(toOpen(orphan), T0 + 1)
    stitcher.start(toOpen(orphan), T0 + 1)
    stitcher.end(orphan, T0 + 2)
    stitcher.end(orphan, T0 + 2)
    stitcher.end(root, T0 + 10)
    const hops = ofType(events, 'run.hop').filter((h) => h.spanId === 'orphan')
    assert.deepEqual(
      hops.map((h) => h.phase),
      ['start', 'end']
    )
    assert.ok(hops.every((h) => h.parentSpanId === 'root'))
  })

  test('a root with an open hop waits for it, then settles', () => {
    const stitcher = createRunStitcher({ limits: { settleMs: 1_000 } })
    const events = collect(stitcher)
    const root = syn({ id: 'root', startMs: T0, endMs: T0 + 10 })
    const slow = syn({
      id: 'slow',
      parent: 'root',
      startMs: T0 + 1,
      endMs: T0 + 5_000,
    })
    stitcher.start(toOpen(root), T0)
    stitcher.start(toOpen(slow), T0 + 1)
    stitcher.end(root, T0 + 10)
    assert.equal(ofType(events, 'run.finished').length, 0)
    stitcher.sweep(T0 + 10 + 999)
    assert.equal(ofType(events, 'run.finished').length, 0)
    stitcher.sweep(T0 + 10 + 1_000)
    assert.equal(ofType(events, 'run.finished').length, 1)
    stitcher.end(slow, T0 + 5_000)
    assert.equal(ofType(events, 'run.started').length, 1)
  })

  test('a failing root ends run.failed naming the first failed hop', () => {
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    const root = syn({
      id: 'root',
      startMs: T0,
      endMs: T0 + 10,
      error: 'TypeError',
    })
    const child = syn({
      id: 'child',
      parent: 'root',
      startMs: T0 + 1,
      endMs: T0 + 5,
      error: 'TypeError',
    })
    feedEnds(stitcher, [child, root])
    const [failed] = ofType(events, 'run.failed')
    assert.equal(failed?.outcome, 'error')
    assert.deepEqual(failed?.failure, {
      spanId: 'child',
      functionId: 'child',
      errorName: 'TypeError',
    })
    assert.equal(ofType(events, 'run.finished').length, 0)
  })

  test('unsubscribe stops delivery and a throwing listener does not stop the rest', () => {
    const stitcher = createRunStitcher()
    const seen: number[] = []
    stitcher.subscribe(() => {
      throw new Error('listener bug')
    })
    const off = stitcher.subscribe((e) => seen.push(e.seq))
    feedEnds(stitcher, [syn({ id: 'a', trace: 'a', startMs: T0 })])
    off()
    feedEnds(stitcher, [syn({ id: 'b', trace: 'b', startMs: T0 })])
    assert.ok(seen.length > 0)
    assert.deepEqual(
      seen,
      [...seen].sort((a, b) => a - b)
    )
    assert.ok(Math.max(...seen) < stitcher.snapshot(T0 + 10).seq)
  })
})

describe('the stitcher behind the otlpSinks registry', () => {
  const stitcherSink = (stitcher: RunStitcher): OtlpSinkBase => ({
    onSpanStart: (span) => stitcher.start(span, nsToMs(span.startTimeUnixNano)),
    exportSpans: (spans) => {
      for (const span of spans) stitcher.end(span, nsToMs(span.endTimeUnixNano))
    },
    exportLogs() {},
    exportMetrics() {},
    flush: async () => {},
    close: async () => {},
  })

  test('a real tracer drives start and end frames through fanOutOtlp into runs', () => {
    const registry = createOtlpSinks()
    const stitcher = createRunStitcher()
    const events = collect(stitcher)
    registry.add(stitcherSink(stitcher))
    const tracer = new OtlpTracer(fanOutOtlp(registry))

    const trace = createTrace()
    const root = tracer.startSpan('rpcCaller', trace, {
      kind: 'server',
      attributes: { 'pikku.function.id': 'rpcCaller' },
    })
    assert.equal(ofType(events, 'run.started').length, 1)
    assert.equal(ofType(events, 'run.finished').length, 0)
    const db = tracer.startSpan(
      'db.select',
      { ...createTrace(trace.traceId), parentSpanId: trace.spanId },
      {
        kind: 'client',
        attributes: {
          'db.system': 'sqlite',
          'db.operation.name': 'select',
          'db.collection.name': 'room',
        },
      }
    )
    db.end()
    root.end()

    assert.equal(ofType(events, 'run.finished').length, 1)
    const hops = ofType(events, 'run.hop')
    assert.ok(hops.every((h) => h.name === 'rpcCaller'))
    assert.equal(hops.find((h) => h.phase === 'end')?.db?.count, 1)
  })

  test('the real fixture, fed through the registry as ends only, matches feeding it directly', () => {
    const direct = createRunStitcher()
    const viaRegistry = createRunStitcher()
    const a = collect(direct)
    const b = collect(viaRegistry)
    const registry = createOtlpSinks()
    registry.add(stitcherSink(viaRegistry))
    const fanOut = fanOutOtlp(registry)
    for (const span of sample) {
      direct.end(span, nsToMs(span.endTimeUnixNano))
      fanOut.exportSpans([span])
    }
    assert.ok(a.length > 0)
    assert.equal(JSON.stringify(b), JSON.stringify(a))
  })
})

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

// ---------------------------------------------------------------------------
// Helpers for the snapshot-plus-events property (test 8).
// ---------------------------------------------------------------------------

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const shuffledBatches = <T>(
  items: T[],
  size: number,
  rng: () => number
): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    for (let j = batch.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1))
      ;[batch[j], batch[k]] = [batch[k]!, batch[j]!]
    }
    out.push(batch)
  }
  return out
}

interface FoldHop {
  spanId: string
  parentSpanId: string | null
  name: string
  kind: string
  functionId?: string
  attributes: Record<string, string | number | boolean>
  hadStart: boolean
  startSeq?: number
  endSeq?: number
  endedAt?: number
  durationMs?: number
  outcome?: string
  errorName?: string | null
  db?: unknown
}
interface FoldRun {
  traceId: string
  rootSpanId: string
  startedAt: number
  startedSeq: number
  closedSeq?: number
  attributes: Record<string, string | number | boolean>
  endedAt?: number
  status: string
  outcome?: string
  durationMs?: number
  failure?: unknown
  hops: Map<string, FoldHop>
}
type FoldState = Map<string, FoldRun>

const emptyState = (): FoldState => new Map()

const fromSnapshot = (snapshot: RunSnapshot): FoldState => {
  const state: FoldState = new Map()
  for (const view of [...snapshot.open, ...snapshot.recent]) {
    state.set(view.traceId, {
      traceId: view.traceId,
      rootSpanId: view.rootSpanId,
      startedAt: view.startedAt,
      startedSeq: view.startedSeq,
      closedSeq: view.closedSeq,
      attributes: view.attributes,
      endedAt: view.endedAt,
      status: view.status,
      outcome: view.outcome,
      durationMs: view.durationMs,
      failure: view.failure,
      hops: new Map(
        view.hops.map((h) => [
          h.spanId,
          {
            spanId: h.spanId,
            parentSpanId: h.parentSpanId,
            name: h.name,
            kind: h.kind,
            functionId: h.functionId,
            attributes: h.attributes,
            hadStart: h.hadStart,
            startSeq: h.startSeq,
            endSeq: h.endSeq,
            endedAt: h.endedAt,
            durationMs: h.durationMs,
            outcome: h.outcome,
            errorName: h.errorName,
            db: h.db,
          },
        ])
      ),
    })
  }
  return state
}

const fold = (state: FoldState, events: RunEvent[]): FoldState => {
  for (const e of events) {
    if (e.type === 'run.started') {
      state.set(e.traceId, {
        traceId: e.traceId,
        rootSpanId: e.rootSpanId,
        startedAt: e.at,
        startedSeq: e.seq,
        attributes: e.attributes,
        status: 'open',
        hops: new Map(),
      })
    } else if (e.type === 'run.hop') {
      const run = state.get(e.traceId)
      if (!run) continue
      const hop = run.hops.get(e.spanId) ?? {
        spanId: e.spanId,
        parentSpanId: e.parentSpanId,
        name: e.name,
        kind: e.kind,
        functionId: e.functionId,
        attributes: e.attributes,
        hadStart: false,
      }
      hop.parentSpanId = e.parentSpanId
      if (e.phase === 'start') {
        hop.hadStart = true
        hop.startSeq = e.seq
        hop.attributes = e.attributes
      } else if (e.phase === 'update') {
        hop.db = e.db
      } else {
        hop.attributes = e.attributes
        hop.endSeq = e.seq
        hop.endedAt = e.at
        hop.durationMs = e.durationMs
        hop.outcome = e.outcome
        hop.errorName = e.errorName
        hop.db = e.db
      }
      run.hops.set(e.spanId, hop)
    } else if (e.type !== 'health') {
      const run = state.get(e.traceId)
      if (!run) continue
      run.status = e.type.slice('run.'.length)
      run.closedSeq = e.seq
      run.endedAt = e.at
      run.outcome = e.outcome
      run.durationMs = e.durationMs
      run.failure = e.failure
    }
  }
  return state
}

/** A comparable, JSON-shaped form: no undefined keys, hops in a stable order. */
const normalise = (state: FoldState) =>
  JSON.parse(
    JSON.stringify(
      [...state.values()]
        .sort((a, b) => (a.traceId < b.traceId ? -1 : 1))
        .map((run) => ({
          ...run,
          hops: [...run.hops.values()].sort((a, b) =>
            a.spanId < b.spanId ? -1 : 1
          ),
        }))
    )
  )

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

type _Unused = OpenSpan
