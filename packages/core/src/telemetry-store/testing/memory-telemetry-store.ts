import type {
  FailureRow,
  FunctionMetricsRow,
  LogFacets,
  LogRecord,
  LogsQuery,
  MetricPoint,
  MetricsSummaryFunction,
  MetricsSummaryRow,
  QueueJobRow,
  Severity,
  SpanRecord,
  TailCursor,
  TelemetryScope,
  TelemetryStore,
  TenantFilter,
  WireRunRow,
  WireTypeRow,
} from '../telemetry-store.types.js'

const SEVERITIES: Severity[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]
const DAY_MS = 86_400_000

type Bucket = {
  logs: Array<{ seq: number; record: LogRecord }>
  spans: SpanRecord[]
  metrics: MetricPoint[]
}

const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const isRoot = (span: SpanRecord) => !span.parentSpanId

const TENANT_KEYS = [
  ['org', 'pikku.org.id'],
  ['user', 'pikku.user.id'],
] as const

const tenantKeys = (tenant: TenantFilter | undefined) =>
  TENANT_KEYS.filter(([field]) => tenant?.[field] !== undefined)

const matchesTenant = (
  attributes: Record<string, unknown> | undefined,
  tenant: TenantFilter | undefined
) =>
  tenantKeys(tenant).every(
    ([field, key]) => attributes?.[key] === tenant![field]
  )

const positive = (
  value: number | undefined,
  name: string,
  fallback: number
) => {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`)
  }
  return value
}

const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const average = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length

const bucketsOf = (
  spans: SpanRecord[],
  since: number,
  until: number,
  buckets: number
) => {
  const width = Math.max(1, Math.ceil((until - since) / buckets))
  const byBucket = new Map<number, SpanRecord[]>()
  for (const span of spans) {
    const index = Math.floor((span.startAt - since) / width)
    byBucket.set(index, [...(byBucket.get(index) ?? []), span])
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, group]) => ({ at: since + index * width, group }))
}

const num = (value: unknown): number | null =>
  typeof value === 'number' ? value : null

/**
 * A `TelemetryStore` that keeps everything in process memory. It is the
 * reference the conformance suite is written against, and what tests of
 * anything that reads telemetry should use instead of a mock.
 *
 * Records are copied on the way in and out, so a caller mutating a row it was
 * handed cannot change the store.
 */
export class MemoryTelemetryStore implements TelemetryStore {
  private readonly buckets = new Map<string, Bucket>()
  private seq = 0

  private bucket(scope: TelemetryScope): Bucket {
    if (!scope?.project || !scope.stage) {
      throw new TypeError('a telemetry scope needs a project and a stage')
    }
    const key = `${scope.project}\u0000${scope.stage}`
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { logs: [], spans: [], metrics: [] }
      this.buckets.set(key, bucket)
    }
    return bucket
  }

  async appendLogs(scope: TelemetryScope, records: LogRecord[]) {
    const bucket = this.bucket(scope)
    for (const record of records) {
      bucket.logs.push({ seq: ++this.seq, record: structuredClone(record) })
    }
  }

  async appendSpans(scope: TelemetryScope, spans: SpanRecord[]) {
    this.bucket(scope).spans.push(...structuredClone(spans))
  }

  async appendMetrics(scope: TelemetryScope, points: MetricPoint[]) {
    this.bucket(scope).metrics.push(...structuredClone(points))
  }

  async deleteProject(project: string) {
    const prefix = `${project}\u0000`
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) this.buckets.delete(key)
    }
  }

  async retain(policy: { days: number }) {
    const cutoff = Date.now() - policy.days * DAY_MS
    for (const bucket of this.buckets.values()) {
      bucket.logs = bucket.logs.filter(({ record }) => record.at >= cutoff)
      bucket.spans = bucket.spans.filter((span) => span.startAt >= cutoff)
      bucket.metrics = bucket.metrics.filter((point) => point.at >= cutoff)
    }
  }

  async logs(scope: TelemetryScope, q: LogsQuery): Promise<LogRecord[]> {
    const search = q.search?.toLowerCase()
    const bucket = this.bucket(scope)
    const rootDuration = new Map<string, number>()
    for (const span of bucket.spans) {
      if (isRoot(span)) {
        rootDuration.set(
          span.traceId,
          Math.max(rootDuration.get(span.traceId) ?? -Infinity, span.durationMs)
        )
      }
    }
    const matches = bucket.logs
      .map(({ record }) => record)
      .filter(
        (r) =>
          (q.since === undefined || r.at >= q.since) &&
          (q.until === undefined || r.at < q.until) &&
          (q.severity === undefined || r.severity === q.severity) &&
          (search === undefined || r.body.toLowerCase().includes(search)) &&
          (q.traceId === undefined || r.traceId === q.traceId) &&
          (q.functionId === undefined || r.functionId === q.functionId) &&
          (q.wireType === undefined || r.wireType === q.wireType) &&
          (q.wireId === undefined || r.wireId === q.wireId) &&
          (q.source === undefined || r.source === q.source) &&
          matchesTenant(r.attributes, q.tenant)
      )
      // Stable, so records sharing a timestamp keep their ingestion order.
      .sort((a, b) => b.at - a.at)
    return structuredClone(
      matches.slice(0, q.limit ?? 100).map((record) => {
        const durationMs =
          record.traceId === undefined
            ? undefined
            : rootDuration.get(record.traceId)
        return durationMs === undefined ? record : { ...record, durationMs }
      })
    )
  }

  async logFacets(
    scope: TelemetryScope,
    q: { since?: number }
  ): Promise<LogFacets> {
    const severities = Object.fromEntries(
      SEVERITIES.map((s) => [s, 0])
    ) as Record<Severity, number>
    const functions = new Set<string>()
    const wires = new Set<string>()
    for (const { record } of this.bucket(scope).logs) {
      if (q.since !== undefined && record.at < q.since) continue
      severities[record.severity]++
      if (record.functionId) functions.add(record.functionId)
      if (record.wireId) wires.add(record.wireId)
    }
    return {
      severities,
      functions: [...functions].sort(),
      wires: [...wires].sort(),
    }
  }

  async failures(
    scope: TelemetryScope,
    q: { since: number; limit?: number }
  ): Promise<FailureRow[]> {
    const groups = new Map<string, FailureRow & { lastAt: number }>()
    for (const span of this.bucket(scope).spans) {
      if (!isRoot(span) || span.status !== 'error' || span.startAt < q.since)
        continue
      const functionId = str(span.attributes['pikku.function.id']) ?? span.name
      const wireType = str(span.attributes['pikku.wire.type'])
      const message = span.statusMessage ?? ''
      const key = JSON.stringify([functionId, wireType, message])
      const group = groups.get(key) ?? {
        functionId,
        wireType,
        message,
        count: 0,
        last: null,
        sampleTraceId: null,
        firstSeen: null,
        httpPath: null,
        httpMethod: null,
        httpStatus: null,
        lastAt: -Infinity,
      }
      group.count++
      group.firstSeen = Math.min(group.firstSeen ?? Infinity, span.startAt)
      if (span.startAt >= group.lastAt) {
        group.lastAt = span.startAt
        group.last = span.startAt
        group.sampleTraceId = span.traceId
        group.httpPath = str(span.attributes['pikku.http.path'])
        group.httpMethod = str(span.attributes['pikku.http.method'])
        group.httpStatus = num(span.attributes['http.response.status_code'])
      }
      groups.set(key, group)
    }
    return [...groups.values()]
      .sort((a, b) => b.count - a.count || (b.last ?? 0) - (a.last ?? 0))
      .slice(0, q.limit ?? 50)
      .map(({ lastAt: _lastAt, ...row }) => row)
  }

  async metrics(
    scope: TelemetryScope,
    q: { name?: string; since: number; until?: number; limit?: number }
  ): Promise<MetricPoint[]> {
    const wildcard = q.name?.endsWith('*')
    const prefix = wildcard ? q.name!.slice(0, -1) : undefined
    const points = this.bucket(scope)
      .metrics.filter(
        (p) =>
          p.at >= q.since &&
          (q.until === undefined || p.at < q.until) &&
          (q.name === undefined ||
            (wildcard ? p.name.startsWith(prefix!) : p.name === q.name))
      )
      .sort((a, b) => a.at - b.at)
    return structuredClone(
      q.limit === undefined ? points : points.slice(-q.limit)
    )
  }

  async metricsSummary(
    scope: TelemetryScope,
    q: {
      since: number
      until: number
      buckets?: number
      functionId?: string
      tenant?: TenantFilter
    }
  ): Promise<MetricsSummaryRow> {
    const spans = this.bucket(scope).spans.filter(
      (s) =>
        isRoot(s) &&
        s.startAt >= q.since &&
        s.startAt < q.until &&
        matchesTenant(s.attributes, q.tenant) &&
        (q.functionId === undefined ||
          (str(s.attributes['pikku.function.id']) ?? s.name) === q.functionId)
    )
    const traffic = bucketsOf(spans, q.since, q.until, q.buckets ?? 30).map(
      ({ at, group }) => ({
        at,
        requests: group.length,
        errors: group.filter((s) => s.status === 'error').length,
        avgMs: average(group.map((s) => s.durationMs)),
        maxMs: Math.max(...group.map((s) => s.durationMs)),
      })
    )

    const byFunction = new Map<string, SpanRecord[]>()
    for (const span of spans) {
      const key = JSON.stringify([
        str(span.attributes['pikku.function.id']) ?? span.name,
        str(span.attributes['pikku.wire.type']),
      ])
      byFunction.set(key, [...(byFunction.get(key) ?? []), span])
    }
    const functions: MetricsSummaryFunction[] = [...byFunction.entries()]
      .map(([key, group]) => {
        const [name, wire] = JSON.parse(key) as [string, string | null]
        return {
          name,
          wire,
          requests: group.length,
          errors: group.filter((s) => s.status === 'error').length,
          avgMs: average(group.map((s) => s.durationMs)),
          lastRun: Math.max(...group.map((s) => s.startAt)),
        }
      })
      .sort((a, b) => b.requests - a.requests || ordinal(a.name, b.name))

    return {
      totals: {
        requests: spans.length,
        errors: spans.filter((s) => s.status === 'error').length,
        avgMs: spans.length ? average(spans.map((s) => s.durationMs)) : null,
        maxMs: spans.length
          ? Math.max(...spans.map((s) => s.durationMs))
          : null,
      },
      traffic,
      functions,
    }
  }

  async functionMetrics(
    scope: TelemetryScope,
    q: {
      since: number
      until: number
      buckets?: number
      limit?: number
      tenant?: TenantFilter
    }
  ): Promise<FunctionMetricsRow[]> {
    const limit = positive(q.limit, 'limit', 200)
    const buckets = positive(q.buckets, 'buckets', 30)
    const groups = new Map<string, SpanRecord[]>()
    for (const span of this.bucket(scope).spans) {
      if (
        !isRoot(span) ||
        span.startAt < q.since ||
        span.startAt >= q.until ||
        !matchesTenant(span.attributes, q.tenant)
      )
        continue
      const key = JSON.stringify([
        str(span.attributes['pikku.function.id']) ?? span.name,
        str(span.attributes['pikku.wire.type']),
      ])
      groups.set(key, [...(groups.get(key) ?? []), span])
    }
    return [...groups.entries()]
      .map(([key, group]): FunctionMetricsRow => {
        const [functionId, wireType] = JSON.parse(key) as [
          string,
          string | null,
        ]
        return {
          functionId,
          wireType,
          requests: group.length,
          errors: group.filter((s) => s.status === 'error').length,
          avgMs: average(group.map((s) => s.durationMs)),
          lastRun: Math.max(...group.map((s) => s.startAt)),
          buckets: bucketsOf(group, q.since, q.until, buckets).map(
            ({ at, group: inBucket }) => ({
              at,
              requests: inBucket.length,
              errors: inBucket.filter((s) => s.status === 'error').length,
            })
          ),
        }
      })
      .sort(
        (a, b) => b.requests - a.requests || ordinal(a.functionId, b.functionId)
      )
      .slice(0, limit)
  }

  async wireTypes(
    scope: TelemetryScope,
    q: { since: number; until?: number; tenant?: TenantFilter }
  ): Promise<WireTypeRow[]> {
    const counts = new Map<string, number>()
    for (const span of this.bucket(scope).spans) {
      if (
        !isRoot(span) ||
        span.startAt < q.since ||
        (q.until !== undefined && span.startAt >= q.until) ||
        !matchesTenant(span.attributes, q.tenant)
      )
        continue
      const wireType = str(span.attributes['pikku.wire.type']) ?? 'unknown'
      counts.set(wireType, (counts.get(wireType) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([wireType, requests]) => ({ wireType, requests }))
      .sort(
        (a, b) => b.requests - a.requests || ordinal(a.wireType, b.wireType)
      )
  }

  async wireRuns(
    scope: TelemetryScope,
    q: { wireType: string; since: number; limit?: number }
  ): Promise<WireRunRow[]> {
    return this.runs(
      scope,
      q.wireType,
      q.since,
      positive(q.limit, 'limit', 50),
      (span) => str(span.attributes['pikku.function.id']) ?? span.name
    ).map(({ name, ...rest }) => ({ name, wireType: q.wireType, ...rest }))
  }

  async trace(
    scope: TelemetryScope,
    traceId: string,
    q?: { tenant?: TenantFilter }
  ): Promise<SpanRecord[]> {
    const spans = this.bucket(scope).spans.filter((s) => s.traceId === traceId)
    const keys = tenantKeys(q?.tenant)
    const visible = keys.every(
      ([field, key]) =>
        spans.some((s) => s.attributes[key] !== undefined) &&
        spans.every(
          (s) =>
            s.attributes[key] === undefined ||
            s.attributes[key] === q!.tenant![field]
        )
    )
    if (!visible) return []
    return structuredClone(
      spans.sort(
        (a, b) =>
          a.startAt - b.startAt ||
          (a.spanId < b.spanId ? -1 : a.spanId > b.spanId ? 1 : 0)
      )
    )
  }

  private runs(
    scope: TelemetryScope,
    wireType: string,
    since: number,
    limit: number,
    nameOf: (span: SpanRecord) => string
  ): Array<Omit<WireRunRow, 'wireType'>> {
    const byName = new Map<string, SpanRecord[]>()
    for (const span of this.bucket(scope).spans) {
      if (
        !isRoot(span) ||
        span.startAt < since ||
        span.attributes['pikku.wire.type'] !== wireType
      )
        continue
      const name = nameOf(span)
      byName.set(name, [...(byName.get(name) ?? []), span])
    }
    return [...byName.entries()]
      .map(([name, group]) => {
        const newest = [...group].sort(
          (a, b) => b.startAt - a.startAt || ordinal(b.spanId, a.spanId)
        )
        return {
          name,
          completed: group.filter((s) => s.status !== 'error').length,
          failed: group.filter((s) => s.status === 'error').length,
          lastRun: newest[0]!.startAt,
          recent: newest.slice(0, 10).map((s) => ({
            at: s.startAt,
            outcome: s.status === 'error' ? 'failed' : 'completed',
            durationMs: s.durationMs,
            error: s.status === 'error' ? (s.statusMessage ?? null) : null,
          })),
        }
      })
      .sort(
        (a, b) => (b.lastRun ?? 0) - (a.lastRun ?? 0) || ordinal(a.name, b.name)
      )
      .slice(0, limit)
  }

  async queueJobs(
    scope: TelemetryScope,
    q: { since: number; limit?: number }
  ): Promise<QueueJobRow[]> {
    return this.runs(
      scope,
      'queue',
      q.since,
      positive(q.limit, 'limit', 50),
      (span) => str(span.attributes['pikku.queue.name']) ?? span.name
    ).map(({ name, ...rest }) => ({ queue: name, ...rest }))
  }

  async tail(
    scope: TelemetryScope,
    cursor: TailCursor | null,
    q: { limit?: number }
  ): Promise<{ records: LogRecord[]; cursor: TailCursor }> {
    // A cursor is the position of the last record returned: its timestamp and
    // its ingestion number, which breaks ties between equal timestamps.
    let after: [number, number] = [-Infinity, 0]
    if (cursor !== null && cursor !== 'start') {
      const match = /^(-?\d+):(\d+)$/.exec(cursor)
      if (!match) throw new RangeError('not a cursor this store returned')
      after = [Number(match[1]), Number(match[2])]
    }
    const page = this.bucket(scope)
      .logs.filter(
        ({ seq, record }) =>
          record.at > after[0] || (record.at === after[0] && seq > after[1])
      )
      .sort((a, b) => a.record.at - b.record.at || a.seq - b.seq)
      .slice(0, q.limit ?? 100)
    const last = page[page.length - 1]
    return {
      records: structuredClone(page.map(({ record }) => record)),
      cursor: last ? `${last.record.at}:${last.seq}` : (cursor ?? 'start'),
    }
  }

  async close() {
    this.buckets.clear()
  }
}
