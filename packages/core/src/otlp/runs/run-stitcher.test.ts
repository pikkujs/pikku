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
      }
      hop.parentSpanId = e.parentSpanId
      if (e.phase === 'end') {
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

type _Unused = OpenSpan
