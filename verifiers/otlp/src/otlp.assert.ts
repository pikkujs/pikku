import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'

import { ConsoleLogger } from '@pikku/core/services'
import { decodeLogs, decodeMetrics, decodeTraces } from '@pikku/core/testing'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  childTraceWire,
  createTrace,
  type TraceContext,
} from '@pikku/core/trace'
import {
  asContextStorage,
  createRuntimeTelemetry,
  OTLP_QUEUE_LIMITS,
  OtlpHttpExporter,
  OtlpTracer,
} from '@pikku/core/otlp'
import { startGreptime, type Greptime } from './greptime.js'
import { ERROR_MESSAGE, runApp } from './app.js'

type Received = {
  path: string
  headers: Record<string, string | string[] | undefined>
  body: Uint8Array
}

/** A real HTTP receiver on a loopback port that keeps every OTLP request. */
const receiver = async () => {
  const received: Received[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push({
        path: request.url ?? '',
        headers: request.headers,
        body: new Uint8Array(Buffer.concat(chunks)),
      })
      response.writeHead(200).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    received,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const quiet = new ConsoleLogger()
quiet.setLevel(5)

describe('createRuntimeTelemetry against a real HTTP receiver', () => {
  test('a two-hop app exports its spans, logs and process metrics as protobuf', async () => {
    const sink = await receiver()
    const telemetry = createRuntimeTelemetry(
      {
        PIKKU_OTLP_ENDPOINT: `http://127.0.0.1:${sink.port}/v1/otlp`,
        PIKKU_OTLP_HEADERS: 'x-greptime-db-name=pikku',
        PIKKU_PROJECT: 'invoices',
        PIKKU_STAGE: 'production',
      },
      { logger: quiet, serviceName: 'verifier', version: '1.0.0' }
    )
    const { trace, failing } = await runApp({
      logger: telemetry.logger,
      tracer: telemetry.tracer,
    })
    await telemetry.close()
    await sink.close()

    const at = (suffix: string) =>
      sink.received.filter((r) => r.path === `/v1/otlp/v1/${suffix}`)
    for (const request of sink.received) {
      assert.equal(request.headers['content-type'], 'application/x-protobuf')
      assert.equal(request.headers['x-greptime-db-name'], 'pikku')
    }

    const traces = at('traces').map((r) => decodeTraces(r.body))
    const spans = traces.flatMap((t) => t.items)
    assert.deepEqual(traces[0]!.resource['service.name'], {
      string: 'invoices',
    })
    assert.deepEqual(traces[0]!.resource['pikku.stage'], {
      string: 'production',
    })

    const byName = (name: string) => spans.find((s) => s.name === name)!
    const root = byName('createInvoice')
    const child = byName('chargeCard')
    assert.equal(root.traceId, trace.traceId)
    assert.equal(child.traceId, trace.traceId)
    assert.equal(child.parentSpanId, root.spanId)
    assert.equal(root.kind, 2)
    assert.deepEqual(root.attributes['http.response.status_code'], {
      int: 201n,
    })
    assert.deepEqual(root.attributes['pikku.trace.root'], { bool: false })

    const refused = byName('refuse')
    assert.equal(refused.traceId, failing.traceId)
    assert.equal(refused.status.code, 2)
    assert.equal(refused.status.message, `Error: ${ERROR_MESSAGE}`)
    assert.equal(refused.events[0]!.name, 'exception')

    const logs = at('logs').flatMap((r) => decodeLogs(r.body).items)
    assert.deepEqual(
      logs.map((l) => l.body),
      [{ string: 'charging' }, { string: 'invoice created with a warning' }]
    )

    const metrics = at('metrics').flatMap((r) => decodeMetrics(r.body).items)
    assert.ok(metrics.some((m) => m.name === 'process.memory.rss'))
  })

  test('a service built at startup parents an outbound client span on the running span, host only', async () => {
    const sink = await receiver()
    const telemetry = createRuntimeTelemetry(
      { PIKKU_OTLP_ENDPOINT: `http://127.0.0.1:${sink.port}/v1/otlp` },
      {
        logger: quiet,
        serviceName: 'verifier',
        contextStorage: asContextStorage(new AsyncLocalStorage<TraceContext>()),
      }
    )
    const { tracer } = telemetry
    // What an addon's scoped `http` service does: it has no wire, only the tracer.
    const startupHttp = async (blocked: boolean) => {
      const parent = tracer.currentContext?.()
      if (!parent) return
      const span = tracer.startSpan('HTTP GET', childTraceWire(parent).trace, {
        kind: 'client',
        attributes: {
          'http.request.method': 'GET',
          'server.address': 'api.example.com',
          'server.port': 443,
          'pikku.network.rule': '*.example.com',
          'pikku.network.blocked': blocked,
          'url.full': 'https://api.example.com/v1/users?token=secret',
          'url.path': '/v1/users',
          'url.query': 'token=secret',
        },
      })
      await new Promise((resolve) => setTimeout(resolve, 1))
      span.end({ code: 'ok' })
    }

    const trace = createTrace()
    const fn = tracer.startSpan('callVendor', trace, { kind: 'server' })
    await tracer.runInSpan!(fn, () => startupHttp(false))
    fn.end({ code: 'ok' })
    await startupHttp(true)
    await telemetry.close()
    await sink.close()

    const spans = sink.received
      .filter((r) => r.path === '/v1/otlp/v1/traces')
      .flatMap((r) => decodeTraces(r.body).items)
    const client = spans.filter((s) => s.name === 'HTTP GET')
    assert.equal(client.length, 1, 'outside a span no client span is opened')
    const [span] = client
    assert.equal(span!.traceId, trace.traceId)
    assert.equal(span!.parentSpanId, trace.spanId)
    assert.equal(span!.kind, 3)
    assert.deepEqual(span!.attributes['server.address'], {
      string: 'api.example.com',
    })
    assert.deepEqual(span!.attributes['server.port'], { int: 443n })
    assert.deepEqual(span!.attributes['pikku.network.rule'], {
      string: '*.example.com',
    })
    assert.deepEqual(span!.attributes['pikku.network.blocked'], {
      bool: false,
    })
    for (const key of ['url.full', 'url.path', 'url.query']) {
      assert.equal(span!.attributes[key], undefined, `${key} is never exported`)
    }
    assert.ok(
      !sink.received.some((r) =>
        Buffer.from(r.body).toString('latin1').includes('token=secret')
      ),
      'the query string reaches no OTLP request'
    )
  })
})

const GREPTIME_BIN = process.env.GREPTIME_BIN

/**
 * The acceptance check: the exporter's protobuf into a real GreptimeDB, read
 * back with SQL. Runs when GREPTIME_BIN points at a `greptime` binary (v1.3.0);
 * without it the suite is skipped, not faked.
 */
describe(
  'a real GreptimeDB',
  {
    skip: GREPTIME_BIN ? false : 'set GREPTIME_BIN to a greptime v1.3.0 binary',
  },
  () => {
    let greptime: Greptime
    let trace: { traceId: string }
    let failing: { traceId: string }

    const poll = async <T>(
      read: () => Promise<T>,
      done: (value: T) => boolean
    ) => {
      const deadline = Date.now() + 15_000
      for (;;) {
        const value = await read().catch(() => undefined)
        if (value !== undefined && done(value)) return value
        if (Date.now() > deadline)
          assert.fail('GreptimeDB never returned the rows')
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    before(async () => {
      greptime = await startGreptime(GREPTIME_BIN!)
      await greptime.sql('CREATE DATABASE pikku')
      const telemetry = createRuntimeTelemetry(
        {
          PIKKU_OTLP_ENDPOINT: greptime.otlpEndpoint,
          // The database goes on every signal; the trace pipeline on traces only:
          // GreptimeDB answers a logs request that names it with a 400.
          PIKKU_OTLP_HEADERS: 'x-greptime-db-name=pikku',
          PIKKU_OTLP_TRACES_HEADERS:
            'x-greptime-pipeline-name=greptime_trace_v1',
          PIKKU_PROJECT: 'invoices',
          PIKKU_STAGE: 'production',
        },
        { logger: quiet, serviceName: 'verifier', version: '1.0.0' }
      )
      const app = await runApp({
        logger: telemetry.logger,
        tracer: telemetry.tracer,
      })
      trace = app.trace
      failing = app.failing
      await telemetry.close()
    })

    after(async () => {
      await greptime?.stop()
    })

    const traceRows = () =>
      greptime.sql(
        `SELECT span_name, span_status_code, span_status_message, span_kind, parent_span_id, trace_id, span_id,
              "span_attributes.http.response.status_code", "span_attributes.pikku.wire.type",
              "span_attributes.pikku.trace.root", service_name, span_events
         FROM opentelemetry_traces ORDER BY timestamp`,
        'pikku'
      )

    test('spans: parent/child tree, status strings and typed attributes read back', async () => {
      const { columns, rows } = await poll(
        traceRows,
        (r) => r.rows.length === 3
      )
      const row = (name: string) =>
        Object.fromEntries(
          columns.map((c, i) => [c, rows.find((r) => r[0] === name)![i]])
        )
      const root = row('createInvoice')
      const child = row('chargeCard')
      const refused = row('refuse')
      assert.equal(root.trace_id, trace.traceId)
      assert.equal(child.parent_span_id, root.span_id)
      assert.equal(root.span_status_code, 'STATUS_CODE_OK')
      assert.equal(root.span_kind, 'SPAN_KIND_SERVER')
      assert.equal(root['span_attributes.http.response.status_code'], 201)
      assert.equal(root['span_attributes.pikku.wire.type'], 'http')
      assert.equal(root.service_name, 'invoices')
      assert.equal(refused.trace_id, failing.traceId)
      assert.equal(refused.span_status_code, 'STATUS_CODE_ERROR')
      assert.equal(refused.span_status_message, `Error: ${ERROR_MESSAGE}`)
      const events = refused.span_events as {
        name: string
        attributes: Record<string, string>
      }[]
      assert.equal(events[0]!.name, 'exception')
      assert.equal(
        events[0]!.attributes['exception.message'],
        `Error: ${ERROR_MESSAGE}`
      )
    })

    test('spans: resource attributes are flattened into resource_attributes.* columns', async () => {
      const { rows } = await greptime.sql(
        `SELECT "resource_attributes.service.version", "resource_attributes.deployment.environment.name",
              "resource_attributes.pikku.project", "resource_attributes.pikku.stage"
         FROM opentelemetry_traces LIMIT 1`,
        'pikku'
      )
      assert.deepEqual(rows[0], [
        '1.0.0',
        'production',
        'invoices',
        'production',
      ])
      const ddl = (
        await greptime.sql('SHOW CREATE TABLE opentelemetry_traces', 'pikku')
      ).rows[0]![1] as string
      assert.match(ddl, /"resource_attributes\.pikku\.stage" STRING/)
      assert.match(ddl, /"span_attributes\.http\.response\.status_code" BIGINT/)
      assert.match(ddl, /table_data_model = 'greptime_trace_v1'/)
    })

    test('logs: the body, severity, attributes and trace ids read back', async () => {
      const { rows } = await poll(
        () =>
          greptime.sql(
            'SELECT body, severity_text, severity_number, log_attributes, trace_id FROM opentelemetry_logs ORDER BY timestamp',
            'pikku'
          ),
        (r) => r.rows.length === 2
      )
      assert.deepEqual(
        rows.map((r) => [r[0], r[1], r[2]]),
        [
          ['charging', 'info', 9],
          ['invoice created with a warning', 'warn', 13],
        ]
      )
      assert.deepEqual(rows[0]![3], { amount: 12 })
    })

    test('metrics: process gauges land in per-metric tables named from the OTel name and unit', async () => {
      const tables = (await greptime.sql('SHOW TABLES', 'pikku')).rows.map(
        (r) => r[0]
      )
      for (const name of [
        'process_cpu_utilization_ratio',
        'process_memory_rss_bytes',
        'process_heap_used_bytes',
        'eventloop_lag_milliseconds',
      ]) {
        assert.ok(tables.includes(name), `${name} in ${tables}`)
      }
      const { columns, rows } = await greptime.sql(
        'SELECT * FROM process_memory_rss_bytes',
        'pikku'
      )
      assert.ok(columns.includes('deployment_environment_name'))
      assert.ok(columns.includes('service_name'))
      assert.ok(
        (rows[0]![columns.indexOf('greptime_value')] as number) > 1_000_000
      )
      assert.equal(
        rows[0]![columns.indexOf('deployment_environment_name')],
        'production'
      )
    })

    test('a counter lands as <name>_total, the loss counter included', async () => {
      const exporter = new OtlpHttpExporter({
        endpoint: greptime.otlpEndpoint,
        headers: { 'x-greptime-db-name': 'pikku' },
        resource: { serviceName: 'invoices' },
        flushIntervalMs: 60_000,
      })
      exporter.exportLogs(
        Array.from({ length: OTLP_QUEUE_LIMITS.logs + 7 }, () => ({
          severity: 'info' as const,
          body: 'overflow',
        }))
      )
      await exporter.close()
      const { columns, rows } = await poll(
        () =>
          greptime.sql('SELECT * FROM pikku_telemetry_dropped_total', 'pikku'),
        (r) => r.rows.length > 0
      )
      assert.equal(rows[0]![columns.indexOf('greptime_value')], 7)
      assert.equal(rows[0]![columns.indexOf('signal')], 'logs')
    })

    test('an attribute that flips type is coerced, not rejected (a raw flip is a 400)', async () => {
      const exporter = new OtlpHttpExporter({
        endpoint: greptime.otlpEndpoint,
        headers: { 'x-greptime-db-name': 'pikku' },
        headersBySignal: {
          traces: { 'x-greptime-pipeline-name': 'greptime_trace_v1' },
        },
        resource: { serviceName: 'invoices' },
        flushIntervalMs: 60_000,
        logger: new ConsoleLogger(),
      })
      const tracer = new OtlpTracer(exporter)
      const span = tracer.startSpan('flipped', createTrace())
      // The column is BIGINT; this string would be rejected if sent as is.
      span.setAttribute('http.response.status_code', 'oops')
      span.setAttribute('pikku.function.duration_ms', 2.6)
      span.end({ code: 'ok' })
      await exporter.close()
      const { rows } = await poll(
        () =>
          greptime.sql(
            `SELECT "span_attributes.http.response.status_code", "span_attributes.pikku.function.duration_ms"
             FROM opentelemetry_traces WHERE span_name = 'flipped'`,
            'pikku'
          ),
        (r) => r.rows.length === 1
      )
      assert.deepEqual(rows[0], [null, 3])
      assert.equal(exporter.stats.attributesDropped, 1)

      // The same flip without the exporter's coercion is what GreptimeDB refuses.
      const { encodeTraces } =
        await import('../../../packages/core/src/otlp/otlp-encode.js')
      const body = encodeTraces({ serviceName: 'invoices' }, [
        {
          traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          spanId: 'bbbbbbbbbbbbbbbb',
          name: 'raw flip',
          kind: 'internal',
          startTimeUnixNano: 1n,
          endTimeUnixNano: 2n,
          status: { code: 'ok' },
          attributes: { 'http.response.status_code': 'oops' },
        },
      ])
      const response = await fetch(`${greptime.otlpEndpoint}/v1/traces`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-protobuf',
          'x-greptime-db-name': 'pikku',
          'x-greptime-pipeline-name': 'greptime_trace_v1',
        },
        body: new Uint8Array(body),
      })
      assert.equal(response.status, 400)
      assert.match(await response.text(), /failed to coerce trace column/)
    })
  }
)
