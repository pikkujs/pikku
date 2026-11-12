/**
 * The engine interface Pikku Studio reads telemetry through, and the row types
 * it returns.
 *
 * Types only. A backend (an in-memory store, a GreptimeDB addon, a cloud
 * store) implements `TelemetryStore`; `@pikku/core/telemetry-store/testing`
 * holds the reference implementation and the conformance suite that proves a
 * backend does what the screens assume.
 */

/**
 * Whose telemetry. Both fields are required, always: a store never answers
 * across projects or stages. A stage is a named environment (`production`,
 * `develop`), not a release id.
 */
export interface TelemetryScope {
  project: string
  stage: string
}

export type Severity = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type TelemetryAttributes = Record<string, string | number | boolean>

export interface LogRecord {
  /** Epoch milliseconds. */
  at: number
  severity: Severity
  body: string
  traceId?: string
  spanId?: string
  functionId?: string
  wireType?: string
  wireId?: string
  /** Where the line came from: `app`, `dev`, `stage`, `website`, `studio`. */
  source: string
  attributes?: TelemetryAttributes
  /**
   * Read side only, never ingested. The duration of the request this line was
   * written in: the root span of `traceId`, joined by the store. Absent when
   * the line has no trace, or its root span is not (yet) stored. When a trace
   * stores more than one root span, the longest duration wins.
   */
  durationMs?: number
}

/** A finished span, with millisecond times. */
export interface SpanRecord {
  traceId: string
  spanId: string
  /** Absent on the root span of a trace. */
  parentSpanId?: string
  name: string
  kind: string
  startAt: number
  endAt: number
  durationMs: number
  status: 'ok' | 'error' | 'unset'
  statusMessage?: string
  /**
   * Well-known keys the read side groups by: `pikku.function.id`,
   * `pikku.wire.type`, `pikku.wire.id`, `pikku.queue.name`.
   */
  attributes: TelemetryAttributes
}

export interface MetricPoint {
  /** Epoch milliseconds. */
  at: number
  name: string
  value: number
  attributes?: TelemetryAttributes
}

/**
 * Narrows a read to one tenant. `org` matches the `pikku.org.id` attribute and
 * `user` the `pikku.user.id` attribute, on the span (for span reads) or the log
 * line (for log reads). Fail closed: a store with no value for a named key
 * returns nothing, never the unfiltered rows.
 */
export interface TenantFilter {
  org?: string
  user?: string
}

export interface LogsQuery {
  /** Inclusive lower bound on `at`. */
  since?: number
  /** Exclusive upper bound on `at`. */
  until?: number
  /** Default 100. The newest `limit` matches are returned. */
  limit?: number
  /** Exact severity. */
  severity?: Severity
  /** Case-insensitive substring of the body. */
  search?: string
  traceId?: string
  functionId?: string
  wireType?: string
  wireId?: string
  source?: string
  tenant?: TenantFilter
}

export interface LogFacets {
  /** Every severity is present; the ones with no records are 0. */
  severities: Record<Severity, number>
  /** Distinct function ids, sorted. */
  functions: string[]
  /** Distinct wire ids, sorted. */
  wires: string[]
}

export interface FailureRow {
  functionId: string
  wireType: string | null
  message: string
  count: number
  last: number | null
  sampleTraceId: string | null
  /** Start of the earliest failure in the group. */
  firstSeen?: number | null
  /** From the latest failure of the group; null when it carries no value. */
  httpPath?: string | null
  httpMethod?: string | null
  httpStatus?: number | null
}

export interface MetricsSummaryFunction {
  name: string
  wire: string | null
  requests: number
  errors: number
  avgMs: number | null
  lastRun: number | null
}

export interface MetricsSummaryRow {
  totals: {
    requests: number
    errors: number
    avgMs: number | null
    maxMs: number | null
  }
  /** Non-empty buckets only, oldest first. `at` is the bucket start. */
  traffic: Array<{
    at: number
    requests: number
    errors: number
    avgMs: number
    maxMs: number
  }>
  functions: MetricsSummaryFunction[]
}

export interface QueueJobRow {
  queue: string
  completed: number
  failed: number
  lastRun: number | null
  /** Newest first, at most 10. */
  recent: Array<{
    at: number
    outcome: string
    durationMs: number | null
    error: string | null
  }>
}

export interface FunctionMetricsRow {
  functionId: string
  wireType: string | null
  requests: number
  errors: number
  /** Mean root-span duration, so request-weighted across buckets. */
  avgMs: number | null
  lastRun: number | null
  /** Non-empty buckets only, oldest first. `at` is the bucket start. */
  buckets: Array<{ at: number; requests: number; errors: number }>
}

export interface WireTypeRow {
  wireType: string
  requests: number
}

export interface WireRunRow {
  /** The function id of the task (`pikku.function.id`, else the span name). */
  name: string
  wireType: string
  completed: number
  failed: number
  lastRun: number | null
  /** Newest first, at most 10. */
  recent: Array<{
    at: number
    outcome: string
    durationMs: number | null
    error: string | null
  }>
}

/** Opaque. Only a value a store returned is a valid cursor for that store. */
export type TailCursor = string

export interface TelemetryStore {
  /**
   * The write half is optional: a store over an ingest path it does not own
   * (the cloud's) is read-only.
   */
  appendLogs?(scope: TelemetryScope, records: LogRecord[]): Promise<void>
  appendMetrics?(scope: TelemetryScope, points: MetricPoint[]): Promise<void>
  appendSpans?(scope: TelemetryScope, spans: SpanRecord[]): Promise<void>
  /** Forget everything for a project, in every stage. */
  deleteProject?(project: string): Promise<void>
  /** Drop records older than `policy.days`. */
  retain?(policy: { days: number }): Promise<void>

  /** Newest first, up to `q.limit` (default 100). */
  logs(scope: TelemetryScope, q: LogsQuery): Promise<LogRecord[]>
  logFacets(scope: TelemetryScope, q: { since?: number }): Promise<LogFacets>
  /**
   * Error root spans grouped by function, wire and message, most frequent
   * first (ties: most recent first). Default `limit` 50. `sampleTraceId` is
   * the trace of the latest failure in the group, by start time, not the
   * largest id. Two failures with an identical start time: which is "latest"
   * is undefined.
   */
  failures(
    scope: TelemetryScope,
    q: { since: number; limit?: number }
  ): Promise<FailureRow[]>
  /**
   * Points of one metric (a trailing `*` matches by prefix; no name matches
   * all), oldest first. When `limit` cuts the list it keeps the newest.
   */
  metrics(
    scope: TelemetryScope,
    q: { name?: string; since: number; until?: number; limit?: number }
  ): Promise<MetricPoint[]>
  /**
   * Root spans in `[since, until)`. Default 30 buckets. Bucket width is
   * `ceil((until - since) / buckets)` and buckets are aligned to `since` (the
   * origin, as `date_bin(width, ts, since)` does), not to the epoch; `at` is
   * the bucket start. Only non-empty buckets are returned.
   */
  metricsSummary(
    scope: TelemetryScope,
    q: {
      since: number
      until: number
      buckets?: number
      /** Narrows totals, traffic and functions to one function. */
      functionId?: string
      tenant?: TenantFilter
    }
  ): Promise<MetricsSummaryRow>
  /**
   * Every span of a trace, oldest first; spans with the same start time order
   * by span id ascending. An unknown trace is `[]`. With `tenant`, the trace is
   * returned only when at least one of its spans carries every named key and no
   * span carries a different value for it; otherwise `[]`.
   */
  trace(
    scope: TelemetryScope,
    traceId: string,
    q?: { tenant?: TenantFilter }
  ): Promise<SpanRecord[]>
  /**
   * Queue-wire root spans (a child span is never a job) grouped by queue, most
   * recently run first (ties: queue name ascending). Default `limit` 50, a
   * positive integer or the call throws; `recent` holds the newest 10, equal
   * start times ordered by span id descending.
   */
  queueJobs(
    scope: TelemetryScope,
    q: { since: number; limit?: number }
  ): Promise<QueueJobRow[]>
  /**
   * Root spans in `[since, until)` grouped by function and wire type, most
   * requests first (ties: function id ascending in code unit order, so `B` before `a`), at most `limit` (default
   * 200). `buckets` (default 30) and their alignment are those of
   * `metricsSummary`. `limit` is a positive integer or the call throws.
   */
  functionMetrics(
    scope: TelemetryScope,
    q: {
      since: number
      until: number
      buckets?: number
      limit?: number
      tenant?: TenantFilter
    }
  ): Promise<FunctionMetricsRow[]>
  /**
   * Root spans in `[since, until)` counted by wire type, most requests first
   * (ties: wire type ascending in code unit order). A span with no wire type is `'unknown'`.
   * `until` is exclusive and defaults to no upper bound.
   */
  wireTypes(
    scope: TelemetryScope,
    q: { since: number; until?: number; tenant?: TenantFilter }
  ): Promise<WireTypeRow[]>
  /**
   * Root spans of one wire type (`scheduler`, `queue`, ...) from `since`,
   * grouped by function id, most recently run first (ties: function id
   * ascending). Default `limit` 50; `recent` holds the newest 10, equal start
   * times ordered by span id descending. `queueJobs` is this grouped by queue name.
   */
  wireRuns(
    scope: TelemetryScope,
    q: { wireType: string; since: number; limit?: number }
  ): Promise<WireRunRow[]>
  /**
   * Log records ordered by `at`, then a stable store-defined tiebreak, after
   * `cursor`; `null` starts at the beginning. The cursor is opaque. The
   * guarantee: every record visible at read time whose position is after the
   * cursor is returned exactly once across successive pages, none duplicated or
   * lost, records sharing a timestamp included. A record that arrives late with
   * a position before the cursor is NOT guaranteed to be returned. With nothing
   * new the same cursor comes back. A store over an append-only table must not
   * overwrite rows that share a timestamp, or records would be lost. A store with
   * an ingest delay (OpenObserve, GreptimeDB) may need its consumers to lag the
   * read horizon slightly, because a record can become visible after a later
   * one was already returned.
   */
  tail(
    scope: TelemetryScope,
    cursor: TailCursor | null,
    q: { limit?: number }
  ): Promise<{ records: LogRecord[]; cursor: TailCursor }>
  close?(): Promise<void>
}
