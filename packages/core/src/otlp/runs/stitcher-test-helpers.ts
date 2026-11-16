import type { FinishedSpan, SpanKind } from '../../tracer.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { OpenSpan } from '../otlp-sink.js'
import type { RunEvent, RunSnapshot, RunStitcher } from './types.js'

// ---------------------------------------------------------------------------
// Fixtures. `real-*.json` are converted from OTLP dumps of a real dev backend
// (seminarhof, Pikku core spans, attributes trimmed). Everything built with
// `syn` is SYNTHETIC: no dump has start frames, db.query.text, queue/channel/
// workflow spans or a child that ends after its root.
// ---------------------------------------------------------------------------

export interface FixtureSpan {
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

export const loadFixture = (file: string): FinishedSpan[] => {
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

export const toOpen = (span: FinishedSpan): OpenSpan => ({
  traceId: span.traceId,
  spanId: span.spanId,
  ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
  name: span.name,
  kind: span.kind,
  startTimeUnixNano: span.startTimeUnixNano,
  attributes: { ...span.attributes },
})

export const nsToMs = (ns: bigint): number =>
  Number((ns + 500_000n) / 1_000_000n)

export const T0 = 1_800_000_000_000

/** SYNTHETIC span, built in ms offsets. */
export const syn = (o: {
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

export const collect = (stitcher: RunStitcher): RunEvent[] => {
  const events: RunEvent[] = []
  stitcher.subscribe((e) => events.push(e))
  return events
}

export const ofType = <T extends RunEvent['type']>(
  events: RunEvent[],
  type: T
): Extract<RunEvent, { type: T }>[] =>
  events.filter((e): e is Extract<RunEvent, { type: T }> => e.type === type)

/** Feeds finished spans in order, as a sink with no start hook sees them. Returns the last end in ms. */
export const feedEnds = (
  stitcher: RunStitcher,
  spans: FinishedSpan[]
): number => {
  let now = 0
  for (const span of spans) {
    now = nsToMs(span.endTimeUnixNano)
    stitcher.end(span, now)
  }
  return now
}

/** Start and end frames in time order (a start before an end at the same instant). */
export const frames = (spans: FinishedSpan[]) =>
  spans
    .flatMap((span) => [
      { at: span.startTimeUnixNano, kind: 0 as const, span },
      { at: span.endTimeUnixNano, kind: 1 as const, span },
    ])
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind - b.kind))

export const sample = loadFixture('real-seminarhof-sample.json')
export const detail = loadFixture('real-getAdminBookingDetail.json')
export const denied = loadFixture('real-scenarioCleanup-403.json')

// ---------------------------------------------------------------------------
// Helpers for the snapshot-plus-events property (test 8).
// ---------------------------------------------------------------------------

export const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const shuffledBatches = <T>(
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

export interface FoldHop {
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
export interface FoldRun {
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
export type FoldState = Map<string, FoldRun>

export const emptyState = (): FoldState => new Map()

export const fromSnapshot = (snapshot: RunSnapshot): FoldState => {
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

export const fold = (state: FoldState, events: RunEvent[]): FoldState => {
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
export const normalise = (state: FoldState) =>
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
