/**
 * Pure SQL builders for the GreptimeDB telemetry store.
 *
 * Every function takes plain values and returns a SQL string (or `null` when
 * the schema proves nothing could match, so the caller answers empty without a
 * round trip). Nothing here touches the network, and the only way a value
 * reaches a statement is `lit()` (strings) or `int()` (numbers); identifiers are
 * constants or names read back from the database and quoted by `ident()`.
 *
 * The tables are the ones GreptimeDB v1.3.0 creates from OTLP: logs keep their
 * attributes in JSON columns, traces flatten them into `"span_attributes.<key>"`
 * and `"resource_attributes.<key>"` columns that appear when first seen, and
 * every metric is its own table. See the knowledge note for the findings.
 */
import type {
  LogsQuery,
  Severity,
  TelemetryScope,
} from '@pikku/core/telemetry-store'

export const LOGS_TABLE = 'opentelemetry_logs'
export const TRACES_TABLE = 'opentelemetry_traces'

/** Tag columns of a metric table that are not data point attributes. */
export const METRIC_FIXED_COLUMNS = new Set([
  'greptime_timestamp',
  'greptime_value',
  'job',
  'service_name',
  'service_version',
  'deployment_environment_name',
  'pikku_project',
  'pikku_stage',
  'pikku_metric_name',
])

export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 10_000
export const DEFAULT_METRIC_LIMIT = 10_000
export const FACET_LIMIT = 200
const STRING_NULL = 'CAST(NULL AS VARCHAR)'
const NS_PER_MS = 1_000_000

/** What the database has, from `information_schema.columns`. */
export interface Schema {
  /** Columns of `opentelemetry_logs`; undefined when the table does not exist. */
  logs?: Set<string>
  /** Columns of `opentelemetry_traces`; undefined when the table does not exist. */
  traces?: Set<string>
  /** Columns of every metric table (one with `greptime_value`), by table name. */
  metrics: Map<string, Set<string>>
  /** The `data_type` of each `opentelemetry_traces` column, as the engine reports it. */
  traceTypes?: Map<string, string>
  /**
   * `project` to the epoch ms it was deleted at. Append-only tables refuse
   * DELETE, so a deleted project is hidden: nothing at or before this instant
   * is read for it. Retention removes the rows for good.
   */
  tombstones?: Map<string, number>
  /** The tombstone table exists but could not be read; scoped reads must not run without it. */
  tombstoneError?: string
}

export const TOMBSTONES_TABLE = 'pikku_project_tombstones'

export const METRIC_PHYSICAL_TABLE = 'greptime_physical_table'

/** A string literal. A quote is doubled; backslash is literal in GreptimeDB. */
export const lit = (value: string): string => {
  if (typeof value !== 'string') throw new TypeError('lit() takes a string')
  if (value.includes('\0')) throw new TypeError('a NUL byte cannot be queried')
  return `'${value.replace(/'/g, "''")}'`
}

/** An integer literal. Anything that is not a safe integer is refused. */
export const int = (value: number): string => {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`expected a safe integer, got ${String(value)}`)
  }
  return String(value)
}

/** A double-quoted identifier. */
export const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`

const limitOf = (limit: number | undefined, fallback: number): string => {
  if (limit === undefined) return int(fallback)
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`)
  }
  return int(Math.min(limit, MAX_LIMIT))
}

/** A millisecond instant as a timestamp the engine compares with a ns column. */
const tsMs = (ms: number): string => `to_timestamp_millis(${int(ms)})`
const tsNs = (ns: string): string => {
  if (!/^\d{1,19}$/.test(ns)) throw new TypeError('not a nanosecond count')
  return `arrow_cast(${ns}, 'Timestamp(Nanosecond, None)')`
}
const msOf = (column: string) => `(CAST(${column} AS BIGINT) / ${NS_PER_MS})`
const nsText = (column: string) => `CAST(CAST(${column} AS BIGINT) AS VARCHAR)`

export const requireScope = (scope: TelemetryScope): TelemetryScope => {
  if (
    !scope ||
    typeof scope.project !== 'string' ||
    typeof scope.stage !== 'string' ||
    !scope.project ||
    !scope.stage
  ) {
    throw new TypeError('a telemetry scope needs a project and a stage')
  }
  return scope
}

// ---------------------------------------------------------------- logs

const logJson = (column: string, key: string) =>
  `json_get_string(${column}, ${lit(`$[${JSON.stringify(key)}]`)})`

const LOG_FUNCTION = logJson('log_attributes', 'pikku.function.id')
const LOG_WIRE_TYPE = logJson('log_attributes', 'pikku.wire.type')
const LOG_WIRE_ID = logJson('log_attributes', 'pikku.wire.id')
/** A line with no source attribute came from the app's own exporter. */
const LOG_SOURCE = `coalesce(${logJson('log_attributes', 'pikku.log.source')}, 'app')`

/** The rows nobody deleted: later than the project's tombstone, if it has one. */
const alive = (column: string, scope: TelemetryScope, schema: Schema) => {
  const deletedAt = schema.tombstones?.get(scope.project)
  return deletedAt === undefined ? '' : ` AND ${column} > ${tsMs(deletedAt)}`
}

const logScope = (scope: TelemetryScope, schema: Schema) =>
  `${logJson('resource_attributes', 'pikku.project')} = ${lit(scope.project)} AND ${logJson('resource_attributes', 'pikku.stage')} = ${lit(scope.stage)}${alive('timestamp', scope, schema)}`

/** `severity_text` values that mean each severity (the exporter says `critical`). */
const SEVERITY_TEXTS: Record<Severity, string[]> = {
  trace: ['trace'],
  debug: ['debug'],
  info: ['info'],
  warn: ['warn', 'warning'],
  error: ['error'],
  fatal: ['fatal', 'critical'],
}

export const severityOf = (text: unknown): Severity => {
  const lower = typeof text === 'string' ? text.toLowerCase() : ''
  for (const [severity, texts] of Object.entries(SEVERITY_TEXTS)) {
    if (texts.includes(lower)) return severity as Severity
  }
  return 'info'
}

const severityIn = (severity: Severity) => {
  const texts = SEVERITY_TEXTS[severity]
  if (!texts) throw new RangeError(`unknown severity '${severity}'`)
  return `lower(severity_text) IN (${texts.map(lit).join(', ')})`
}

export const LOG_COLUMNS = `${msOf('timestamp')} AS at_ms, ${nsText('timestamp')} AS at_ns, severity_text, body, trace_id, span_id, log_attributes`

const logFilters = (q: LogsQuery): string[] => {
  const where: string[] = []
  if (q.since !== undefined) where.push(`timestamp >= ${tsMs(q.since)}`)
  if (q.until !== undefined) where.push(`timestamp < ${tsMs(q.until)}`)
  if (q.severity !== undefined) where.push(severityIn(q.severity))
  if (q.search !== undefined && q.search !== '') {
    // Case-insensitive substring. strpos has no wildcards, so a term with
    // `%` or `_` is searched for as text; matches_term is case-sensitive.
    where.push(`strpos(lower(body), lower(${lit(q.search)})) > 0`)
  }
  if (q.traceId !== undefined) where.push(`trace_id = ${lit(q.traceId)}`)
  if (q.functionId !== undefined) {
    where.push(`${LOG_FUNCTION} = ${lit(q.functionId)}`)
  }
  if (q.wireType !== undefined) {
    where.push(`${LOG_WIRE_TYPE} = ${lit(q.wireType)}`)
  }
  if (q.wireId !== undefined) where.push(`${LOG_WIRE_ID} = ${lit(q.wireId)}`)
  if (q.source !== undefined) where.push(`${LOG_SOURCE} = ${lit(q.source)}`)
  return where
}

export const logsQuery = (
  scope: TelemetryScope,
  q: LogsQuery,
  schema: Schema
): string | null => {
  if (!schema.logs) return null
  const where = [logScope(scope, schema), ...logFilters(q)]
  return `SELECT ${LOG_COLUMNS} FROM ${LOGS_TABLE} WHERE ${where.join(' AND ')} ORDER BY timestamp DESC, body DESC LIMIT ${limitOf(q.limit, DEFAULT_LIMIT)}`
}

export const logSeverityFacetQuery = (
  scope: TelemetryScope,
  q: { since?: number },
  schema: Schema
): string | null => {
  if (!schema.logs) return null
  const where = [logScope(scope, schema)]
  if (q.since !== undefined) where.push(`timestamp >= ${tsMs(q.since)}`)
  return `SELECT lower(severity_text) AS severity, count(*) AS n FROM ${LOGS_TABLE} WHERE ${where.join(' AND ')} GROUP BY 1`
}

const distinctLogValue = (
  expression: string,
  scope: TelemetryScope,
  q: { since?: number },
  schema: Schema
) => {
  const where = [logScope(scope, schema), `${expression} IS NOT NULL`]
  if (q.since !== undefined) where.push(`timestamp >= ${tsMs(q.since)}`)
  return `SELECT DISTINCT ${expression} AS value FROM ${LOGS_TABLE} WHERE ${where.join(' AND ')} ORDER BY 1 LIMIT ${FACET_LIMIT}`
}

export const logFunctionFacetQuery = (
  scope: TelemetryScope,
  q: { since?: number },
  schema: Schema
): string | null =>
  schema.logs ? distinctLogValue(LOG_FUNCTION, scope, q, schema) : null

export const logWireFacetQuery = (
  scope: TelemetryScope,
  q: { since?: number },
  schema: Schema
): string | null =>
  schema.logs ? distinctLogValue(LOG_WIRE_ID, scope, q, schema) : null

// ---------------------------------------------------------------- tail

/** `ns:<timestamp ns>:<rows already returned at that timestamp>` */
export const START_CURSOR = 'ns:0:0'
const CURSOR = /^ns:(\d{1,19}):(\d{1,9})$/

export const parseCursor = (
  cursor: string | null
): { ns: string; seen: number } => {
  const match = CURSOR.exec(cursor ?? START_CURSOR)
  if (!match) throw new RangeError('not a cursor this store returned')
  return { ns: match[1]!, seen: Number(match[2]) }
}

export const formatCursor = (ns: string, seen: number): string =>
  `ns:${ns}:${seen}`

/**
 * Rows sharing a timestamp are ordered by their content, so a page boundary can
 * fall inside a group and the next page resumes by offset into it. Two rows
 * identical in every column are each counted, so neither is repeated or lost.
 */
const TAIL_ORDER = 'timestamp, body, trace_id, span_id, severity_text'

/** The rest of the group at the cursor's timestamp, after the rows already returned. */
export const tailSameTimestampQuery = (
  scope: TelemetryScope,
  cursor: { ns: string; seen: number },
  limit: number | undefined,
  schema: Schema
): string | null => {
  if (!schema.logs) return null
  return `SELECT ${LOG_COLUMNS} FROM ${LOGS_TABLE} WHERE ${logScope(scope, schema)} AND timestamp = ${tsNs(cursor.ns)} ORDER BY ${TAIL_ORDER} LIMIT ${limitOf(limit, DEFAULT_LIMIT)} OFFSET ${int(cursor.seen)}`
}

/** Everything strictly after the cursor's timestamp. */
export const tailAfterQuery = (
  scope: TelemetryScope,
  cursor: { ns: string },
  limit: number | undefined,
  schema: Schema
): string | null => {
  if (!schema.logs) return null
  return `SELECT ${LOG_COLUMNS} FROM ${LOGS_TABLE} WHERE ${logScope(scope, schema)} AND timestamp > ${tsNs(cursor.ns)} ORDER BY ${TAIL_ORDER} LIMIT ${limitOf(limit, DEFAULT_LIMIT)}`
}

// ---------------------------------------------------------------- traces

const spanAttr = (schema: Schema, key: string): string => {
  const column = `span_attributes.${key}`
  return schema.traces?.has(column) ? ident(column) : STRING_NULL
}

const ROOT = `(parent_span_id IS NULL OR parent_span_id = '')`
const IS_ERROR = `span_status_code = 'STATUS_CODE_ERROR'`

/**
 * The scope of a span: the resource columns the store's own writes (and the
 * Pikku exporter) set. Null when they do not exist yet, so nothing can match.
 */
const spanScope = (scope: TelemetryScope, schema: Schema): string | null => {
  const project = 'resource_attributes.pikku.project'
  const stage = 'resource_attributes.pikku.stage'
  if (!schema.traces?.has(project) || !schema.traces.has(stage)) return null
  return `${ident(project)} = ${lit(scope.project)} AND ${ident(stage)} = ${lit(scope.stage)}${alive('timestamp', scope, schema)}`
}

const functionOf = (schema: Schema) =>
  `coalesce(${spanAttr(schema, 'pikku.function.id')}, span_name)`

export const failuresQuery = (
  scope: TelemetryScope,
  q: { since: number; limit?: number },
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped) return null
  return `SELECT ${functionOf(schema)} AS fn, ${spanAttr(schema, 'pikku.wire.type')} AS wire, coalesce(span_status_message, '') AS message, count(*) AS n, max(${msOf('timestamp')}) AS last_ms, first_value(trace_id ORDER BY timestamp DESC) AS sample_trace FROM ${TRACES_TABLE} WHERE ${scoped} AND ${ROOT} AND ${IS_ERROR} AND timestamp >= ${tsMs(q.since)} GROUP BY 1, 2, 3 ORDER BY n DESC, last_ms DESC LIMIT ${limitOf(q.limit, 50)}`
}

/**
 * The root spans in `[since, until)`. Bucket width is `ceil(range / buckets)`
 * milliseconds and buckets are aligned to `since`, so the bucket index is
 * integer arithmetic on the start time and no date_bin origin is involved.
 */
export const bucketWidth = (since: number, until: number, buckets: number) => {
  if (!Number.isSafeInteger(buckets) || buckets < 1) {
    throw new RangeError(`buckets must be a positive integer, got ${buckets}`)
  }
  return Math.max(1, Math.ceil((until - since) / buckets))
}

const window = (since: number, until: number) =>
  `timestamp >= ${tsMs(since)} AND timestamp < ${tsMs(until)}`

const errorCount = `sum(CASE WHEN ${IS_ERROR} THEN 1 ELSE 0 END)`

export const summaryTotalsQuery = (
  scope: TelemetryScope,
  q: { since: number; until: number },
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped) return null
  return `SELECT count(*) AS requests, ${errorCount} AS errors, avg(duration_nano) / 1000000.0 AS avg_ms, max(duration_nano) / 1000000.0 AS max_ms FROM ${TRACES_TABLE} WHERE ${scoped} AND ${ROOT} AND ${window(q.since, q.until)}`
}

export const summaryTrafficQuery = (
  scope: TelemetryScope,
  q: { since: number; until: number; buckets?: number },
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped) return null
  const width = bucketWidth(q.since, q.until, q.buckets ?? 30)
  return `SELECT (${msOf('timestamp')} - ${int(q.since)}) / ${int(width)} AS bucket, count(*) AS requests, ${errorCount} AS errors, avg(duration_nano) / 1000000.0 AS avg_ms, max(duration_nano) / 1000000.0 AS max_ms FROM ${TRACES_TABLE} WHERE ${scoped} AND ${ROOT} AND ${window(q.since, q.until)} GROUP BY 1 ORDER BY 1`
}

export const summaryFunctionsQuery = (
  scope: TelemetryScope,
  q: { since: number; until: number },
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped) return null
  return `SELECT ${functionOf(schema)} AS fn, ${spanAttr(schema, 'pikku.wire.type')} AS wire, count(*) AS requests, ${errorCount} AS errors, avg(duration_nano) / 1000000.0 AS avg_ms, max(${msOf('timestamp')}) AS last_ms FROM ${TRACES_TABLE} WHERE ${scoped} AND ${ROOT} AND ${window(q.since, q.until)} GROUP BY 1, 2 ORDER BY requests DESC, fn ASC`
}

/** The attribute columns of a span, as `[column, key]`. */
export const spanAttributeColumns = (schema: Schema): Array<[string, string]> =>
  [...(schema.traces ?? [])]
    .filter((column) => column.startsWith('span_attributes.'))
    .sort()
    .map((column) => [column, column.slice('span_attributes.'.length)])

export const traceQuery = (
  scope: TelemetryScope,
  traceId: string,
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped) return null
  const attributes = spanAttributeColumns(schema).map(([column]) =>
    ident(column)
  )
  const columns = [
    nsText('timestamp') + ' AS start_ns',
    msOf('timestamp') + ' AS start_ms',
    'duration_nano',
    'parent_span_id',
    'trace_id',
    'span_id',
    'span_kind',
    'span_name',
    'span_status_code',
    'span_status_message',
    ...attributes,
  ]
  return `SELECT ${columns.join(', ')} FROM ${TRACES_TABLE} WHERE ${scoped} AND trace_id = ${lit(traceId)} ORDER BY timestamp, span_id LIMIT ${MAX_LIMIT}`
}

const QUEUE_WIRE = `${'$WIRE'} = 'queue'`

const queueRoot = (schema: Schema) =>
  `${ROOT} AND ${QUEUE_WIRE.replace('$WIRE', spanAttr(schema, 'pikku.wire.type'))}`

const queueOf = (schema: Schema) =>
  `coalesce(${spanAttr(schema, 'pikku.queue.name')}, span_name)`

export const queueSummaryQuery = (
  scope: TelemetryScope,
  q: { since: number; limit?: number },
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped) return null
  return `SELECT ${queueOf(schema)} AS queue, sum(CASE WHEN ${IS_ERROR} THEN 0 ELSE 1 END) AS completed, ${errorCount} AS failed, max(${msOf('timestamp')}) AS last_ms FROM ${TRACES_TABLE} WHERE ${scoped} AND ${queueRoot(schema)} AND timestamp >= ${tsMs(q.since)} GROUP BY 1 ORDER BY last_ms DESC, queue ASC LIMIT ${limitOf(q.limit, 50)}`
}

/** The newest `perQueue` runs of each of `queues`. */
export const queueRecentQuery = (
  scope: TelemetryScope,
  q: { since: number; queues: string[]; perQueue: number },
  schema: Schema
): string | null => {
  const scoped = spanScope(scope, schema)
  if (!scoped || q.queues.length === 0) return null
  return `SELECT queue, at_ms, status, duration_ms, message FROM (SELECT ${queueOf(schema)} AS queue, ${msOf('timestamp')} AS at_ms, span_status_code AS status, duration_nano / 1000000.0 AS duration_ms, span_status_message AS message, row_number() OVER (PARTITION BY ${queueOf(schema)} ORDER BY timestamp DESC, span_id DESC) AS rn FROM ${TRACES_TABLE} WHERE ${scoped} AND ${queueRoot(schema)} AND timestamp >= ${tsMs(q.since)} AND ${queueOf(schema)} IN (${q.queues.map(lit).join(', ')})) ranked WHERE rn <= ${int(q.perQueue)} ORDER BY queue, at_ms DESC`
}

// ---------------------------------------------------------------- metrics

/** `pikku.process.cpu` is stored as the table `pikku_process_cpu` (plus a unit). */
export const metricTableStem = (name: string): string =>
  name.replace(/[^A-Za-z0-9_]/g, '_')

/**
 * Names whose table would be one this store reads or writes itself: the OTLP
 * log and trace tables, the metrics' physical table, the tombstones. A metric
 * called `opentelemetry_traces` would create (or append to) that table.
 */
export const reservedMetricName = (name: string): boolean => {
  // The engine strips leading punctuation and folds odd characters when it
  // names a table, so the test runs on the stem with those stripped too.
  const stem = metricTableStem(name)
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '')
  return (
    stem.startsWith('opentelemetry_') ||
    stem.startsWith('greptime_') ||
    stem.startsWith(TOMBSTONES_TABLE) ||
    stem === 'information_schema'
  )
}

/** A name or key the engine keeps as written: it renames or drops anything else. */
export const SAFE_METRIC_TEXT = /^[A-Za-z][A-Za-z0-9_.-]*$/

/**
 * Data point attribute keys that name a column the store itself fills or the
 * engine owns (scope, value, time, the resource tags). Compared with `.` and
 * `-` folded to `_` and case folded, as the engine does when it makes columns.
 */
export const reservedMetricAttribute = (key: string): boolean => {
  const column = key.toLowerCase().replace(/[.-]/g, '_')
  return (
    column.startsWith('pikku_') ||
    column.startsWith('greptime_') ||
    column.startsWith('otel_') ||
    column.startsWith('deployment_environment') ||
    column.startsWith('service_') ||
    column === 'job'
  )
}

/**
 * The metric tables a name can live in. The table name is the metric name with
 * dots turned to underscores plus a unit suffix the exporter adds
 * (`process_memory_rss_bytes`), so a name matches its stem or its stem and a
 * suffix. A trailing `*` matches by prefix; no name matches every metric.
 */
export const metricTables = (
  name: string | undefined,
  schema: Schema
): string[] => {
  const all = [...schema.metrics.keys()].sort()
  if (name === undefined) return all
  if (name.endsWith('*')) {
    const stem = metricTableStem(name.slice(0, -1))
    return all.filter((table) => table.startsWith(stem))
  }
  const stem = metricTableStem(name)
  return all.filter((table) => table === stem || table.startsWith(`${stem}_`))
}

/**
 * One metric table's points. The stage is `deployment_environment_name`, which
 * every metric table carries. The project is the `pikku_project` tag where the
 * table has one (what this store writes); the exporter's own tables have no such
 * column, so for those only the stage can scope them: an owner question.
 */
export const metricsQuery = (
  table: string,
  scope: TelemetryScope,
  q: { name?: string; since: number; until?: number; limit?: number },
  schema: Schema
): string | null => {
  const columns = schema.metrics.get(table)
  if (!columns) return null
  if (!columns.has('deployment_environment_name')) return null
  const has = (column: string) => columns.has(column)
  const where = [
    `deployment_environment_name = ${lit(scope.stage)}`,
    `greptime_timestamp >= ${tsMs(q.since)}`,
  ]
  if (has('pikku_project')) {
    where.push(`pikku_project = ${lit(scope.project)}`)
    const deletedAt = schema.tombstones?.get(scope.project)
    if (deletedAt !== undefined) {
      where.push(`greptime_timestamp > ${tsMs(deletedAt)}`)
    }
  }
  if (q.until !== undefined) where.push(`greptime_timestamp < ${tsMs(q.until)}`)
  if (q.name !== undefined && has('pikku_metric_name')) {
    // Rows this store wrote say which metric they are; rows the exporter wrote
    // do not, and are matched by their table alone.
    where.push(
      q.name.endsWith('*')
        ? `(pikku_metric_name IS NULL OR strpos(pikku_metric_name, ${lit(q.name.slice(0, -1))}) = 1)`
        : `(pikku_metric_name IS NULL OR pikku_metric_name = ${lit(q.name)})`
    )
  }
  const tags = [...columns]
    .filter((column) => !METRIC_FIXED_COLUMNS.has(column))
    .sort()
  const select = [
    `CAST(greptime_timestamp AS BIGINT) AS at_ms`,
    'greptime_value AS value',
    has('pikku_metric_name')
      ? 'pikku_metric_name AS metric_name'
      : `${STRING_NULL} AS metric_name`,
    ...tags.map(ident),
  ]
  return `SELECT ${select.join(', ')} FROM ${ident(table)} WHERE ${where.join(' AND ')} ORDER BY greptime_timestamp DESC LIMIT ${limitOf(q.limit, DEFAULT_METRIC_LIMIT)}`
}

export const metricTagColumns = (columns: Set<string>): string[] =>
  [...columns].filter((column) => !METRIC_FIXED_COLUMNS.has(column)).sort()

// ---------------------------------------------------------------- admin

export const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/
export const MAX_DATABASE_NAME = 63
/** Schemas the engine owns, and words a statement could mistake for syntax. */
const RESERVED_DATABASES = new Set([
  'information_schema',
  'pg_catalog',
  'public',
  'greptime',
  'greptime_private',
  'greptime_public',
  'system',
  'default',
  'select',
  'from',
  'where',
  'table',
  'database',
  'drop',
  'create',
  'insert',
  'delete',
  'update',
  'alter',
  'user',
  'order',
  'group',
  'null',
  'true',
  'false',
  'all',
  'and',
  'or',
  'not',
])

/**
 * A database name, lowercase only: the same string goes into the DDL and the
 * `x-greptime-db-name` header, and the engine folds unquoted DDL names to lower
 * case, so an uppercase name would be created under one name and written under
 * another.
 */
export const databaseName = (database: string): string => {
  if (typeof database !== 'string' || !SQL_IDENTIFIER.test(database)) {
    throw new TypeError(
      `'${String(database).slice(0, 80)}' is not a usable database name: use lowercase letters, digits and underscores, starting with a letter or underscore`
    )
  }
  if (database.length > MAX_DATABASE_NAME) {
    throw new TypeError(
      `the database name is longer than ${MAX_DATABASE_NAME} characters`
    )
  }
  if (RESERVED_DATABASES.has(database)) {
    throw new TypeError(`'${database}' is a reserved database name`)
  }
  return database
}

export const createDatabaseSql = (database: string, ttl?: string): string => {
  databaseName(database)
  if (ttl !== undefined && !/^\d+(ms|s|m|h|d|w|y)$/.test(ttl)) {
    throw new TypeError(`'${ttl}' is not a ttl such as '14d'`)
  }
  return `CREATE DATABASE IF NOT EXISTS ${database}${ttl ? ` WITH (ttl = ${lit(ttl)})` : ''}`
}

export const setTtlSql = (table: string, days: number): string => {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new RangeError(`retention days must be a positive integer`)
  }
  return `ALTER TABLE ${ident(table)} SET 'ttl' = ${lit(`${days}d`)}`
}

export const flushSql = (table: string) => `ADMIN flush_table(${lit(table)})`
export const compactSql = (table: string) =>
  `ADMIN compact_table(${lit(table)})`

export const schemaQuery = (database: string): string =>
  `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = ${lit(database)}`

export const createTombstonesSql = () =>
  `CREATE TABLE IF NOT EXISTS ${TOMBSTONES_TABLE} (project STRING, deleted_at TIMESTAMP(3) TIME INDEX, PRIMARY KEY (project))`

export const insertTombstoneSql = (project: string, at: number) =>
  `INSERT INTO ${TOMBSTONES_TABLE} (project, deleted_at) VALUES (${lit(project)}, ${tsMs(at)})`

export const tombstonesQuery = () =>
  `SELECT project, max(CAST(deleted_at AS BIGINT)) AS deleted_ms FROM ${TOMBSTONES_TABLE} GROUP BY project`

/** Bytes on disk per table; the metrics' logical tables report 0 (the physical table holds them). */
export const diskUsageQuery = (database: string): string =>
  `SELECT table_name, coalesce(data_length, 0) + coalesce(index_length, 0) AS bytes FROM information_schema.tables WHERE table_schema = ${lit(database)}`
