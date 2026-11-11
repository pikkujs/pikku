/**
 * Failure and abuse cases that need no server: the checks run before a request
 * is made, or the failure being tested is the transport's. The data path itself
 * is tested against a real GreptimeDB in `greptime-hardening.real.test.ts`.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  GreptimeTelemetryStore,
  TelemetryQueryError,
  TelemetryUnavailableError,
} from './greptime-store.js'
import { greptimeOptionsFromEnv } from './greptime-contributor.js'
import { startRetentionJob } from './retention.js'

const scope = { project: 'p', stage: 's' }
const SECRET = 'SECRETPW'

const counting = () => {
  const calls: string[] = []
  const fetcher = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as unknown as typeof fetch
  return { calls, fetcher }
}
const make = (fetcher: typeof fetch, extra = {}) =>
  new GreptimeTelemetryStore({
    url: 'http://127.0.0.1:1',
    fetch: fetcher,
    schemaTtlMs: 0,
    ...extra,
  })

describe('metric writes cannot change scope or reach the store own tables', () => {
  test('a point attribute that names a scope or engine column is refused, before any request', async () => {
    for (const key of [
      'pikku.project',
      'pikku.stage',
      'pikku.metric.name',
      'pikku_project',
      'pikku-stage',
      'PIKKU.PROJECT',
      'greptime_value',
      'greptime_timestamp',
      'job',
      'deployment.environment.name',
      'service.name',
      'otel_scope_name',
    ]) {
      const { calls, fetcher } = counting()
      await assert.rejects(
        make(fetcher).appendMetrics(scope, [
          { name: 'm', at: 1, value: 1, attributes: { [key]: 'victim' } },
        ]),
        TypeError,
        key
      )
      assert.equal(calls.length, 0, key)
    }
  })
  test('one bad point refuses the whole batch', async () => {
    const { calls, fetcher } = counting()
    await assert.rejects(
      make(fetcher).appendMetrics(scope, [
        { name: 'a', at: 1, value: 1 },
        { name: 'b', at: 1, value: 1, attributes: { 'pikku.project': 'x' } },
      ]),
      TypeError
    )
    assert.equal(calls.length, 0)
  })
  test('a metric named like a table the store uses is refused', async () => {
    for (const name of [
      'opentelemetry_traces',
      'opentelemetry_logs',
      'opentelemetry.traces',
      'OpenTelemetry_Anything',
      'greptime_physical_table',
      'greptime.value',
      'pikku_project_tombstones',
      'pikku.project.tombstones',
      'pikku_project_tombstones_total',
    ]) {
      const { calls, fetcher } = counting()
      await assert.rejects(
        make(fetcher).appendMetrics(scope, [{ name, at: 1, value: 1 }]),
        TypeError,
        name
      )
      assert.equal(calls.length, 0, name)
    }
  })
  test('ordinary names and attributes are not caught', async () => {
    const { calls, fetcher } = counting()
    await make(fetcher).appendMetrics(scope, [
      {
        name: 'pikku.process.cpu',
        at: 1,
        value: 1,
        attributes: { region: 'eu', 'http.route': '/x' },
      },
    ])
    assert.ok(calls.length > 0)
  })
})

describe('the address', () => {
  test('a remote http address is refused even with credentials, in the store and in the environment', () => {
    assert.throws(
      () =>
        new GreptimeTelemetryStore({
          url: 'http://db.internal:4000',
          username: 'u',
          password: 'p',
        }),
      /must be https/
    )
    assert.throws(
      () =>
        greptimeOptionsFromEnv({
          PIKKU_GREPTIME_URL: 'http://db.internal:4000',
          PIKKU_GREPTIME_USER: 'u',
          PIKKU_GREPTIME_PASSWORD: 'p',
        }),
      /must be https/
    )
    assert.equal(
      new GreptimeTelemetryStore({
        url: 'https://db.internal',
        username: 'u',
        password: 'p',
      }).database,
      'pikku'
    )
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      assert.doesNotThrow(
        () => new GreptimeTelemetryStore({ url: `http://${host}:4000` }),
        host
      )
    }
  })
  test('no error echoes the address or a password in it', () => {
    const urls = [
      `http://user:${SECRET}@`,
      `http://user:${SECRET}@db.internal:4000`,
      `https://user:${SECRET}@db.internal`,
      `ftp://user:${SECRET}@db.internal`,
      `user:${SECRET}@db.internal`,
      `${SECRET}`,
    ]
    for (const url of urls) {
      for (const attempt of [
        () => new GreptimeTelemetryStore({ url }),
        () => greptimeOptionsFromEnv({ PIKKU_GREPTIME_URL: url }),
        () =>
          greptimeOptionsFromEnv({
            PIKKU_GREPTIME_URL: url,
            PIKKU_GREPTIME_USER: 'u',
            PIKKU_GREPTIME_PASSWORD: 'p',
          }),
      ]) {
        try {
          attempt()
          assert.fail(`${url} was accepted`)
        } catch (error) {
          const text = `${(error as Error).message}\n${(error as Error).stack}`
          assert.ok(!text.includes(SECRET), `${url}: ${text}`)
          assert.ok(!text.includes('db.internal:4000/'), url)
        }
      }
    }
  })
  test('credentials in the url are refused, not silently dropped', () => {
    assert.throws(
      () => new GreptimeTelemetryStore({ url: 'https://u:p@db.internal' }),
      /credentials/
    )
  })
  test('a transport error does not carry the password either', async () => {
    const failing = (async () => {
      throw new Error('connect failed')
    }) as unknown as typeof fetch
    await assert.rejects(
      make(failing, { username: 'user', password: SECRET }).logs(scope, {}),
      (error: unknown) => {
        const text = `${(error as Error).message}${(error as Error).stack}`
        assert.ok(!text.includes(SECRET))
        return error instanceof TelemetryUnavailableError
      }
    )
  })
})

describe('transport hardening', () => {
  test('redirects are not followed', async () => {
    let seen: RequestInit | undefined
    const spy = (async (_url: string, init: RequestInit) => {
      seen = init
      return new Response('{}')
    }) as unknown as typeof fetch
    await make(spy).ping()
    assert.equal(seen?.redirect, 'error')
  })
  test('a declared body over the cap is refused without reading it', async () => {
    let cancelled = false
    const big = (async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
        { headers: { 'content-length': '1000' } }
      )) as unknown as typeof fetch
    await assert.rejects(
      make(big, { maxResponseBytes: 100 }).ping(),
      (error: unknown) =>
        error instanceof TelemetryQueryError &&
        /more than 100/.test(error.message)
    )
    assert.equal(cancelled, true)
  })
  test('a body that grows past the cap without declaring it is cut off', async () => {
    let cancelled = false
    const chunk = new TextEncoder().encode('x'.repeat(40))
    const endless = (async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk)
          },
          cancel() {
            cancelled = true
          },
        })
      )) as unknown as typeof fetch
    await assert.rejects(
      make(endless, { maxResponseBytes: 100 }).ping(),
      TelemetryQueryError
    )
    assert.equal(cancelled, true)
  })
  test('a body under the cap is read whole', async () => {
    const ok = (async () =>
      new Response(
        JSON.stringify({
          output: [{ records: { schema: { column_schemas: [] }, rows: [] } }],
        })
      )) as unknown as typeof fetch
    await make(ok, { maxResponseBytes: 10_000 }).ping()
  })
  test('the timeout is a whole number of milliseconds from 1 to 120000', () => {
    for (const timeoutMs of [0, -1, 1.5, Number.NaN, Infinity, 120_001]) {
      assert.throws(
        () =>
          new GreptimeTelemetryStore({ url: 'http://127.0.0.1:1', timeoutMs }),
        TypeError,
        String(timeoutMs)
      )
    }
    for (const value of ['0', '-5', '1.5', 'abc', '1e3', '999999999', ' 5']) {
      assert.throws(
        () =>
          greptimeOptionsFromEnv({
            PIKKU_GREPTIME_URL: 'http://127.0.0.1:1',
            PIKKU_GREPTIME_TIMEOUT_MS: value,
          }),
        /PIKKU_GREPTIME_TIMEOUT_MS/,
        value
      )
    }
    assert.equal(
      greptimeOptionsFromEnv({
        PIKKU_GREPTIME_URL: 'http://127.0.0.1:1',
        PIKKU_GREPTIME_TIMEOUT_MS: '2500',
      }).timeoutMs,
      2500
    )
  })
  test('a metrics call that matches too many tables is refused, not partly answered', async () => {
    const tables = Array.from({ length: 5 }, (_, i) => `m_${i}`)
    const rows = tables.flatMap((table) => [
      [table, 'greptime_value', 'double'],
      [table, 'greptime_timestamp', 'timestamp'],
      [table, 'deployment_environment_name', 'string'],
    ])
    const server = (async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              records: {
                schema: {
                  column_schemas: [
                    { name: 'table_name' },
                    { name: 'column_name' },
                    { name: 'data_type' },
                  ],
                },
                rows,
              },
            },
          ],
        })
      )) as unknown as typeof fetch
    await assert.rejects(
      make(server, { maxMetricTables: 3 }).metrics(scope, { since: 0 }),
      (error: unknown) =>
        error instanceof TelemetryQueryError && /5 tables/.test(error.message)
    )
  })
})

describe('the tombstone table', () => {
  const schemaRows = (withTombstones: boolean) => [
    ['opentelemetry_logs', 'body', 'string'],
    ...(withTombstones
      ? [['pikku_project_tombstones', 'project', 'string']]
      : []),
  ]
  const answer = (rows: unknown[][]) =>
    new Response(
      JSON.stringify({
        output: [
          {
            records: {
              schema: {
                column_schemas: [
                  { name: 'table_name' },
                  { name: 'column_name' },
                  { name: 'data_type' },
                ],
              },
              rows,
            },
          },
        ],
      })
    )
  test('when it cannot be read, reads fail loudly and writes and retention still run', async () => {
    const seen: string[] = []
    const server = (async (
      url: string,
      init: { body?: URLSearchParams | Uint8Array }
    ) => {
      const text =
        init.body instanceof URLSearchParams ? (init.body.get('sql') ?? '') : ''
      seen.push(text || url)
      if (text.includes('FROM pikku_project_tombstones')) {
        return new Response(
          JSON.stringify({ code: 1004, error: 'bad column' }),
          { status: 400 }
        )
      }
      if (text.includes('information_schema.columns'))
        return answer(schemaRows(true))
      return new Response('{}')
    }) as unknown as typeof fetch
    const store = make(server)
    for (const read of [
      () => store.logs(scope, {}),
      () => store.failures(scope, { since: 0 }),
      () => store.trace(scope, 'abc'),
      () => store.metrics(scope, { since: 0 }),
    ]) {
      await assert.rejects(
        read(),
        (error: unknown) =>
          error instanceof TelemetryQueryError &&
          /pikku_project_tombstones cannot be read/.test(error.message)
      )
    }
    await store.appendLogs(scope, [
      { at: 1, severity: 'info', body: 'x', source: 'app' },
    ])
    await store.compact()
    await store.deleteProject('p')
  })
})

describe('the retention job while GreptimeDB is down', () => {
  test('a failed pass is reported, the job keeps running, and it stops cleanly', async () => {
    const dead = new GreptimeTelemetryStore({
      url: 'http://127.0.0.1:1',
      timeoutMs: 500,
    })
    const warnings: string[] = []
    const outcomes: unknown[] = []
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const stop = startRetentionJob(dead, {
      days: 14,
      firstRunMs: 10,
      intervalMs: 30,
      warn: (message) => warnings.push(message),
      onRun: (outcome) => outcomes.push(outcome),
    })
    const until = Date.now() + 5000
    while (outcomes.length < 3 && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    stop()
    const after = outcomes.length
    await new Promise((resolve) => setTimeout(resolve, 200))
    process.off('unhandledRejection', onUnhandled)
    assert.ok(after >= 3, `only ${after} passes`)
    assert.ok(outcomes.every((o) => o instanceof TelemetryUnavailableError))
    assert.ok(warnings.every((w) => /retention failed/.test(w)))
    assert.ok(outcomes.length <= after + 1, 'it kept running after stop')
    assert.deepEqual(unhandled, [])
  })
})
