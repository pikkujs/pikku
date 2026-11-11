/**
 * `TelemetryStore` over GreptimeDB: writes go in as OTLP/HTTP protobuf, reads
 * come out as SQL over HTTP. All SQL is built in `greptime-sql.ts`; this file
 * owns the network, the schema cache and the mapping between rows and records.
 */
import type {
  FailureRow,
  LogFacets,
  LogRecord,
  LogsQuery,
  MetricPoint,
  MetricsSummaryRow,
  QueueJobRow,
  Severity,
  SpanRecord,
  TailCursor,
  TelemetryAttributes,
  TelemetryScope,
  TelemetryStore,
} from '@pikku/core/telemetry-store'
import {
  encodeGauges,
  encodeLogs,
  encodeTraces,
  type EncodableSpan,
  type OtlpAttributes,
  type OtlpResource,
} from './otlp-encode.js'
import * as sql from './greptime-sql.js'
import type { Schema } from './greptime-sql.js'

export interface GreptimeStoreOptions {
  /** Base URL of the GreptimeDB HTTP port, e.g. `http://127.0.0.1:4000`. */
  url: string
  /** The database every table lives in. Default `pikku`. */
  database?: string
  /** Basic auth, both or neither. */
  username?: string
  password?: string
  /** Per request, in milliseconds. Default 5000. */
  timeoutMs?: number
  /** Default retention a created database applies, e.g. `14d`. */
  ttl?: string
  /** For tests: a fetch to use. Default the global one. */
  fetch?: typeof fetch
  /** How long the table/column listing is trusted, in ms. Default 2000. */
  schemaTtlMs?: number
  /** The largest response body read, in bytes. Default 16 MiB. */
  maxResponseBytes?: number
  /** The most metric tables one `metrics()` call will read. Default 100. */
  maxMetricTables?: number
}

export const DEFAULT_TIMEOUT_MS = 5000
export const MAX_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024
export const DEFAULT_MAX_METRIC_TABLES = 100
/** Metric tables read at once, so a wide `metrics()` cannot flood the server. */
const METRIC_CONCURRENCY = 4

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** Whether a URL's host is this machine. */
export const isLoopbackHost = (hostname: string): boolean =>
  LOOPBACK.has(hostname)

/** A timeout in whole milliseconds, 1 to 120000. */
export const checkTimeoutMs = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(
      `the timeout must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}`
    )
  }
  return value
}

/**
 * Parses the GreptimeDB address. Nothing it throws contains the value: the
 * address may carry a password a log line must never show. A host that is not
 * this machine must be https, whatever credentials are set, because Basic auth
 * and the telemetry itself would cross the network in clear text.
 */
export const parseGreptimeUrl = (raw: string): URL => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new TypeError('the GreptimeDB url is not a URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('the GreptimeDB url must be http or https')
  }
  if (url.username || url.password) {
    throw new TypeError(
      'the GreptimeDB url must not contain credentials: pass them as a username and a password'
    )
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new TypeError(
      `the GreptimeDB url points at ${url.hostname}, which is not this machine, so it must be https`
    )
  }
  return url
}

/** The store could not reach GreptimeDB, or it refused our credentials. */
export class TelemetryUnavailableError extends Error {
  override readonly name = 'TelemetryUnavailableError'
  constructor(
    message: string,
    readonly reason: 'unreachable' | 'timeout' | 'auth' | 'server',
    options?: { cause?: unknown }
  ) {
    super(message, options)
  }
}

/** GreptimeDB rejected a statement or a write: a bug here or bad input. */
export class TelemetryQueryError extends Error {
  override readonly name = 'TelemetryQueryError'
  constructor(
    message: string,
    readonly code: number | undefined
  ) {
    super(message)
  }
}

const TABLE_OR_COLUMN_MISSING = new Set([3000, 4001])
const RESERVED_LOG_KEYS = new Set([
  'pikku.function.id',
  'pikku.wire.type',
  'pikku.wire.id',
  'pikku.log.source',
])
/** Span attributes with a fixed type, whatever was seen first. */
const STRING_SPAN_KEYS = new Set([
  'pikku.function.id',
  'pikku.wire.type',
  'pikku.wire.id',
  'pikku.queue.name',
])
const SERVICE_NAME = 'pikku-studio-telemetry'

type Row = Record<string, unknown>
type SpanKind = 'string' | 'int' | 'double' | 'boolean'

const num = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

const nsOf = (ms: number): bigint => {
  if (!Number.isFinite(ms)) throw new TypeError('a timestamp must be a number')
  return BigInt(Math.trunc(ms)) * 1_000_000n
}

const scalarAttributes = (
  value: unknown,
  skip?: Set<string>
): TelemetryAttributes | undefined => {
  let source = value
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      return undefined
    }
  }
  if (!source || typeof source !== 'object') return undefined
  const out: TelemetryAttributes = {}
  for (const [key, v] of Object.entries(source as Row)) {
    if (skip?.has(key)) continue
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    )
      out[key] = v
  }
  return Object.keys(out).length ? out : undefined
}

export class GreptimeTelemetryStore implements TelemetryStore {
  readonly database: string
  private readonly base: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number
  private readonly fetcher: typeof fetch
  private readonly ttl?: string
  private readonly schemaTtlMs: number
  private readonly maxResponseBytes: number
  private readonly maxMetricTables: number
  private schema?: { at: number; value: Schema }
  private databaseReady?: Promise<void>
  private readonly spanKinds = new Map<string, SpanKind>()
  private spanKindsSeeded = false

  constructor(options: GreptimeStoreOptions) {
    const url = parseGreptimeUrl(options.url)
    if (Boolean(options.username) !== Boolean(options.password)) {
      throw new TypeError('set both a username and a password, or neither')
    }
    this.base = url.origin
    this.database = sql.databaseName(options.database ?? 'pikku')
    sql.createDatabaseSql(this.database, options.ttl)
    this.ttl = options.ttl
    this.timeoutMs = checkTimeoutMs(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    this.maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    this.maxMetricTables = options.maxMetricTables ?? DEFAULT_MAX_METRIC_TABLES
    this.schemaTtlMs = options.schemaTtlMs ?? 2000
    this.fetcher = options.fetch ?? fetch
    this.headers = {}
    if (options.username) {
      this.headers.authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`
    }
  }

  // ------------------------------------------------------------ transport

  private async send(
    path: string,
    init: {
      method: string
      headers?: Record<string, string>
      body?: URLSearchParams | Uint8Array
    }
  ): Promise<{ status: number; text: string }> {
    let response: Response
    try {
      response = await this.fetcher(`${this.base}${path}`, {
        ...init,
        headers: { ...this.headers, ...init.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (cause) {
      const timedOut =
        cause instanceof Error &&
        (cause.name === 'TimeoutError' || cause.name === 'AbortError')
      throw new TelemetryUnavailableError(
        timedOut
          ? `GreptimeDB did not answer within ${this.timeoutMs}ms`
          : `GreptimeDB is not reachable at ${this.base}`,
        timedOut ? 'timeout' : 'unreachable',
        { cause }
      )
    }
    const text = await this.readBody(response)
    if (response.status === 401 || response.status === 403) {
      throw new TelemetryUnavailableError(
        'GreptimeDB refused the credentials',
        'auth'
      )
    }
    if (response.status >= 500) {
      throw new TelemetryUnavailableError(
        `GreptimeDB failed (${response.status}): ${text.slice(0, 200)}`,
        'server'
      )
    }
    return { status: response.status, text }
  }

  /** The body as text, refusing more than `maxResponseBytes`. */
  private async readBody(response: Response): Promise<string> {
    const tooLarge = () =>
      new TelemetryQueryError(
        `GreptimeDB answered with more than ${this.maxResponseBytes} bytes`,
        undefined
      )
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > this.maxResponseBytes) {
      void response.body?.cancel().catch(() => undefined)
      throw tooLarge()
    }
    try {
      if (!response.body) return await response.text()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let size = 0
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > this.maxResponseBytes) {
          void reader.cancel().catch(() => undefined)
          throw tooLarge()
        }
        text += decoder.decode(value, { stream: true })
      }
      return text + decoder.decode()
    } catch (cause) {
      if (cause instanceof TelemetryQueryError) throw cause
      const timedOut =
        cause instanceof Error &&
        (cause.name === 'TimeoutError' || cause.name === 'AbortError')
      throw new TelemetryUnavailableError(
        timedOut
          ? `GreptimeDB did not finish answering within ${this.timeoutMs}ms`
          : 'the connection to GreptimeDB broke while reading the answer',
        timedOut ? 'timeout' : 'unreachable',
        { cause }
      )
    }
  }

  /** Runs a statement. Returns rows as objects; a statement with none returns []. */
  private async exec(statement: string, database = this.database) {
    const { status, text } = await this.send(
      `/v1/sql?db=${encodeURIComponent(database)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ sql: statement }),
      }
    )
    let body: any
    try {
      body = JSON.parse(text)
    } catch {
      throw new TelemetryQueryError(
        `GreptimeDB answered ${status} with something that is not JSON`,
        undefined
      )
    }
    if (status !== 200) {
      throw new TelemetryQueryError(
        String(body?.error ?? text).slice(0, 300),
        typeof body?.code === 'number' ? body.code : undefined
      )
    }
    const records = body?.output?.[0]?.records
    if (!records) return []
    const names: string[] = records.schema.column_schemas.map(
      (column: { name: string }) => column.name
    )
    return (records.rows as unknown[][]).map((cells) => {
      const row: Row = {}
      names.forEach((name, index) => (row[name] = cells[index]))
      return row
    })
  }

  /** Whether the server answers (`/health` needs no database). */
  async ping(): Promise<void> {
    const { status } = await this.send('/health', { method: 'GET' })
    if (status !== 200) {
      throw new TelemetryUnavailableError(
        `GreptimeDB health check answered ${status}`,
        'server'
      )
    }
  }

  /** Creates the database if it is not there. Safe to call every start. */
  ensureDatabase(): Promise<void> {
    this.databaseReady ??= this.exec(
      sql.createDatabaseSql(this.database, this.ttl),
      'public'
    )
      // Made here, before any telemetry table can claim the name, and so that
      // every read finds it.
      .then(() => this.exec(sql.createTombstonesSql()))
      .then(() => undefined)
      .catch((error) => {
        this.databaseReady = undefined
        throw error
      })
    return this.databaseReady
  }

  async close(): Promise<void> {
    this.schema = undefined
  }

  // ------------------------------------------------------------ schema

  private async loadSchema(force = false): Promise<Schema> {
    const now = Date.now()
    if (!force && this.schema && now - this.schema.at < this.schemaTtlMs) {
      return this.schema.value
    }
    let rows: Row[]
    try {
      rows = await this.exec(sql.schemaQuery(this.database))
    } catch (error) {
      // A database nobody has written to yet has no tables.
      if (error instanceof TelemetryQueryError) rows = []
      else throw error
    }
    const tables = new Map<string, Set<string>>()
    const traceTypes = new Map<string, string>()
    for (const row of rows) {
      const table = String(row.table_name)
      const column = String(row.column_name)
      let columns = tables.get(table)
      if (!columns) tables.set(table, (columns = new Set()))
      columns.add(column)
      if (table === sql.TRACES_TABLE) {
        traceTypes.set(column, String(row.data_type))
      }
    }
    let tombstones: Map<string, number> | undefined
    let tombstoneError: string | undefined
    if (tables.has(sql.TOMBSTONES_TABLE)) {
      try {
        tombstones = new Map(
          (await this.exec(sql.tombstonesQuery())).map((row) => [
            String(row.project),
            num(row.deleted_ms),
          ])
        )
      } catch (error) {
        // Not unreadable-means-nobody-deleted: that would show deleted data.
        // Writes, retention and deleteProject (which makes the table again)
        // carry on; reads say why they cannot answer.
        if (!(error instanceof TelemetryQueryError)) throw error
        tombstoneError = error.message
      }
    }
    const value: Schema = {
      tombstones,
      tombstoneError,
      logs: tables.get(sql.LOGS_TABLE),
      traces: tables.get(sql.TRACES_TABLE),
      traceTypes,
      metrics: new Map(
        [...tables].filter(
          ([table, columns]) =>
            columns.has('greptime_value') && table !== sql.METRIC_PHYSICAL_TABLE
        )
      ),
    }
    this.schema = { at: now, value }
    return value
  }

  private requireTombstones(schema: Schema) {
    if (schema.tombstoneError !== undefined) {
      throw new TelemetryQueryError(
        `${sql.TOMBSTONES_TABLE} cannot be read, so reads are refused rather than risk showing a deleted project: ${schema.tombstoneError}`,
        undefined
      )
    }
  }

  private forgetSchema() {
    this.schema = undefined
  }

  /**
   * Builds a statement from the current schema and runs it. If the engine
   * says a table or column is missing (the cache went stale, or another
   * writer changed the tables), it reads the schema afresh and tries once more.
   */
  private async read<T>(
    build: (schema: Schema) => string | null,
    empty: T,
    map: (rows: Row[]) => T
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const schema = await this.loadSchema(attempt > 0)
      this.requireTombstones(schema)
      const statement = build(schema)
      if (statement === null) return empty
      try {
        return map(await this.exec(statement))
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof TelemetryQueryError &&
          error.code !== undefined &&
          TABLE_OR_COLUMN_MISSING.has(error.code)
        ) {
          continue
        }
        if (
          error instanceof TelemetryQueryError &&
          error.code !== undefined &&
          TABLE_OR_COLUMN_MISSING.has(error.code)
        ) {
          return empty
        }
        throw error
      }
    }
  }

  // ------------------------------------------------------------ writes

  private resource(scope: TelemetryScope): OtlpResource {
    sql.requireScope(scope)
    return {
      serviceName: SERVICE_NAME,
      environment: scope.stage,
      project: scope.project,
      stage: scope.stage,
    }
  }

  private async otlp(
    signal: 'logs' | 'traces' | 'metrics',
    body: Uint8Array
  ): Promise<void> {
    await this.ensureDatabase()
    const headers: Record<string, string> = {
      'content-type': 'application/x-protobuf',
      'x-greptime-db-name': this.database,
    }
    if (signal === 'traces') {
      headers['x-greptime-pipeline-name'] = 'greptime_trace_v1'
    }
    const { status, text } = await this.send(`/v1/otlp/v1/${signal}`, {
      method: 'POST',
      headers,
      body,
    })
    this.forgetSchema()
    if (status < 200 || status >= 300) {
      throw new TelemetryQueryError(
        `GreptimeDB rejected the ${signal}: ${text.slice(0, 300)}`,
        status
      )
    }
  }

  async appendLogs(scope: TelemetryScope, records: LogRecord[]) {
    const resource = this.resource(scope)
    if (records.length === 0) return
    await this.otlp(
      'logs',
      encodeLogs(
        resource,
        records.map((record) => {
          const attributes: OtlpAttributes = {}
          for (const [key, value] of Object.entries(record.attributes ?? {})) {
            if (!RESERVED_LOG_KEYS.has(key)) attributes[key] = value
          }
          if (record.functionId)
            attributes['pikku.function.id'] = record.functionId
          if (record.wireType) attributes['pikku.wire.type'] = record.wireType
          if (record.wireId) attributes['pikku.wire.id'] = record.wireId
          attributes['pikku.log.source'] = record.source
          return {
            timeUnixNano: nsOf(record.at),
            severity: record.severity,
            body: record.body,
            attributes,
            traceId: record.traceId,
            spanId: record.spanId,
          }
        })
      )
    )
  }

  /** The type each span attribute key already has, from the table, once. */
  private async seedSpanKinds() {
    if (this.spanKindsSeeded) return
    const schema = await this.loadSchema(true)
    for (const [column, type] of schema.traceTypes ?? []) {
      if (!column.startsWith('span_attributes.')) continue
      const key = column.slice('span_attributes.'.length)
      const kind: SpanKind | undefined = type.startsWith('string')
        ? 'string'
        : type === 'bigint'
          ? 'int'
          : type === 'double'
            ? 'double'
            : type === 'boolean'
              ? 'boolean'
              : undefined
      if (kind) this.spanKinds.set(key, kind)
    }
    this.spanKindsSeeded = true
  }

  /**
   * A column's type is fixed by the first value it sees, and a value of
   * another type is a 400 that would lose the whole batch. So the type of each
   * key is remembered (and read from the table on first use) and later values
   * are coerced to it; a value that cannot be is dropped.
   */
  private spanAttributes(attributes: TelemetryAttributes): OtlpAttributes {
    const out: OtlpAttributes = {}
    for (const [key, value] of Object.entries(attributes)) {
      let kind = this.spanKinds.get(key)
      if (!kind) {
        kind = STRING_SPAN_KEYS.has(key)
          ? 'string'
          : typeof value === 'string'
            ? 'string'
            : typeof value === 'boolean'
              ? 'boolean'
              : Number.isInteger(value)
                ? 'int'
                : 'double'
        this.spanKinds.set(key, kind)
      }
      if (kind === 'string') out[key] = String(value)
      else if (kind === 'boolean') {
        if (typeof value === 'boolean') out[key] = value
        else if (value === 'true' || value === 'false')
          out[key] = value === 'true'
      } else {
        const n = typeof value === 'number' ? value : Number(value)
        if (typeof value !== 'boolean' && Number.isFinite(n)) {
          out[key] = kind === 'int' ? Math.round(n) : { double: n }
        }
      }
    }
    return out
  }

  async appendSpans(scope: TelemetryScope, spans: SpanRecord[]) {
    const resource = this.resource(scope)
    if (spans.length === 0) return
    await this.seedSpanKinds()
    const encodable: EncodableSpan[] = spans.map((span) => ({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: (
        ['internal', 'server', 'client', 'producer', 'consumer'] as const
      ).includes(span.kind as 'server')
        ? (span.kind as EncodableSpan['kind'])
        : 'internal',
      startTimeUnixNano: nsOf(span.startAt),
      endTimeUnixNano:
        nsOf(span.startAt) + BigInt(Math.round(span.durationMs * 1e6)),
      status: span.status,
      statusMessage: span.statusMessage,
      attributes: this.spanAttributes(span.attributes),
    }))
    await this.otlp('traces', encodeTraces(resource, encodable))
  }

  async appendMetrics(scope: TelemetryScope, points: MetricPoint[]) {
    const resource = this.resource(scope)
    if (points.length === 0) return
    // Checked for the whole batch before anything is sent: a point that would
    // write under another scope, or into a table this store owns, is a caller
    // bug and is refused, never quietly dropped or rewritten.
    for (const point of points) {
      if (typeof point.name !== 'string' || !point.name) {
        throw new TypeError('a metric point needs a name')
      }
      if (!sql.SAFE_METRIC_TEXT.test(point.name)) {
        throw new TypeError(
          `the metric name '${JSON.stringify(point.name.slice(0, 80))}' must start with a letter and use only letters, digits, '_', '.' and '-'`
        )
      }
      if (sql.reservedMetricName(point.name)) {
        throw new TypeError(
          `the metric name '${point.name.slice(0, 80)}' is reserved: it would be stored in a table the store uses itself`
        )
      }
      for (const key of Object.keys(point.attributes ?? {})) {
        if (!sql.SAFE_METRIC_TEXT.test(key)) {
          throw new TypeError(
            `the metric attribute ${JSON.stringify(key.slice(0, 80))} must start with a letter and use only letters, digits, '_', '.' and '-'`
          )
        }
        if (sql.reservedMetricAttribute(key)) {
          throw new TypeError(
            `the metric attribute '${key.slice(0, 80)}' is reserved (pikku.*, greptime_*, otel_*, deployment.environment*, service.*, job)`
          )
        }
      }
    }
    await this.otlp(
      'metrics',
      encodeGauges(
        resource,
        points.map((point) => {
          const attributes: OtlpAttributes = {}
          for (const [key, value] of Object.entries(point.attributes ?? {})) {
            attributes[key] = String(value)
          }
          // Last, so nothing above can change which scope the point is in.
          attributes['pikku.project'] = scope.project
          attributes['pikku.stage'] = scope.stage
          attributes['pikku.metric.name'] = point.name
          return {
            name: point.name,
            timeUnixNano: nsOf(point.at),
            value: point.value,
            attributes,
          }
        })
      )
    )
  }

  // ------------------------------------------------------------ reads

  private logRecord(row: Row): LogRecord {
    const attributes = row.log_attributes
    const all =
      typeof attributes === 'string'
        ? (() => {
            try {
              return JSON.parse(attributes)
            } catch {
              return undefined
            }
          })()
        : attributes
    const get = (key: string) => str((all as Row | undefined)?.[key])
    const record: LogRecord = {
      at: num(row.at_ms),
      severity: sql.severityOf(row.severity_text),
      body: typeof row.body === 'string' ? row.body : '',
      source: get('pikku.log.source') ?? 'app',
    }
    const traceId = str(row.trace_id)
    const spanId = str(row.span_id)
    if (traceId) record.traceId = traceId
    if (spanId) record.spanId = spanId
    const functionId = get('pikku.function.id')
    const wireType = get('pikku.wire.type')
    const wireId = get('pikku.wire.id')
    if (functionId) record.functionId = functionId
    if (wireType) record.wireType = wireType
    if (wireId) record.wireId = wireId
    const rest = scalarAttributes(all, RESERVED_LOG_KEYS)
    if (rest) record.attributes = rest
    return record
  }

  async logs(scope: TelemetryScope, q: LogsQuery): Promise<LogRecord[]> {
    sql.requireScope(scope)
    return this.read(
      (schema) => sql.logsQuery(scope, q, schema),
      [],
      (rows) => rows.map((row) => this.logRecord(row))
    )
  }

  async logFacets(
    scope: TelemetryScope,
    q: { since?: number }
  ): Promise<LogFacets> {
    sql.requireScope(scope)
    const severities: Record<Severity, number> = {
      trace: 0,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    }
    const [counts, functions, wires] = await Promise.all([
      this.read(
        (schema) => sql.logSeverityFacetQuery(scope, q, schema),
        [] as Row[],
        (rows) => rows
      ),
      this.read(
        (schema) => sql.logFunctionFacetQuery(scope, q, schema),
        [] as Row[],
        (rows) => rows
      ),
      this.read(
        (schema) => sql.logWireFacetQuery(scope, q, schema),
        [] as Row[],
        (rows) => rows
      ),
    ])
    for (const row of counts)
      severities[sql.severityOf(row.severity)] += num(row.n)
    const values = (rows: Row[]) =>
      [...new Set(rows.map((row) => String(row.value)))].sort()
    return { severities, functions: values(functions), wires: values(wires) }
  }

  async failures(
    scope: TelemetryScope,
    q: { since: number; limit?: number }
  ): Promise<FailureRow[]> {
    sql.requireScope(scope)
    return this.read(
      (schema) => sql.failuresQuery(scope, q, schema),
      [],
      (rows) =>
        rows.map((row) => ({
          functionId: String(row.fn),
          wireType: str(row.wire) ?? null,
          message: typeof row.message === 'string' ? row.message : '',
          count: num(row.n),
          last: numOrNull(row.last_ms),
          sampleTraceId: str(row.sample_trace) ?? null,
        }))
    )
  }

  async metrics(
    scope: TelemetryScope,
    q: { name?: string; since: number; until?: number; limit?: number }
  ): Promise<MetricPoint[]> {
    sql.requireScope(scope)
    const schema = await this.loadSchema()
    this.requireTombstones(schema)
    const tables = sql.metricTables(q.name, schema)
    if (tables.length > this.maxMetricTables) {
      throw new TelemetryQueryError(
        `the metric name matches ${tables.length} tables, more than the ${this.maxMetricTables} one call reads: name a narrower metric`,
        undefined
      )
    }
    const limit = Math.min(q.limit ?? sql.DEFAULT_METRIC_LIMIT, sql.MAX_LIMIT)
    const newest = (points: MetricPoint[]) =>
      points
        .sort((a, b) => b.at - a.at || a.name.localeCompare(b.name))
        .slice(0, limit)
    // A few tables at a time, keeping only the newest `limit` points so far:
    // rows held never exceed (concurrency + 1) x limit, however many tables.
    let kept: MetricPoint[] = []
    for (let from = 0; from < tables.length; from += METRIC_CONCURRENCY) {
      const batch = await Promise.all(
        tables
          .slice(from, from + METRIC_CONCURRENCY)
          .map((table) => this.metricTable(table, scope, q))
      )
      kept = newest([...kept, ...batch.flat()])
    }
    return kept.reverse()
  }

  private metricTable(
    table: string,
    scope: TelemetryScope,
    q: { name?: string; since: number; until?: number; limit?: number }
  ): Promise<MetricPoint[]> {
    return this.read(
      (current) => sql.metricsQuery(table, scope, q, current),
      [] as MetricPoint[],
      (rows) =>
        rows.map((row) => {
          const attributes: TelemetryAttributes = {}
          for (const [key, value] of Object.entries(row)) {
            if (
              ['at_ms', 'value', 'metric_name'].includes(key) ||
              value === null ||
              value === undefined
            )
              continue
            attributes[key] = value as string
          }
          const point: MetricPoint = {
            at: num(row.at_ms),
            name: str(row.metric_name) ?? table,
            value: num(row.value),
          }
          if (Object.keys(attributes).length) point.attributes = attributes
          return point
        })
    )
  }

  async metricsSummary(
    scope: TelemetryScope,
    q: { since: number; until: number; buckets?: number }
  ): Promise<MetricsSummaryRow> {
    sql.requireScope(scope)
    const width = sql.bucketWidth(q.since, q.until, q.buckets ?? 30)
    const [totals, traffic, functions] = await Promise.all([
      this.read(
        (schema) => sql.summaryTotalsQuery(scope, q, schema),
        [] as Row[],
        (rows) => rows
      ),
      this.read(
        (schema) => sql.summaryTrafficQuery(scope, q, schema),
        [] as Row[],
        (rows) => rows
      ),
      this.read(
        (schema) => sql.summaryFunctionsQuery(scope, q, schema),
        [] as Row[],
        (rows) => rows
      ),
    ])
    const t = totals[0]
    const requests = t ? num(t.requests) : 0
    return {
      totals: {
        requests,
        errors: requests ? num(t!.errors) : 0,
        avgMs: requests ? numOrNull(t!.avg_ms) : null,
        maxMs: requests ? numOrNull(t!.max_ms) : null,
      },
      traffic: traffic.map((row) => ({
        at: q.since + num(row.bucket) * width,
        requests: num(row.requests),
        errors: num(row.errors),
        avgMs: num(row.avg_ms),
        maxMs: num(row.max_ms),
      })),
      functions: functions.map((row) => ({
        name: String(row.fn),
        wire: str(row.wire) ?? null,
        requests: num(row.requests),
        errors: num(row.errors),
        avgMs: numOrNull(row.avg_ms),
        lastRun: numOrNull(row.last_ms),
      })),
    }
  }

  async trace(scope: TelemetryScope, traceId: string): Promise<SpanRecord[]> {
    sql.requireScope(scope)
    return this.read(
      (schema) => sql.traceQuery(scope, traceId, schema),
      [],
      (rows) =>
        rows.map((row) => {
          const attributes: TelemetryAttributes = {}
          for (const [column, value] of Object.entries(row)) {
            if (!column.startsWith('span_attributes.') || value == null)
              continue
            attributes[column.slice('span_attributes.'.length)] =
              value as string
          }
          const status = String(row.span_status_code)
          const kind = String(row.span_kind)
            .replace(/^SPAN_KIND_/, '')
            .toLowerCase()
          const start = num(row.start_ms)
          const duration = num(row.duration_nano) / 1e6
          const span: SpanRecord = {
            traceId: String(row.trace_id),
            spanId: String(row.span_id),
            name: String(row.span_name),
            kind,
            startAt: start,
            endAt: start + Math.round(duration),
            durationMs: duration,
            status: status.endsWith('ERROR')
              ? 'error'
              : status.endsWith('OK')
                ? 'ok'
                : 'unset',
            attributes,
          }
          const parent = str(row.parent_span_id)
          if (parent) span.parentSpanId = parent
          const message = str(row.span_status_message)
          if (message) span.statusMessage = message
          return span
        })
    )
  }

  async queueJobs(
    scope: TelemetryScope,
    q: { since: number; limit?: number }
  ): Promise<QueueJobRow[]> {
    sql.requireScope(scope)
    const summary = await this.read(
      (schema) => sql.queueSummaryQuery(scope, q, schema),
      [] as Row[],
      (rows) => rows
    )
    if (summary.length === 0) return []
    const queues = summary.map((row) => String(row.queue))
    const recent = await this.read(
      (schema) =>
        sql.queueRecentQuery(
          scope,
          { since: q.since, queues, perQueue: 10 },
          schema
        ),
      [] as Row[],
      (rows) => rows
    )
    return summary.map((row) => ({
      queue: String(row.queue),
      completed: num(row.completed),
      failed: num(row.failed),
      lastRun: numOrNull(row.last_ms),
      recent: recent
        .filter((r) => String(r.queue) === String(row.queue))
        .map((r) => ({
          at: num(r.at_ms),
          outcome: String(r.status).endsWith('ERROR') ? 'failed' : 'completed',
          durationMs: numOrNull(r.duration_ms),
          error: str(r.message) ?? null,
        })),
    }))
  }

  async tail(
    scope: TelemetryScope,
    cursor: TailCursor | null,
    q: { limit?: number }
  ): Promise<{ records: LogRecord[]; cursor: TailCursor }> {
    sql.requireScope(scope)
    const start = sql.parseCursor(cursor)
    const limit = q.limit ?? sql.DEFAULT_LIMIT
    const same = await this.read(
      (schema) => sql.tailSameTimestampQuery(scope, start, limit, schema),
      [] as Row[],
      (rows) => rows
    )
    let rows = same
    if (rows.length < limit) {
      const after = await this.read(
        (schema) =>
          sql.tailAfterQuery(scope, start, limit - rows.length, schema),
        [] as Row[],
        (more) => more
      )
      rows = [...same, ...after]
    }
    let ns = start.ns
    let seen = start.seen
    for (const row of rows) {
      const at = String(row.at_ns)
      if (at === ns) seen++
      else {
        ns = at
        seen = 1
      }
    }
    return {
      records: rows.map((row) => this.logRecord(row)),
      cursor: sql.formatCursor(ns, seen),
    }
  }

  // ------------------------------------------------------------ admin

  /**
   * GreptimeDB refuses DELETE on the append-only tables OTLP creates, so a
   * deleted project is hidden from every read from now on (a tombstone) and its
   * rows leave the disk when retention drops them.
   */
  async deleteProject(project: string): Promise<void> {
    if (!project) throw new TypeError('a project is required')
    await this.ensureDatabase()
    await this.exec(sql.createTombstonesSql())
    await this.exec(sql.insertTombstoneSql(project, Date.now()))
    this.forgetSchema()
  }

  /** The tables retention applies to: logs, traces and the metrics' physical table. */
  private async retentionTables(): Promise<string[]> {
    const schema = await this.loadSchema(true)
    const tables: string[] = []
    if (schema.logs) tables.push(sql.LOGS_TABLE)
    if (schema.traces) tables.push(sql.TRACES_TABLE)
    if (schema.metrics.size) tables.push(sql.METRIC_PHYSICAL_TABLE)
    return tables
  }

  /** Sets the retention of every telemetry table to `days`, then compacts. */
  async retain(policy: { days: number }): Promise<void> {
    for (const table of await this.retentionTables()) {
      await this.exec(sql.setTtlSql(table, policy.days))
    }
    await this.compact()
  }

  /**
   * Flushes and compacts every telemetry table. Expired rows leave the files
   * when this runs (a TTL alone only hides nothing: GreptimeDB drops expired
   * rows at flush and compaction), so retention is a TTL plus this.
   */
  async compact(): Promise<void> {
    const schema = await this.loadSchema(true)
    const tables = [
      ...(schema.logs ? [sql.LOGS_TABLE] : []),
      ...(schema.traces ? [sql.TRACES_TABLE] : []),
      ...(schema.metrics.size ? [sql.METRIC_PHYSICAL_TABLE] : []),
    ]
    for (const table of tables) {
      await this.exec(sql.flushSql(table))
      await this.exec(sql.compactSql(table))
    }
  }

  /** On-disk size of the telemetry tables in bytes (0 when none exist). */
  async diskBytes(): Promise<number> {
    const rows = await this.exec(sql.diskUsageQuery(this.database))
    return rows.reduce((sum, row) => sum + num(row.bytes), 0)
  }
}
