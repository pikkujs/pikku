import type { FinishedSpan } from '../../tracer.js'
import { DbAccumulator } from './db-summary.js'
import { HealthWindow } from './health-window.js'
import {
  boundAttrs,
  cutName,
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
  maxClosedTraces: 10_000,
  maxTotalSpans: 50_000,
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
  /** A boundary under this hop failed: health counts the hop as an error, its own outcome stays. */
  boundaryFailed?: boolean
  /** A late db span changed `db` and the `update` event is not sent yet (the end time of the latest one). */
  pendingUpdateAt?: number
}

interface Run {
  traceId: string
  rootSpanId?: string
  spans: Map<string, SpanRec>
  firstSeenNow: number
  lastSeenNow: number
  lastAtMs: number
  /** The seq of the event that closed the run; orders `recent`. */
  closedSeq: number
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
  /** The first failed boundary: surfaced as `failure` on a run that finishes ok. */
  boundaryFailure?: {
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
  // Trace ids whose run left retention: a late span of one is ignored, never a second run rooted on itself.
  const forgotten = new Set<string>()
  // Spans held across every run, open or closed, root-less or not.
  let totalSpans = 0
  let seq = 0
  let lastHealth = '[]'
  let lastEntries: HealthEntry[] | undefined

  // Hops whose late db summary changed and whose `update` event is owed: one per hop, however many spans arrived.
  const pending = new Set<{ run: Run; rec: SpanRec }>()
  let flushing = false

  const emit = (run: Run | undefined, at: number, body: EventBody): number => {
    if (
      pending.size &&
      !flushing &&
      !(body.type === 'run.hop' && body.phase === 'update')
    ) {
      flushUpdates()
    }
    if (run && at > run.lastAtMs) run.lastAtMs = at
    const event = { seq: ++seq, at, ...body } as RunEvent
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch {
        // A subscriber's bug never reaches the span path.
      }
    }
    return event.seq
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
    hop.startSeq = emit(run, rec.startMs, {
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

  /**
   * A boundary is not drawn and is not a health key, so its failure would vanish. An error outcome (not a denial, as for
   * a hop) is a failure of the hop it hangs off (the one that was publishing), whether or not that hop caught it: the
   * hop is marked, so its health sample counts as an error (its own outcome stays), and the run remembers the first
   * one, which names the failure when the root fails and is carried as `failure` on a run that finishes ok. A boundary
   * with no hop above it is the root, whose own outcome already decides the run.
   */
  const noteBoundaryFailure = (
    run: Run,
    rec: SpanRec,
    frame: FinishedSpan
  ): void => {
    if (outcomeOf(frame) !== 'error') return
    const owner = hopParentOf(run, rec)
    const hop = owner ? run.spans.get(owner) : undefined
    if (!hop) return
    hop.boundaryFailed = true
    const failure = {
      spanId: hop.spanId,
      ...(hop.functionId ? { functionId: hop.functionId } : {}),
      errorName: errorNameOf(frame),
    }
    run.boundaryFailure ??= failure
    run.firstFailure ??= failure
  }

  const emitEnd = (run: Run, rec: SpanRec): void => {
    const frame = rec.frame
    if (rec.endEmitted || !frame) return
    if (rec.role === 'boundary') {
      rec.endEmitted = true
      rec.startAttrs = undefined
      rec.frame = undefined
      noteBoundaryFailure(run, rec, frame)
      return
    }
    if (rec.role !== 'hop') return
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
    const db = rec.db && rec.db.hasData ? rec.db.summary() : undefined
    hop.attributes = { ...attributes }
    hop.endedAt = endMs
    hop.durationMs = durationMs
    hop.outcome = outcome
    hop.errorName = errorName
    if (db) hop.db = db
    health.record(
      rec.functionId ?? rec.name,
      endMs,
      durationMs,
      outcome === 'ok' && rec.boundaryFailed ? 'error' : outcome
    )
    if (outcome === 'error' && !run.firstFailure) {
      run.firstFailure = {
        spanId: rec.spanId,
        ...(rec.functionId ? { functionId: rec.functionId } : {}),
        errorName,
      }
    }
    hop.endSeq = emit(run, endMs, {
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
    if (!hop) return
    if (hop.endEmitted) lateDb(run, hop, frame)
    else (hop.db ??= new DbAccumulator()).add(frame)
  }

  /**
   * A db span that ended after its hop's end was emitted: the summary's counts are frozen, so it is counted in
   * `dropped`. The change is announced by one `run.hop` `update` per hop, sent before the next other event, the next
   * sweep or the next snapshot, so a flood of late spans costs one event, not one each. The view is changed only when
   * the update is sent, which keeps a snapshot plus the later events equal to the stream.
   */
  const lateDb = (run: Run, hop: SpanRec, frame: FinishedSpan): void => {
    if (!hop.view) return
    ;(hop.db ??= new DbAccumulator()).late()
    const at = nsToMs(frame.endTimeUnixNano)
    if (hop.pendingUpdateAt === undefined) pending.add({ run, rec: hop })
    hop.pendingUpdateAt = Math.max(hop.pendingUpdateAt ?? at, at)
  }

  /** Sends the owed `update` events, one per hop; one whose run left the stitcher is dropped. */
  function flushUpdates(): void {
    if (flushing) return
    flushing = true
    try {
      for (const entry of [...pending]) {
        pending.delete(entry)
        const { run, rec: hop } = entry
        const at = hop.pendingUpdateAt
        hop.pendingUpdateAt = undefined
        const view = hop.view
        const held =
          open.get(run.traceId) === run || closed.get(run.traceId) === run
        if (at === undefined || !view || !hop.db || !held) continue
        const db = hop.db.summary()
        view.db = { ...db, byOp: { ...db.byOp } }
        emit(run, at, {
          type: 'run.hop',
          phase: 'update',
          traceId: run.traceId,
          spanId: hop.spanId,
          parentSpanId: view.parentSpanId,
          name: hop.name,
          kind: hop.kind,
          ...(hop.functionId ? { functionId: hop.functionId } : {}),
          attributes: { ...view.attributes },
          db,
        })
      }
    } finally {
      flushing = false
    }
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
      startedSeq: 0,
      status: 'open',
      hops: [],
    }
    run.view.startedSeq = emit(run, root.startMs, {
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

  const forget = (traceId: string): void => {
    forgotten.add(traceId)
    while (forgotten.size > limits.maxClosedTraces) {
      const oldest = forgotten.values().next().value
      if (oldest === undefined) break
      forgotten.delete(oldest)
    }
  }

  /**
   * Drops a run the stitcher no longer holds. A run that was announced (it started) has its trace id remembered, so a
   * late span does not reopen it as a second run. One that never started is not remembered: nothing was reported for
   * it, so a later span of the trace is a fresh trace, not a loss.
   */
  const discard = (run: Run): void => {
    totalSpans -= run.spans.size
    if (run.started) forget(run.traceId)
  }

  /** The closed run seen least recently; the earliest closed on a tie. */
  const leastRecentlyClosed = (): Run | undefined => {
    let pick: Run | undefined
    for (const run of closed.values()) {
      if (
        !pick ||
        run.lastSeenNow < pick.lastSeenNow ||
        (run.lastSeenNow === pick.lastSeenNow && run.closedSeq < pick.closedSeq)
      ) {
        pick = run
      }
    }
    return pick
  }

  const retire = (run: Run): void => {
    open.delete(run.traceId)
    closed.set(run.traceId, run)
    while (closed.size > limits.maxRetained) {
      const victim = leastRecentlyClosed()
      if (!victim) break
      closed.delete(victim.traceId)
      discard(victim)
    }
  }

  const expire = (run: Run): void => {
    if (!run.started || !run.view) {
      open.delete(run.traceId)
      discard(run)
      return
    }
    const rootStart = run.view.startedAt
    const durationMs = Math.max(0, run.lastAtMs - rootStart)
    run.closed = true
    run.view.endedAt = run.lastAtMs
    run.view.status = 'expired'
    run.view.outcome = 'expired'
    run.view.durationMs = durationMs
    run.closedSeq = emit(run, run.lastAtMs, {
      type: 'run.expired',
      traceId: run.traceId,
      durationMs,
      outcome: 'expired',
    })
    run.view.closedSeq = run.closedSeq
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
      run.closedSeq = emit(run, rootEnd.atMs, {
        type: 'run.failed',
        traceId: run.traceId,
        durationMs: rootEnd.durationMs,
        outcome: 'error',
        failure,
      })
      view.closedSeq = run.closedSeq
    } else {
      view.status = 'finished'
      // The root did not fail, but a publish under it did: the run says so without changing its outcome.
      const failure = run.boundaryFailure
      if (failure) view.failure = { ...failure }
      run.closedSeq = emit(run, rootEnd.atMs, {
        type: 'run.finished',
        traceId: run.traceId,
        durationMs: rootEnd.durationMs,
        outcome: rootEnd.outcome,
        ...(failure ? { failure: { ...failure } } : {}),
      })
      view.closedSeq = run.closedSeq
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

  const resolveRoot = (run: Run): void => {
    let pick: SpanRec | undefined
    for (const rec of run.spans.values()) {
      if (rec.parentSpanId && run.spans.has(rec.parentSpanId)) continue
      if (!pick || rec.startNs < pick.startNs) pick = rec
    }
    pick ??= run.spans.values().next().value
    if (pick) run.rootSpanId = pick.spanId
  }

  /** Picks the root of a trace that has none, and starts it. False when the trace holds no span. */
  const settleRoot = (run: Run, nowMs: number): boolean => {
    resolveRoot(run)
    if (run.rootSpanId === undefined) return false
    const root = run.spans.get(run.rootSpanId)!
    if (root.ended && root.frame) noteRootEnd(run, root.frame, nowMs)
    startRun(run)
    return true
  }

  /**
   * Removes the least recently seen open run to make room. A trace still waiting for its root is settled first (its
   * best root is picked and what it holds is reported) rather than dropped, so nothing already seen is lost silently.
   */
  const evict = (run: Run, nowMs: number): void => {
    if (!run.started && !settleRoot(run, nowMs)) {
      open.delete(run.traceId)
      discard(run)
      return
    }
    maybeClose(run, nowMs)
    if (!run.closed) expire(run)
  }

  /** The run for a trace, marked seen; undefined when the trace closed and left retention (the span is ignored). */
  const runFor = (traceId: string, nowMs: number): Run | undefined => {
    const existing = open.get(traceId)
    if (existing) {
      existing.lastSeenNow = nowMs
      // Most recently seen goes to the back: the front of `open` is the one to evict.
      open.delete(traceId)
      open.set(traceId, existing)
      return existing
    }
    const retained = closed.get(traceId)
    if (retained) {
      retained.lastSeenNow = nowMs
      return retained
    }
    if (forgotten.has(traceId)) return undefined
    while (open.size >= limits.maxOpenRuns) {
      const oldest = open.values().next().value
      if (!oldest) break
      evict(oldest, nowMs)
    }
    const run: Run = {
      traceId,
      spans: new Map(),
      firstSeenNow: nowMs,
      lastSeenNow: nowMs,
      lastAtMs: 0,
      closedSeq: 0,
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
    name: cutName(span.name),
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

  /** Frees room when the stitcher holds more spans than `maxTotalSpans`: root-less traces first, then closed runs, then open ones. */
  const enforceTotal = (current: Run): void => {
    while (totalSpans > limits.maxTotalSpans) {
      let victim: Run | undefined
      for (const run of open.values()) {
        if (run !== current && !run.started) {
          victim = run
          break
        }
      }
      if (victim) {
        open.delete(victim.traceId)
        discard(victim)
        continue
      }
      const stale = leastRecentlyClosed()
      if (stale && stale !== current) {
        closed.delete(stale.traceId)
        discard(stale)
        continue
      }
      for (const run of open.values()) {
        if (run !== current) {
          victim = run
          break
        }
      }
      if (!victim) return
      expire(victim)
    }
  }

  /**
   * Stores the record, or returns false when the run is full: a span past `maxSpansPerRun` is ignored entirely (no
   * event, no view, no health), so it cannot be reported once and then lost. The root is always stored.
   */
  const remember = (run: Run, rec: SpanRec, isRoot: boolean): boolean => {
    if (!isRoot && run.spans.size >= limits.maxSpansPerRun) return false
    run.spans.set(rec.spanId, rec)
    totalSpans++
    enforceTotal(run)
    return true
  }

  const start = (span: SpanFrameStart, nowMs: number): void => {
    const run = runFor(span.traceId, nowMs)
    if (!run || run.spans.has(span.spanId)) return
    const rec = recOf(span, true)
    // With start frames the first span seen for a trace is the root at once, a foreign parent or not (a queue worker,
    // a trusted inbound traceparent): it is announced live. Only end frames wait for `settleMs`, because they cannot
    // tell a foreign parent from one not yet arrived. Known limit: a sink registered mid-request sees a child first,
    // and that child becomes the root.
    const isRoot =
      run.rootSpanId === undefined &&
      (!span.parentSpanId || run.spans.size === 0)
    if (!remember(run, rec, isRoot)) return
    if (isRoot) run.rootSpanId = span.spanId
    if (rec.role === 'hop') {
      rec.open = true
      run.openHops++
    }
    if (run.rootSpanId === undefined) return
    if (!run.started) startRun(run)
    else emitStart(run, rec)
  }

  const end = (span: SpanFrameEnd, nowMs: number): void => {
    const priorSeen = closed.get(span.traceId)?.lastSeenNow
    const run = runFor(span.traceId, nowMs)
    if (!run) return
    let rec = run.spans.get(span.spanId)
    if (rec?.ended) return
    if (!rec) {
      rec = recOf(span, false)
      const isRoot = run.rootSpanId === undefined && !span.parentSpanId
      if (!remember(run, rec, isRoot)) return
      if (isRoot) run.rootSpanId = span.spanId
    }
    // A db span after the run closed is folded and counted but does not refresh the run: a flood of them must not keep
    // a closed run from being evicted.
    if (run.closed && rec.role === 'db' && priorSeen !== undefined)
      run.lastSeenNow = priorSeen
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

  const sweep = (nowMs: number): void => {
    flushUpdates()
    for (const run of [...open.values()]) {
      if (run.rootSpanId === undefined) {
        if (nowMs - run.firstSeenNow < limits.settleMs) continue
        if (!settleRoot(run, nowMs)) {
          open.delete(run.traceId)
          discard(run)
          continue
        }
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
    flushUpdates()
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
      recent: [...closed.values()]
        .sort((a, b) => b.closedSeq - a.closedSeq)
        .map((r) => cloneView(r.view!)),
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
