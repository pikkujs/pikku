import type { FinishedSpan, SpanAttributeValue } from '../../tracer.js'
import type { OpenSpan } from '../otlp-sink.js'

/** What a sink's `onSpanStart` receives. */
export type SpanFrameStart = OpenSpan
/** What a sink's `exportSpans` receives. */
export type SpanFrameEnd = FinishedSpan
export type Attrs = Record<string, SpanAttributeValue>

/**
 * How a span counts in a run. `hop`: shown and a health key. `boundary`: not shown, its children hang off its
 * nearest hop ancestor. `db`: folded into the nearest hop's {@link DbSummary}.
 */
export type SpanRole = 'hop' | 'boundary' | 'db'

export interface StitcherLimits {
  /**
   * Runs open at once, and traces still waiting for their root. The least recently seen is evicted: a started run
   * expires (its later spans are then ignored), a trace still waiting for its root is settled and reported first.
   * Default 1000.
   */
  maxOpenRuns: number
  /**
   * Spans remembered per run. A span past it is ignored entirely: no event, no view, no health, and a duplicate of it
   * is ignored too. Its run still closes on its root. Default 1000.
   */
  maxSpansPerRun: number
  /**
   * Closed runs kept for late children and for `snapshot().recent`; the least recently seen is dropped. Default 50.
   */
  maxRetained: number
  /**
   * Trace ids of runs that started and then left retention (or were evicted), so a late span of one is recognised and
   * ignored, never a second run rooted on itself. Bounded and separate from `maxRetained`; the oldest is forgotten
   * first, and a span of a forgotten trace starts a new one. Default 10000.
   */
  maxClosedTraces: number
  /**
   * Spans held across all runs, open, closed and root-less. Over it, root-less traces go first, then closed runs, then
   * the least recently seen open runs (which expire). Default 50000.
   */
  maxTotalSpans: number
  /** How long a trace waits for a root, and how long a run lingers for open hops after its root ended. Default 5000. */
  settleMs: number
  /** An open run with no activity for this long expires. Default 120000. */
  ttlMs: number
  /** The sliding window of `health` entries. Default 60000. */
  healthWindowMs: number
}

export interface StitcherOptions {
  classify?(span: SpanFrameStart): SpanRole
  limits?: Partial<StitcherLimits>
  resource?: { serviceName: string }
}

export interface DbSummary {
  count: number
  totalMs: number
  /** Key: `${db.operation.name} ${db.collection.name}`. */
  byOp: Record<string, number>
  /** Calls beyond the first with the same `db.query.text`. Present only when a span carried the text. */
  repeated?: number
  /**
   * Db spans that ended after their hop's end was reported: counted here, not in `count`, `totalMs` or `byOp`. Present
   * only when there were some; each one is announced by a `run.hop` event with phase `update`.
   */
  dropped?: number
}

export type RunOutcome = 'ok' | 'error' | 'denied'

export interface HealthEntry {
  key: string
  runs: number
  errors: number
  denied: number
  avgMs: number
}

export type HealthEvent = {
  type: 'health'
  windowMs: number
  entries: HealthEntry[]
}

export type RunEvent = { seq: number; at: number } & (
  | {
      type: 'run.started'
      traceId: string
      rootSpanId: string
      service?: string
      attributes: Attrs
    }
  | {
      type: 'run.hop'
      /** `update`: the hop's `db` changed after its end (a late db span); nothing else did. */
      phase: 'start' | 'end' | 'update'
      traceId: string
      spanId: string
      parentSpanId: string | null
      name: string
      kind: string
      functionId?: string
      attributes: Attrs
      durationMs?: number
      outcome?: RunOutcome
      errorName?: string | null
      db?: DbSummary
    }
  | {
      type: 'run.finished' | 'run.failed' | 'run.expired'
      traceId: string
      durationMs: number
      outcome: RunOutcome | 'expired'
      failure?: {
        spanId: string
        functionId?: string
        errorName: string | null
      }
    }
  | HealthEvent
)

export interface HopView {
  spanId: string
  parentSpanId: string | null
  name: string
  kind: string
  functionId?: string
  /**
   * The attributes of the hop's latest event: the end frame's once it has ended, else the start frame's. Bounded
   * (the same copy the `run.hop` events carry).
   */
  attributes: Attrs
  /**
   * A start frame arrived, so a `run.hop` start event was sent. False for a hop seen only at its end (the sink has no
   * `onSpanStart`, or the end came first): a consumer rebuilding from a snapshot must not replay a start the stream
   * never sent.
   */
  hadStart: boolean
  /** The `seq` of this hop's `run.hop` start event; absent when none was sent (the same as `hadStart` false). */
  startSeq?: number
  /** The `seq` of its `run.hop` end event; absent while the hop is open. */
  endSeq?: number
  startedAt: number
  endedAt?: number
  durationMs?: number
  outcome?: RunOutcome
  errorName?: string | null
  db?: DbSummary
}

export interface RunView {
  traceId: string
  rootSpanId: string
  service?: string
  /** The root span's attributes, as `run.started` carries them (entry wire, user id, ...). Bounded. */
  attributes: Attrs
  startedAt: number
  /**
   * The `seq` of the run's `run.started` event. With the hops' `startSeq` and `endSeq` and `closedSeq` it lets a client
   * rebuilding from a snapshot replay the run's events in exactly the order the stream sent them: event times are whole
   * milliseconds and tie, seqs do not.
   */
  startedSeq: number
  /** When the run closed: the `at` of its `run.finished`, `run.failed` or `run.expired`. Absent while open. */
  endedAt?: number
  /** The `seq` of the closing event. Absent while open. */
  closedSeq?: number
  status: 'open' | 'finished' | 'failed' | 'expired'
  outcome?: RunOutcome | 'expired'
  durationMs?: number
  /** The first failed hop of a failed run, or the hop whose publish (a boundary span) failed in a run that finished ok. */
  failure?: { spanId: string; functionId?: string; errorName: string | null }
  hops: HopView[]
}

export interface RunSnapshot {
  /** The seq of the last event this snapshot reflects: apply buffered events with a greater seq. */
  seq: number
  serverTimeMs: number
  open: RunView[]
  /** Closed runs, newest first. */
  recent: RunView[]
  health: Extract<RunEvent, { type: 'health' }>
}

/**
 * What {@link createRunStitcher} returns. `seq` rises by one per event; a snapshot carries the seq it reflects, so a
 * client applies the events after it.
 *
 * @example snippet: stitchRuns
 */
export interface RunStitcher {
  start(span: SpanFrameStart, nowMs: number): void
  end(span: SpanFrameEnd, nowMs: number): void
  /** Settles runs, expires the stale, evicts, and emits a `health` event when the window changed. */
  sweep(nowMs: number): void
  snapshot(nowMs: number): RunSnapshot
  subscribe(listener: (event: RunEvent) => void): () => void
}
