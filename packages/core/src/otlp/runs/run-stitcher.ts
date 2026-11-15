import type { FinishedSpan } from '../../tracer.js'
import { DbAccumulator } from './db-summary.js'
import { HealthWindow } from './health-window.js'
import {
  boundAttrs,
  defaultClassify,
  durationMsOf,
  errorNameOf,
  functionIdOf,
  nsToMs,
  outcomeOf,
} from './span-facts.js'
import type {
  Attrs,
  HealthEntry,
  HealthEvent,
  HopView,
  RunEvent,
  RunOutcome,
  RunSnapshot,
  RunStitcher,
  RunView,
  SpanFrameEnd,
  SpanFrameStart,
  SpanRole,
  StitcherLimits,
  StitcherOptions,
} from './types.js'

const DEFAULT_LIMITS: StitcherLimits = {
  maxOpenRuns: 1000,
  maxSpansPerRun: 1000,
  maxRetained: 50,
  settleMs: 5_000,
  ttlMs: 120_000,
  healthWindowMs: 60_000,
}

const MAX_WALK = 64

type EventBody = RunEvent extends infer E
  ? E extends RunEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never

interface SpanRec {
  spanId: string
  parentSpanId: string | null
  name: string
  kind: string
  role: SpanRole
  functionId?: string
  startMs: number
  startNs: bigint
  /** Bounded; dropped once an event has carried it, so a closed run keeps nothing the views do not. */
  startAttrs?: Attrs
  /** A start frame arrived, so a start phase is owed. */
  hadStart: boolean
  startEmitted: boolean
  /** Counted in the run's open hops. */
  open: boolean
  ended: boolean
  endEmitted: boolean
  frame?: FinishedSpan
  db?: DbAccumulator
  parentHop?: string | null
  view?: HopView
}

interface Run {
  traceId: string
  rootSpanId?: string
  spans: Map<string, SpanRec>
  firstSeenNow: number
  lastSeenNow: number
  lastAtMs: number
  started: boolean
  closed: boolean
  rootEnd?: {
    nowMs: number
    atMs: number
    durationMs: number
    outcome: RunOutcome
    errorName: string | null
  }
  openHops: number
  firstFailure?: {
    spanId: string
    functionId?: string
    errorName: string | null
  }
  view?: RunView
}

/**
 * A pure state machine that stitches span frames into runs: one run per trace, with hops, a db summary per hop, an
 * outcome, and a stamped event for every change. The caller passes the time on every call; nothing here reads a clock.
 *
 * @example snippet: stitchRuns
 */
export const createRunStitcher = (
  options: StitcherOptions = {}
): RunStitcher => {
  const limits: StitcherLimits = { ...DEFAULT_LIMITS, ...options.limits }
  const classify = options.classify ?? defaultClassify
  const service = options.resource?.serviceName
  const health = new HealthWindow(limits.healthWindowMs)
  const listeners = new Set<(event: RunEvent) => void>()
  const open = new Map<string, Run>()
  const closed = new Map<string, Run>()
  let seq = 0
  let lastHealth = '[]'
  let lastEntries: HealthEntry[] | undefined

  const emit = (run: Run | undefined, at: number, body: EventBody): void => {
    if (run && at > run.lastAtMs) run.lastAtMs = at
    const event = { seq: ++seq, at, ...body } as RunEvent
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch {
        // A subscriber's bug never reaches the span path.
      }
    }
  }

  const nearestHop = (run: Run, rec: SpanRec): SpanRec | undefined => {
    const root = run.rootSpanId ? run.spans.get(run.rootSpanId) : undefined
    let current = rec
    for (let depth = 0; depth < MAX_WALK; depth++) {
      if (current === root) return undefined
      const parent = current.parentSpanId
        ? run.spans.get(current.parentSpanId)
        : undefined
      const next = parent ?? root
      if (!next || next === rec) return undefined
      if (next.role === 'hop') return next
      current = next
    }
    return undefined
  }

  const hopParentOf = (run: Run, rec: SpanRec): string | null => {
    if (rec.parentHop === undefined) {
      rec.parentHop = nearestHop(run, rec)?.spanId ?? null
    }
    return rec.parentHop
  }

  const viewOf = (run: Run, rec: SpanRec, attributes: Attrs): HopView => {
    if (!rec.view) {
      rec.view = {
        spanId: rec.spanId,
        parentSpanId: hopParentOf(run, rec),
        name: rec.name,
        kind: rec.kind,
        ...(rec.functionId ? { functionId: rec.functionId } : {}),
        attributes,
        hadStart: rec.startEmitted,
        startedAt: rec.startMs,
      }
      if (run.spans.get(rec.spanId) === rec) run.view?.hops.push(rec.view)
    }
    return rec.view
  }

  const emitStart = (run: Run, rec: SpanRec): void => {
    if (rec.startEmitted || rec.role !== 'hop') return
    rec.startEmitted = true
    const attributes = rec.startAttrs ?? {}
    rec.startAttrs = undefined
    const hop = viewOf(run, rec, { ...attributes })
    emit(run, rec.startMs, {
      type: 'run.hop',
      phase: 'start',
      traceId: run.traceId,
      spanId: rec.spanId,
      parentSpanId: hop.parentSpanId,
      name: rec.name,
      kind: rec.kind,
      ...(rec.functionId ? { functionId: rec.functionId } : {}),
      attributes,
    })
  }

  const emitEnd = (run: Run, rec: SpanRec): void => {
    const frame = rec.frame
    if (rec.endEmitted || rec.role !== 'hop' || !frame) return
    rec.endEmitted = true
    const attributes = boundAttrs(frame.attributes)
    rec.startAttrs = undefined
    const hop = viewOf(run, rec, { ...attributes })
    const endMs = nsToMs(frame.endTimeUnixNano)
    const durationMs = durationMsOf(
      frame.startTimeUnixNano,
      frame.endTimeUnixNano
    )
    const outcome = outcomeOf(frame)
    const errorName = outcome === 'ok' ? null : errorNameOf(frame)
    const db = rec.db && rec.db.size > 0 ? rec.db.summary() : undefined
    hop.attributes = { ...attributes }
    hop.endedAt = endMs
    hop.durationMs = durationMs
    hop.outcome = outcome
    hop.errorName = errorName
    if (db) hop.db = db
    health.record(rec.functionId ?? rec.name, endMs, durationMs, outcome)
    if (outcome === 'error' && !run.firstFailure) {
      run.firstFailure = {
        spanId: rec.spanId,
        ...(rec.functionId ? { functionId: rec.functionId } : {}),
        errorName,
      }
    }
    emit(run, endMs, {
      type: 'run.hop',
      phase: 'end',
      traceId: run.traceId,
      spanId: rec.spanId,
      parentSpanId: hop.parentSpanId,
      name: rec.name,
      kind: rec.kind,
      ...(rec.functionId ? { functionId: rec.functionId } : {}),
      attributes,
      durationMs,
      outcome,
      errorName,
      ...(db ? { db } : {}),
    })
    rec.frame = undefined
  }

  const foldDb = (run: Run, rec: SpanRec): void => {
    const frame = rec.frame
    if (rec.role !== 'db' || !frame) return
    const hop = nearestHop(run, rec)
    rec.frame = undefined
    if (run.rootSpanId !== rec.spanId) rec.startAttrs = undefined
    if (!hop || hop.endEmitted) return
    ;(hop.db ??= new DbAccumulator()).add(frame)
  }

  /** Handles one span's end once the run has its root. */
  const settleEnd = (run: Run, rec: SpanRec): void => {
    if (rec.role === 'db') foldDb(run, rec)
    else emitEnd(run, rec)
  }

  const startRun = (run: Run): void => {
    if (run.started) return
    const root = run.spans.get(run.rootSpanId!)!
    run.started = true
    run.view = {
      traceId: run.traceId,
      rootSpanId: root.spanId,
      ...(service ? { service } : {}),
      attributes: { ...root.startAttrs },
      startedAt: root.startMs,
      status: 'open',
      hops: [],
    }
    emit(run, root.startMs, {
      type: 'run.started',
      traceId: run.traceId,
      rootSpanId: root.spanId,
      ...(service ? { service } : {}),
      attributes: { ...root.startAttrs },
    })
    // What arrived before the root was known: starts, then db folds, then ends children-first.
    const recs = [...run.spans.values()]
    for (const rec of recs) if (rec.hadStart) emitStart(run, rec)
    for (const rec of recs) if (rec.ended && rec.role === 'db') foldDb(run, rec)
    const ended = recs
      .filter((rec) => rec.ended && rec.role !== 'db')
      .sort((a, b) =>
        a.frame && b.frame
          ? a.frame.endTimeUnixNano < b.frame.endTimeUnixNano
            ? -1
            : a.frame.endTimeUnixNano > b.frame.endTimeUnixNano
              ? 1
              : 0
          : 0
      )
    for (const rec of ended) emitEnd(run, rec)
    root.startAttrs = undefined
  }

  const retire = (run: Run): void => {
    open.delete(run.traceId)
    closed.set(run.traceId, run)
    while (closed.size > limits.maxRetained) {
      const oldest = closed.keys().next().value
      if (oldest === undefined) break
      closed.delete(oldest)
    }
  }

  const expire = (run: Run): void => {
    if (!run.started || !run.view) {
      open.delete(run.traceId)
      return
    }
    const rootStart = run.view.startedAt
    const durationMs = Math.max(0, run.lastAtMs - rootStart)
    run.closed = true
    run.view.endedAt = run.lastAtMs
    run.view.status = 'expired'
    run.view.outcome = 'expired'
    run.view.durationMs = durationMs
    emit(run, run.lastAtMs, {
      type: 'run.expired',
      traceId: run.traceId,
      durationMs,
      outcome: 'expired',
    })
    retire(run)
  }

  const maybeClose = (run: Run, nowMs: number): void => {
    const rootEnd = run.rootEnd
    if (run.closed || !run.started || !rootEnd) return
    if (run.openHops > 0 && nowMs - rootEnd.nowMs < limits.settleMs) return
    const root = run.spans.get(run.rootSpanId!)!
    const view = run.view!
    run.closed = true
    view.endedAt = rootEnd.atMs
    view.durationMs = rootEnd.durationMs
    view.outcome = rootEnd.outcome
    if (rootEnd.outcome === 'error') {
      const failure = run.firstFailure ?? {
        spanId: root.spanId,
        ...(root.functionId ? { functionId: root.functionId } : {}),
        errorName: rootEnd.errorName ?? 'Error',
      }
      view.status = 'failed'
      view.failure = failure
      emit(run, rootEnd.atMs, {
        type: 'run.failed',
        traceId: run.traceId,
        durationMs: rootEnd.durationMs,
        outcome: 'error',
        failure,
      })
    } else {
      view.status = 'finished'
      emit(run, rootEnd.atMs, {
        type: 'run.finished',
        traceId: run.traceId,
        durationMs: rootEnd.durationMs,
        outcome: rootEnd.outcome,
      })
    }
    retire(run)
  }

  const noteRootEnd = (run: Run, frame: FinishedSpan, nowMs: number): void => {
    run.rootEnd = {
      nowMs,
      atMs: nsToMs(frame.endTimeUnixNano),
      durationMs: durationMsOf(frame.startTimeUnixNano, frame.endTimeUnixNano),
      outcome: outcomeOf(frame),
      errorName: errorNameOf(frame),
    }
  }

  const runFor = (traceId: string, nowMs: number): Run => {
    const existing = open.get(traceId) ?? closed.get(traceId)
    if (existing) {
      existing.lastSeenNow = nowMs
      return existing
    }
    while (open.size >= limits.maxOpenRuns) {
      const oldest = open.values().next().value
      if (!oldest) break
      expire(oldest)
    }
    const run: Run = {
      traceId,
      spans: new Map(),
      firstSeenNow: nowMs,
      lastSeenNow: nowMs,
      lastAtMs: 0,
      started: false,
      closed: false,
      openHops: 0,
    }
    open.set(traceId, run)
    return run
  }

  const recOf = (span: SpanFrameStart, hadStart: boolean): SpanRec => ({
    spanId: span.spanId,
    parentSpanId: span.parentSpanId ?? null,
    name: span.name,
    kind: span.kind,
    role: classify(span),
    ...(functionIdOf(span) ? { functionId: functionIdOf(span) } : {}),
    startMs: nsToMs(span.startTimeUnixNano),
    startNs: span.startTimeUnixNano,
    startAttrs: boundAttrs(span.attributes),
    hadStart,
    startEmitted: false,
    open: false,
    ended: false,
    endEmitted: false,
  })

  /** Stores the record unless the run is full; the root is always stored. */
  const remember = (run: Run, rec: SpanRec, isRoot: boolean): boolean => {
    if (!isRoot && run.spans.size >= limits.maxSpansPerRun) return false
    run.spans.set(rec.spanId, rec)
    return true
  }

  const start = (span: SpanFrameStart, nowMs: number): void => {
    const run = runFor(span.traceId, nowMs)
    if (run.spans.has(span.spanId)) return
    const rec = recOf(span, true)
    const isRoot =
      run.rootSpanId === undefined &&
      (!span.parentSpanId || run.spans.size === 0)
    if (isRoot) run.rootSpanId = span.spanId
    const stored = remember(run, rec, isRoot)
    if (stored && rec.role === 'hop') {
      rec.open = true
      run.openHops++
    }
    if (run.rootSpanId === undefined) return
    if (!run.started) startRun(run)
    else emitStart(run, rec)
  }

  const end = (span: SpanFrameEnd, nowMs: number): void => {
    const run = runFor(span.traceId, nowMs)
    let rec = run.spans.get(span.spanId)
    if (rec?.ended) return
    if (!rec) {
      rec = recOf(span, false)
      if (run.rootSpanId === undefined && !span.parentSpanId) {
        run.rootSpanId = span.spanId
      }
      remember(run, rec, run.rootSpanId === span.spanId)
    }
    rec.ended = true
    rec.frame = span
    if (rec.open) {
      rec.open = false
      run.openHops--
    }
    if (run.rootSpanId === span.spanId) noteRootEnd(run, span, nowMs)
    if (run.rootSpanId === undefined) return
    if (!run.started) startRun(run)
    else settleEnd(run, rec)
    maybeClose(run, nowMs)
  }

  const resolveRoot = (run: Run): void => {
    let pick: SpanRec | undefined
    for (const rec of run.spans.values()) {
      if (rec.parentSpanId && run.spans.has(rec.parentSpanId)) continue
      if (!pick || rec.startNs < pick.startNs) pick = rec
    }
    pick ??= run.spans.values().next().value
    if (pick) run.rootSpanId = pick.spanId
  }

  const sweep = (nowMs: number): void => {
    for (const run of [...open.values()]) {
      if (run.rootSpanId === undefined) {
        if (nowMs - run.firstSeenNow < limits.settleMs) continue
        resolveRoot(run)
        if (run.rootSpanId === undefined) {
          open.delete(run.traceId)
          continue
        }
        const root = run.spans.get(run.rootSpanId)!
        if (root.ended && root.frame) noteRootEnd(run, root.frame, nowMs)
        startRun(run)
      }
      maybeClose(run, nowMs)
      if (!run.closed && nowMs - run.lastSeenNow >= limits.ttlMs) expire(run)
    }
    const entries = health.entries(nowMs)
    // The same array object means nothing changed since the last sweep: no work. Otherwise compare the text, because
    // a sample entering as another leaves can leave the entries as they were.
    if (entries !== lastEntries) {
      lastEntries = entries
      const text = JSON.stringify(entries)
      if (text !== lastHealth) {
        lastHealth = text
        emit(undefined, nowMs, {
          type: 'health',
          windowMs: limits.healthWindowMs,
          entries: entries.map((entry) => ({ ...entry })),
        })
      }
    }
  }

  const cloneView = (view: RunView): RunView => ({
    ...view,
    attributes: { ...view.attributes },
    ...(view.failure ? { failure: { ...view.failure } } : {}),
    hops: view.hops.map((hop) => ({
      ...hop,
      attributes: { ...hop.attributes },
      ...(hop.db ? { db: { ...hop.db, byOp: { ...hop.db.byOp } } } : {}),
    })),
  })

  const snapshot = (nowMs: number): RunSnapshot => {
    const healthEvent: HealthEvent = {
      type: 'health',
      windowMs: limits.healthWindowMs,
      entries: health.entries(nowMs).map((entry) => ({ ...entry })),
    }
    return {
      seq,
      serverTimeMs: nowMs,
      open: [...open.values()]
        .filter((r) => r.view)
        .map((r) => cloneView(r.view!)),
      recent: [...closed.values()].reverse().map((r) => cloneView(r.view!)),
      health: { seq, at: nowMs, ...healthEvent },
    }
  }

  return {
    start,
    end,
    sweep,
    snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
