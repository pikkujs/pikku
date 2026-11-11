import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Logger } from '../services/logger.js'
import { NOOP_TRACER } from '../tracer.js'
import { decodeLogs, decodeTraces } from '../testing/otlp-decoder.js'
import { createTrace } from '../trace.js'
import { isLoopbackHost, parseOtlpEndpoint } from './loopback.js'
import {
  createRuntimeTelemetry,
  parseOtlpHeaders,
} from './runtime-telemetry.js'

const logger = (warnings: string[] = []): Logger => ({
  info() {},
  warn: (m: unknown) => void warnings.push(String(m)),
  error() {},
  debug() {},
  setLevel() {},
})

const capture = () => {
  const requests: {
    url: string
    headers: Record<string, string>
    body: Uint8Array
  }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as Uint8Array,
    })
    return new Response(null, { status: 200 })
  }) as never
  return { requests, fetchImpl }
}

describe('loopback guard', () => {
  test('accepts only addresses that stay on this machine', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '127.255.0.9',
      '[::1]',
      'LOCALHOST',
    ]) {
      assert.equal(isLoopbackHost(host), true, host)
    }
    for (const host of [
      '0.0.0.0',
      '10.0.0.1',
      '192.168.1.5',
      '127.0.0.1.evil.com',
      'localhost.evil.com',
      'example.com',
      '[::]',
      '[::ffff:7f00:1]x',
      '300.0.0.1',
    ]) {
      assert.equal(isLoopbackHost(host), false, host)
    }
  })

  test('normalised spellings of 127.0.0.1 are still loopback', () => {
    for (const endpoint of [
      'http://127.1:4000/x',
      'http://2130706433/x',
      'http://0x7f.0.0.1/x',
    ]) {
      assert.doesNotThrow(() => parseOtlpEndpoint(endpoint, false), endpoint)
    }
  })

  test('refuses a remote endpoint unless allowed', () => {
    assert.throws(
      () => parseOtlpEndpoint('https://otel.example.com/v1/otlp', false),
      /not a loopback/
    )
    assert.throws(
      () => parseOtlpEndpoint('http://user@127.0.0.1.evil.com/', false),
      /not a loopback/
    )
    assert.equal(
      parseOtlpEndpoint('https://otel.example.com/x', true).hostname,
      'otel.example.com'
    )
  })

  test('refuses non-http schemes and garbage', () => {
    assert.throws(
      () => parseOtlpEndpoint('file:///etc/passwd', true),
      /http or https/
    )
    assert.throws(() => parseOtlpEndpoint('not a url', true), /valid URL/)
    for (const endpoint of [
      'http://127.0.0.1:4000/v1/otlp?api_key=hunter2',
      'http://127.0.0.1:4000/v1/otlp#frag',
      'http://127.0.0.1:4000/v1/otlp?',
      'http://127.0.0.1:4000/v1/otlp#',
    ]) {
      assert.throws(
        () => parseOtlpEndpoint(endpoint, false),
        (error: Error) =>
          /query string or fragment/.test(error.message) &&
          !error.message.includes('hunter2')
      )
    }
  })
})

describe('parseOtlpHeaders', () => {
  test('parses percent-encoded k=v pairs', () => {
    assert.deepEqual(
      parseOtlpHeaders(
        'x-greptime-db-name=pikku,authorization=Basic%20YTpi,x=a%3Db%2Cc'
      ),
      { 'x-greptime-db-name': 'pikku', authorization: 'Basic YTpi', x: 'a=b,c' }
    )
    assert.deepEqual(parseOtlpHeaders(undefined), {})
    assert.deepEqual(parseOtlpHeaders(' '), {})
  })

  test('refuses a malformed entry rather than dropping it', () => {
    assert.throws(() => parseOtlpHeaders('novalue'), /name=value/)
    assert.throws(() => parseOtlpHeaders('bad name=1'), /name=value/)
    assert.throws(() => parseOtlpHeaders('a=%zz'), /percent-encoding/)
    assert.throws(() => parseOtlpHeaders('a=x%0d%0ainjected: 1'), /line break/)
  })
})

describe('createRuntimeTelemetry', () => {
  const options = (extra: object = {}) => ({
    logger: logger(),
    serviceName: 'pkg-name',
    version: '9.9.9',
    ...extra,
  })

  test('no endpoint: no-op tracer, the same logger, nothing running', async () => {
    const plain = logger()
    const telemetry = createRuntimeTelemetry(
      {},
      { logger: plain, serviceName: 'x' }
    )
    assert.equal(telemetry.enabled, false)
    assert.equal(telemetry.tracer, NOOP_TRACER)
    assert.equal(telemetry.logger, plain)
    await telemetry.flush()
    await telemetry.close()
  })

  test('PIKKU_TELEMETRY=0 turns everything off even with an endpoint', () => {
    const telemetry = createRuntimeTelemetry(
      {
        PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4000/v1/otlp',
        PIKKU_TELEMETRY: '0',
      },
      options()
    )
    assert.equal(telemetry.enabled, false)
    assert.equal(telemetry.tracer, NOOP_TRACER)
  })

  test('PIKKU_TELEMETRY 0, false and off in any case or padding are off', () => {
    for (const value of ['0', 'false', 'FALSE', ' off ', 'Off']) {
      const telemetry = createRuntimeTelemetry(
        {
          PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4000/v1/otlp',
          PIKKU_TELEMETRY: value,
        },
        options()
      )
      assert.equal(telemetry.enabled, false, value)
    }
  })

  test('a non-loopback endpoint throws at boot unless PIKKU_OTLP_ALLOW_REMOTE=1', async () => {
    const env = { PIKKU_OTLP_ENDPOINT: 'https://otel.example.com/api/org' }
    assert.throws(
      () => createRuntimeTelemetry(env, options()),
      /not a loopback/
    )
    const { fetchImpl } = capture()
    const telemetry = createRuntimeTelemetry(
      { ...env, PIKKU_OTLP_ALLOW_REMOTE: '1' },
      options({ fetch: fetchImpl })
    )
    assert.equal(telemetry.enabled, true)
    await telemetry.close()
  })

  test('PIKKU_OTLP_{TRACES,LOGS,METRICS}_HEADERS apply to their own signal only', async () => {
    const { requests, fetchImpl } = capture()
    const telemetry = createRuntimeTelemetry(
      {
        PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4000/v1/otlp',
        PIKKU_OTLP_HEADERS: 'x-db=pikku',
        PIKKU_OTLP_TRACES_HEADERS: 'x-greptime-pipeline-name=greptime_trace_v1',
        PIKKU_OTLP_LOGS_HEADERS: 'x-only=logs',
      },
      options({ fetch: fetchImpl })
    )
    telemetry.tracer.startSpan('s', createTrace()).end()
    telemetry.logger.warn('hello')
    await telemetry.flush()
    await telemetry.close()
    const at = (suffix: string) => requests.find((r) => r.url.endsWith(suffix))!
    assert.equal(
      at('/v1/traces').headers['x-greptime-pipeline-name'],
      'greptime_trace_v1'
    )
    assert.equal(at('/v1/traces').headers['x-only'], undefined)
    assert.equal(at('/v1/logs').headers['x-only'], 'logs')
    assert.equal(at('/v1/logs').headers['x-greptime-pipeline-name'], undefined)
    assert.equal(at('/v1/logs').headers['x-db'], 'pikku')
  })

  test('a malformed per-signal header names its own variable', () => {
    assert.throws(
      () =>
        createRuntimeTelemetry(
          {
            PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4000/v1/otlp',
            PIKKU_OTLP_LOGS_HEADERS: 'broken',
          },
          options()
        ),
      /PIKKU_OTLP_LOGS_HEADERS/
    )
  })

  test('credentials in the endpoint are refused without echoing the URL', () => {
    assert.throws(
      () => parseOtlpEndpoint('http://user:pw-sentinel@127.0.0.1:4000/', false),
      (error: Error) =>
        /credentials/.test(error.message) &&
        !/pw-sentinel|user/.test(error.message)
    )
  })

  test('PIKKU_OTLP_ALLOW_REMOTE=1 still requires https off the machine', () => {
    assert.throws(
      () => parseOtlpEndpoint('http://otel.example.com/', true),
      /https/
    )
    assert.equal(
      parseOtlpEndpoint('https://otel.example.com/', true).protocol,
      'https:'
    )
    assert.equal(
      parseOtlpEndpoint('http://127.0.0.1:4000/', true).protocol,
      'http:'
    )
  })

  test('sends spans and logs with the resource, headers and service name from env', async () => {
    const { requests, fetchImpl } = capture()
    const telemetry = createRuntimeTelemetry(
      {
        PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4000/v1/otlp',
        PIKKU_OTLP_HEADERS:
          'x-greptime-db-name=pikku,x-greptime-pipeline-name=greptime_trace_v1',
        PIKKU_PROJECT: 'invoices',
        PIKKU_STAGE: 'develop',
        PIKKU_OTLP_LOG_LEVEL: 'warn',
      },
      options({ fetch: fetchImpl })
    )
    assert.equal(telemetry.enabled, true)
    telemetry.tracer.startSpan('fn', createTrace()).end({ code: 'ok' })
    telemetry.logger.info('below the floor')
    telemetry.logger.warn('over the floor')
    telemetry.stopMetrics()
    await telemetry.flush()
    await telemetry.close()

    const traces = requests.find((r) => r.url.endsWith('/v1/otlp/v1/traces'))!
    assert.equal(
      traces.headers['x-greptime-pipeline-name'],
      'greptime_trace_v1'
    )
    const { resource } = decodeTraces(traces.body)
    assert.deepEqual(resource['service.name'], { string: 'invoices' })
    assert.deepEqual(resource['service.version'], { string: '9.9.9' })
    assert.deepEqual(resource['pikku.project'], { string: 'invoices' })
    assert.deepEqual(resource['pikku.stage'], { string: 'develop' })
    assert.deepEqual(resource['deployment.environment.name'], {
      string: 'develop',
    })

    const logs = decodeLogs(
      requests.find((r) => r.url.endsWith('/v1/logs'))!.body
    )
    assert.deepEqual(
      logs.items.map((l) => l.body),
      [{ string: 'over the floor' }]
    )
  })

  test('service name falls back to the explicit override, then project, then the package', () => {
    const name = async (env: Record<string, string>) => {
      const { requests, fetchImpl } = capture()
      const telemetry = createRuntimeTelemetry(
        { PIKKU_OTLP_ENDPOINT: 'http://localhost:1/x', ...env },
        options({ fetch: fetchImpl })
      )
      telemetry.stopMetrics()
      telemetry.tracer.startSpan('f', createTrace()).end({ code: 'ok' })
      await telemetry.close()
      return decodeTraces(requests.find((r) => r.url.endsWith('/traces'))!.body)
        .resource['service.name']
    }
    return Promise.all([
      name({ PIKKU_OTLP_SERVICE_NAME: 'explicit', PIKKU_PROJECT: 'p' }).then(
        (v) => assert.deepEqual(v, { string: 'explicit' })
      ),
      name({ PIKKU_PROJECT: 'p' }).then((v) =>
        assert.deepEqual(v, { string: 'p' })
      ),
      name({}).then((v) => assert.deepEqual(v, { string: 'pkg-name' })),
    ])
  })

  test('an unknown log level warns and falls back to info', async () => {
    const warnings: string[] = []
    const telemetry = createRuntimeTelemetry(
      {
        PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:1/x',
        PIKKU_OTLP_LOG_LEVEL: 'loud',
      },
      { logger: logger(warnings), serviceName: 'x', fetch: capture().fetchImpl }
    )
    assert.match(warnings[0]!, /not a log level/)
    telemetry.stopMetrics()
    await telemetry.close()
  })

  test('PIKKU_OTLP_SQL_TEXT=1 is surfaced for the Kysely plugin', () => {
    const base = { PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:1/x' }
    const off = createRuntimeTelemetry(
      base,
      options({ fetch: capture().fetchImpl })
    )
    const on = createRuntimeTelemetry(
      { ...base, PIKKU_OTLP_SQL_TEXT: '1' },
      options({ fetch: capture().fetchImpl })
    )
    assert.equal(off.recordSqlText, false)
    assert.equal(on.recordSqlText, true)
    off.stopMetrics()
    on.stopMetrics()
  })
})
