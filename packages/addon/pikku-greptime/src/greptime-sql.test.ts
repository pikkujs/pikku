import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as q from './greptime-sql.js'
import type { Schema } from './greptime-sql.js'

const scope = { project: "it's", stage: 'production' }

const schema: Schema = {
  logs: new Set(['timestamp']),
  traces: new Set([
    'resource_attributes.pikku.project',
    'resource_attributes.pikku.stage',
    'span_attributes.pikku.function.id',
    'span_attributes.pikku.wire.type',
    'span_attributes.pikku.queue.name',
  ]),
  metrics: new Map([
    [
      'pikku_process_cpu',
      new Set([
        'greptime_timestamp',
        'greptime_value',
        'deployment_environment_name',
        'pikku_project',
        'pikku_metric_name',
        'http_x',
      ]),
    ],
    [
      'pikku_process_memory_rss_bytes',
      new Set([
        'greptime_timestamp',
        'greptime_value',
        'deployment_environment_name',
      ]),
    ],
    ['pikku_queue_depth', new Set(['greptime_timestamp', 'greptime_value'])],
  ]),
}
const deleted: Schema = {
  ...schema,
  tombstones: new Map([[scope.project, 5000]]),
}

const LOG_SELECT =
  'SELECT (CAST(timestamp AS BIGINT) / 1000000) AS at_ms, CAST(CAST(timestamp AS BIGINT) AS VARCHAR) AS at_ns, severity_text, body, trace_id, span_id, log_attributes FROM opentelemetry_logs'
const LOG_SCOPE = `json_get_string(resource_attributes, '$["pikku.project"]') = 'it''s' AND json_get_string(resource_attributes, '$["pikku.stage"]') = 'production'`
const SPAN_SCOPE = `"resource_attributes.pikku.project" = 'it''s' AND "resource_attributes.pikku.stage" = 'production'`

describe('literals', () => {
  test('a quote is doubled and a backslash stays literal', () => {
    assert.equal(q.lit("a'b\\c%_"), "'a''b\\c%_'")
  })
  test('a NUL byte and a non-string are refused', () => {
    assert.throws(() => q.lit('a\0b'), TypeError)
    assert.throws(() => q.lit(5 as unknown as string), TypeError)
  })
  test('only safe integers become integer literals', () => {
    assert.equal(q.int(42), '42')
    assert.throws(() => q.int(1.5), TypeError)
    assert.throws(() => q.int(Number.NaN), TypeError)
  })
  test('an identifier is double quoted with its quotes doubled', () => {
    assert.equal(q.ident('span_attributes.a"b'), '"span_attributes.a""b"')
  })
  test('an injection attempt stays inside the literal', () => {
    const attempt = `x' OR '1'='1`
    assert.equal(
      q
        .logsQuery(scope, { traceId: attempt }, schema)
        ?.includes(`trace_id = 'x'' OR ''1''=''1'`),
      true
    )
  })
})

describe('logs', () => {
  test('every filter, golden', () => {
    assert.equal(
      q.logsQuery(
        scope,
        {
          since: 1000,
          until: 2000,
          limit: 5,
          severity: 'warn',
          search: "100%_it's",
          traceId: 't',
          functionId: 'f',
          wireType: 'http',
          wireId: '/x',
          source: 'dev',
        },
        schema
      ),
      `${LOG_SELECT} WHERE ${LOG_SCOPE} AND timestamp >= to_timestamp_millis(1000) AND timestamp < to_timestamp_millis(2000) AND lower(severity_text) IN ('warn', 'warning') AND strpos(lower(body), lower('100%_it''s')) > 0 AND trace_id = 't' AND json_get_string(log_attributes, '$["pikku.function.id"]') = 'f' AND json_get_string(log_attributes, '$["pikku.wire.type"]') = 'http' AND json_get_string(log_attributes, '$["pikku.wire.id"]') = '/x' AND coalesce(json_get_string(log_attributes, '$["pikku.log.source"]'), 'app') = 'dev' ORDER BY timestamp DESC, body DESC LIMIT 5`
    )
  })
  test('no filter: scope, newest first, default limit', () => {
    assert.equal(
      q.logsQuery(scope, {}, schema),
      `${LOG_SELECT} WHERE ${LOG_SCOPE} ORDER BY timestamp DESC, body DESC LIMIT 100`
    )
  })
  test('a deleted project is read only after its tombstone', () => {
    assert.match(
      q.logsQuery(scope, {}, deleted)!,
      /'production' AND timestamp > to_timestamp_millis\(5000\) ORDER BY/
    )
  })
  test('fatal also matches the critical the app logger sends', () => {
    assert.match(
      q.logsQuery(scope, { severity: 'fatal' }, schema)!,
      /IN \('fatal', 'critical'\)/
    )
  })
  test('a table that does not exist answers null, not SQL', () => {
    assert.equal(q.logsQuery(scope, {}, { metrics: new Map() }), null)
  })
  test('a bad limit is refused, a large one is capped', () => {
    assert.throws(() => q.logsQuery(scope, { limit: 0 }, schema), RangeError)
    assert.match(
      q.logsQuery(scope, { limit: 10 ** 9 }, schema)!,
      /LIMIT 10000$/
    )
  })
  test('every limit is capped at MAX_LIMIT, not only the logs one', () => {
    assert.equal(q.MAX_LIMIT, 10_000)
    const huge = 10 ** 9
    assert.match(q.logsQuery(scope, { limit: huge }, schema)!, /LIMIT 10000$/)
    assert.match(
      q.failuresQuery(scope, { since: 0, limit: huge }, schema)!,
      /LIMIT 10000$/
    )
    assert.match(
      q.tailAfterQuery(scope, { ns: '1' }, huge, schema)!,
      /LIMIT 10000$/
    )
    assert.match(
      q.tailSameTimestampQuery(scope, { ns: '1', seen: 0 }, huge, schema)!,
      /LIMIT 10000 OFFSET 0$/
    )
    assert.match(
      q.queueSummaryQuery(scope, { since: 0, limit: huge }, schema)!,
      /LIMIT 10000$/
    )
    const metricSchema = {
      metrics: new Map([
        [
          'm',
          new Set([
            'greptime_value',
            'greptime_timestamp',
            'deployment_environment_name',
          ]),
        ],
      ]),
    }
    assert.match(
      q.metricsQuery('m', scope, { since: 0, limit: huge }, metricSchema)!,
      /LIMIT 10000$/
    )
    assert.match(q.logsQuery(scope, { limit: 10_000 }, schema)!, /LIMIT 10000$/)
    assert.match(q.logsQuery(scope, { limit: 9_999 }, schema)!, /LIMIT 9999$/)
  })
  test('the warn filter also matches the warning the app logger sends, and both map back to warn', () => {
    const query = q.logsQuery(scope, { severity: 'warn' }, schema)!
    assert.ok(query.includes("lower(severity_text) IN ('warn', 'warning')"))
    assert.ok(!query.includes("'warn')"))
    assert.equal(q.severityOf('warning'), 'warn')
    assert.equal(q.severityOf('WARN'), 'warn')
    assert.match(q.logSeverityFacetQuery(scope, {}, schema)!, /severity_text/)
  })
  test('severity text maps back, unknown to info', () => {
    assert.equal(q.severityOf('CRITICAL'), 'fatal')
    assert.equal(q.severityOf('warning'), 'warn')
    assert.equal(q.severityOf('weird'), 'info')
    assert.equal(q.severityOf(null), 'info')
  })
  test('a scope without a project or a stage is refused', () => {
    assert.throws(() => q.requireScope({ project: '', stage: 'x' }), TypeError)
    assert.throws(() => q.requireScope({ project: 'x', stage: '' }), TypeError)
  })
})

describe('tail', () => {
  test('cursors round trip and bad ones are refused', () => {
    assert.deepEqual(q.parseCursor(null), { ns: '0', seen: 0 })
    assert.deepEqual(q.parseCursor(q.formatCursor('1794410741618000000', 2)), {
      ns: '1794410741618000000',
      seen: 2,
    })
    assert.throws(() => q.parseCursor('ts:1:2'), RangeError)
    assert.throws(() => q.parseCursor("ns:1:2'; DROP"), RangeError)
  })
  test('the rest of the group at the cursor, golden', () => {
    assert.equal(
      q.tailSameTimestampQuery(
        scope,
        { ns: '1794410741618000000', seen: 2 },
        3,
        schema
      ),
      `${LOG_SELECT} WHERE ${LOG_SCOPE} AND timestamp = arrow_cast(1794410741618000000, 'Timestamp(Nanosecond, None)') ORDER BY timestamp, body, trace_id, span_id, severity_text LIMIT 3 OFFSET 2`
    )
  })
  test('everything after the cursor, golden', () => {
    assert.equal(
      q.tailAfterQuery(scope, { ns: '5' }, undefined, schema),
      `${LOG_SELECT} WHERE ${LOG_SCOPE} AND timestamp > arrow_cast(5, 'Timestamp(Nanosecond, None)') ORDER BY timestamp, body, trace_id, span_id, severity_text LIMIT 100`
    )
  })
})

describe('traces', () => {
  test('failures group by function, wire and message', () => {
    assert.equal(
      q.failuresQuery(scope, { since: 1000 }, schema),
      `SELECT coalesce("span_attributes.pikku.function.id", span_name) AS fn, "span_attributes.pikku.wire.type" AS wire, coalesce(span_status_message, '') AS message, count(*) AS n, max((CAST(timestamp AS BIGINT) / 1000000)) AS last_ms, first_value(trace_id ORDER BY timestamp DESC) AS sample_trace FROM opentelemetry_traces WHERE ${SPAN_SCOPE} AND (parent_span_id IS NULL OR parent_span_id = '') AND span_status_code = 'STATUS_CODE_ERROR' AND timestamp >= to_timestamp_millis(1000) GROUP BY 1, 2, 3 ORDER BY n DESC, last_ms DESC LIMIT 50`
    )
  })
  test('a column that has not appeared yet is NULL, not an error', () => {
    const bare: Schema = {
      traces: new Set([
        'resource_attributes.pikku.project',
        'resource_attributes.pikku.stage',
      ]),
      metrics: new Map(),
    }
    assert.match(
      q.failuresQuery(scope, { since: 1 }, bare)!,
      /coalesce\(CAST\(NULL AS VARCHAR\), span_name\) AS fn, CAST\(NULL AS VARCHAR\) AS wire/
    )
  })
  test('without the resource columns nothing can match', () => {
    assert.equal(
      q.failuresQuery(
        scope,
        { since: 1 },
        { traces: new Set(['span_name']), metrics: new Map() }
      ),
      null
    )
  })
  test('buckets are aligned to since with a width of ceil(range / buckets)', () => {
    assert.equal(q.bucketWidth(0, 60000, 7), 8572)
    assert.equal(q.bucketWidth(10, 11, 30), 1)
    assert.equal(q.bucketWidth(0, 30, 30), 1)
    assert.throws(() => q.bucketWidth(0, 10, 0), RangeError)
    assert.match(
      q.summaryTrafficQuery(
        scope,
        { since: 100, until: 60100, buckets: 7 },
        schema
      )!,
      /\(\(CAST\(timestamp AS BIGINT\) \/ 1000000\) - 100\) \/ 8572 AS bucket/
    )
  })
  test('the window is [since, until)', () => {
    assert.match(
      q.summaryTotalsQuery(scope, { since: 1, until: 9 }, schema)!,
      /timestamp >= to_timestamp_millis\(1\) AND timestamp < to_timestamp_millis\(9\)/
    )
  })
  test('functions sort by requests, then name', () => {
    assert.match(
      q.summaryFunctionsQuery(scope, { since: 1, until: 9 }, schema)!,
      /ORDER BY requests DESC, fn ASC$/
    )
  })
  test('a trace is every span in the scope, oldest first, ties by span id', () => {
    const sqlText = q.traceQuery(scope, 'abc', schema)!
    assert.match(sqlText, /WHERE "resource_attributes.pikku.project" = 'it''s'/)
    assert.match(
      sqlText,
      /AND trace_id = 'abc' ORDER BY timestamp, span_id LIMIT 10000$/
    )
    assert.match(
      sqlText,
      /"span_attributes.pikku.function.id", "span_attributes.pikku.queue.name"/
    )
  })
  test('queue jobs: queue-wire roots, grouped by queue name or span name', () => {
    assert.equal(
      q.queueSummaryQuery(scope, { since: 1 }, schema),
      `SELECT coalesce("span_attributes.pikku.queue.name", span_name) AS queue, sum(CASE WHEN span_status_code = 'STATUS_CODE_ERROR' THEN 0 ELSE 1 END) AS completed, sum(CASE WHEN span_status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS failed, max((CAST(timestamp AS BIGINT) / 1000000)) AS last_ms FROM opentelemetry_traces WHERE ${SPAN_SCOPE} AND (parent_span_id IS NULL OR parent_span_id = '') AND "span_attributes.pikku.wire.type" = 'queue' AND timestamp >= to_timestamp_millis(1) GROUP BY 1 ORDER BY last_ms DESC, queue ASC LIMIT 50`
    )
  })
  test('the newest runs of each queue use a window function', () => {
    const sqlText = q.queueRecentQuery(
      scope,
      { since: 1, queues: ['a', "b'"], perQueue: 10 },
      schema
    )!
    assert.match(sqlText, /row_number\(\) OVER \(PARTITION BY coalesce/)
    assert.match(sqlText, /IN \('a', 'b'''\)\) ranked WHERE rn <= 10/)
    assert.equal(
      q.queueRecentQuery(scope, { since: 1, queues: [], perQueue: 10 }, schema),
      null
    )
  })
})

describe('metrics', () => {
  test('names map to tables by stem, unit suffix and prefix', () => {
    assert.equal(q.metricTableStem('pikku.process.cpu'), 'pikku_process_cpu')
    assert.deepEqual(q.metricTables('pikku.process.cpu', schema), [
      'pikku_process_cpu',
    ])
    assert.deepEqual(q.metricTables('pikku.process.memory.rss', schema), [
      'pikku_process_memory_rss_bytes',
    ])
    assert.deepEqual(q.metricTables('pikku.process.*', schema), [
      'pikku_process_cpu',
      'pikku_process_memory_rss_bytes',
    ])
    assert.deepEqual(q.metricTables('pikku.proc', schema), [])
    assert.equal(q.metricTables(undefined, schema).length, 3)
  })
  test('one table, golden', () => {
    assert.equal(
      q.metricsQuery(
        'pikku_process_cpu',
        scope,
        { name: 'pikku.process.*', since: 1, until: 9, limit: 3 },
        deleted
      ),
      `SELECT CAST(greptime_timestamp AS BIGINT) AS at_ms, greptime_value AS value, pikku_metric_name AS metric_name, "http_x" FROM "pikku_process_cpu" WHERE deployment_environment_name = 'production' AND greptime_timestamp >= to_timestamp_millis(1) AND pikku_project = 'it''s' AND greptime_timestamp > to_timestamp_millis(5000) AND greptime_timestamp < to_timestamp_millis(9) AND (pikku_metric_name IS NULL OR strpos(pikku_metric_name, 'pikku.process.') = 1) ORDER BY greptime_timestamp DESC LIMIT 3`
    )
  })
  test('a table the exporter wrote is scoped by stage alone', () => {
    const sqlText = q.metricsQuery(
      'pikku_process_memory_rss_bytes',
      scope,
      { since: 1 },
      schema
    )!
    assert.doesNotMatch(sqlText, /pikku_project/)
    assert.match(sqlText, /deployment_environment_name = 'production'/)
  })
  test('a table with no stage column is never read', () => {
    assert.equal(
      q.metricsQuery('pikku_queue_depth', scope, { since: 1 }, schema),
      null
    )
  })
})

describe('admin statements', () => {
  test('create database, with and without a ttl', () => {
    assert.equal(
      q.createDatabaseSql('pikku'),
      'CREATE DATABASE IF NOT EXISTS pikku'
    )
    assert.equal(
      q.createDatabaseSql('pikku', '14d'),
      "CREATE DATABASE IF NOT EXISTS pikku WITH (ttl = '14d')"
    )
    assert.throws(() => q.createDatabaseSql('a; DROP'), TypeError)
    assert.throws(() => q.createDatabaseSql('a', "1d'"), TypeError)
  })
  test('ttl, flush, compact and tombstone statements', () => {
    assert.equal(
      q.setTtlSql('opentelemetry_logs', 14),
      `ALTER TABLE "opentelemetry_logs" SET 'ttl' = '14d'`
    )
    assert.throws(() => q.setTtlSql('t', 0), RangeError)
    assert.equal(q.flushSql('t'), `ADMIN flush_table('t')`)
    assert.equal(q.compactSql('t'), `ADMIN compact_table('t')`)
    assert.equal(
      q.insertTombstoneSql("it's", 7),
      `INSERT INTO pikku_project_tombstones (project, deleted_at) VALUES ('it''s', to_timestamp_millis(7))`
    )
  })
})

describe('database names', () => {
  test('lowercase identifiers up to 63 characters are accepted', () => {
    assert.equal(q.databaseName('pikku'), 'pikku')
    assert.equal(q.databaseName('tel_2'), 'tel_2')
    assert.equal(q.databaseName('a'.repeat(63)).length, 63)
  })
  test('uppercase, over-long, odd and reserved names are refused', () => {
    for (const name of [
      'Pikku',
      'PIKKU',
      'a'.repeat(64),
      '',
      '1abc',
      'a-b',
      'a b',
      'a;drop',
      'a"b',
      'information_schema',
      'pg_catalog',
      'public',
      'greptime_private',
      'greptime',
      'select',
    ]) {
      assert.throws(() => q.databaseName(name), TypeError, name)
      assert.throws(() => q.createDatabaseSql(name), TypeError, name)
    }
  })
})

describe('reserved metric names and attributes', () => {
  test('names that map onto the store tables', () => {
    for (const name of [
      'opentelemetry_traces',
      'opentelemetry.logs',
      'greptime_physical_table',
      'pikku_project_tombstones',
    ]) {
      assert.equal(q.reservedMetricName(name), true, name)
    }
    for (const name of ['pikku.process.cpu', 'http.requests', 'tombstones']) {
      assert.equal(q.reservedMetricName(name), false, name)
    }
  })
  test('attribute keys that are scope or engine columns, in any spelling', () => {
    for (const key of [
      'pikku.project',
      'pikku_stage',
      'Pikku-Metric-Name',
      'greptime_value',
      'job',
      'service.name',
      'deployment.environment.name',
    ]) {
      assert.equal(q.reservedMetricAttribute(key), true, key)
    }
    for (const key of ['region', 'http.route', 'jobs', 'project']) {
      assert.equal(q.reservedMetricAttribute(key), false, key)
    }
  })
})
