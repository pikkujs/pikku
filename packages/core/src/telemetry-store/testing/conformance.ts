import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type {
  LogRecord,
  MetricPoint,
  Severity,
  SpanRecord,
  TelemetryScope,
  TelemetryStore,
} from '../telemetry-store.types.js'

/** Seeds records through whichever path the engine under test owns. */
export type TelemetryIngest = (
  scope: TelemetryScope,
  data: {
    logs?: LogRecord[]
    spans?: SpanRecord[]
    metrics?: MetricPoint[]
  }
) => Promise<void>

export type ConformanceOptions = {
  /**
   * How to put records in. Omit it for a store with a write half: the suite
   * uses `appendLogs`, `appendSpans` and `appendMetrics`. A read-only store
   * (the cloud's, over an ingest path it does not own) must pass it.
   */
  ingest?: TelemetryIngest
  /**
   * Whether the store keeps a span tree. Default true. Pass false for a store
   * that only holds logs and metrics: the suite then skips every test derived
   * from spans (`failures`, `metricsSummary`, `trace`, `queueJobs`) and never
   * ingests a span. It does not fake spans for such a store.
   */
  spans?: boolean
}

const NOW = Date.now()
const MIN = 60_000

let counter = 0
/** A scope no other test (or earlier run, on a shared store) has written to. */
const freshScope = (stage = 'production'): TelemetryScope => ({
  project: `conf-${NOW.toString(36)}-${++counter}`,
  stage,
})

const log = (over: Partial<LogRecord> = {}): LogRecord => ({
  at: NOW - MIN,
  severity: 'info',
  body: 'hello',
  source: 'app',
  ...over,
})

const span = (over: Partial<SpanRecord> & { id: string }): SpanRecord => {
  const { id, ...rest } = over
  return {
    traceId: 'a'.repeat(32),
    spanId: id.padStart(16, '0'),
    name: 'fn',
    kind: 'server',
    startAt: NOW - MIN,
    endAt: NOW - MIN + 10,
    durationMs: 10,
    status: 'ok',
    attributes: {},
    ...rest,
  }
}

const fn = (functionId: string, wireType = 'http') => ({
  'pikku.function.id': functionId,
  'pikku.wire.type': wireType,
})

/**
 * Proves a `TelemetryStore` does what the Studio screens assume of it. Call it
 * from a test file; it registers a `describe` block with `node:test`.
 *
 * Every test writes to a scope of its own, so a store shared with earlier runs
 * (a real database) does not need to be empty.
 */
export const conformance = (
  store: TelemetryStore,
  options: ConformanceOptions = {}
): void => {
  const withSpans = options.spans !== false
  const spanTest = { skip: !withSpans }
  const ingest: TelemetryIngest =
    options.ingest ??
    (async (scope, data) => {
      if (data.logs?.length) await store.appendLogs!(scope, data.logs)
      if (data.spans?.length) await store.appendSpans!(scope, data.spans)
      if (data.metrics?.length) await store.appendMetrics!(scope, data.metrics)
    })

  describe('TelemetryStore conformance', () => {
    test('has a way to ingest', () => {
      assert.ok(
        options.ingest ||
          ('appendLogs' in store &&
            'appendSpans' in store &&
            'appendMetrics' in store),
        'a store without a write half must be given options.ingest'
      )
    })

    describe('scope isolation', () => {
      test('another stage of the same project sees nothing', async () => {
        const mine = freshScope('production')
        const other = { ...mine, stage: 'develop' }
        const trace = 'b'.repeat(32)
        await ingest(mine, {
          logs: [log({ body: 'only here', traceId: trace })],
          spans: withSpans
            ? [
                span({
                  id: '1',
                  traceId: trace,
                  status: 'error',
                  statusMessage: 'boom',
                  attributes: fn('f'),
                }),
                span({
                  id: '2',
                  attributes: {
                    ...fn('q', 'queue'),
                    'pikku.queue.name': 'mail',
                  },
                }),
              ]
            : [],
          metrics: [{ at: NOW - MIN, name: 'pikku.m', value: 1 }],
        })
        const since = NOW - 10 * MIN
        assert.equal((await store.logs(mine, {})).length, 1)
        assert.deepEqual(await store.logs(other, {}), [])
        assert.equal(
          Object.values((await store.logFacets(other, {})).severities).reduce(
            (a, b) => a + b,
            0
          ),
          0
        )
        assert.deepEqual(await store.failures(other, { since }), [])
        assert.deepEqual(await store.metrics(other, { since }), [])
        assert.equal(
          (await store.metricsSummary(other, { since, until: NOW })).totals
            .requests,
          0
        )
        assert.deepEqual(await store.trace(other, trace), [])
        assert.deepEqual(await store.queueJobs(other, { since }), [])
        const tail = await store.tail(other, null, {})
        assert.deepEqual(tail.records, [])
      })

      test('another project with the same stage name sees nothing', async () => {
        const mine = freshScope()
        const other = { project: `${mine.project}-other`, stage: mine.stage }
        await ingest(mine, { logs: [log()] })
        assert.deepEqual(await store.logs(other, {}), [])
        assert.equal((await store.logs(mine, {})).length, 1)
      })

      test('a scope without a project or a stage is refused', async () => {
        await assert.rejects(
          store.logs({ project: '', stage: 'production' }, {})
        )
        await assert.rejects(store.logs({ project: 'p', stage: '' }, {}))
      })
    })

    describe('logs', () => {
      const scope = freshScope()
      const severities: Severity[] = ['debug', 'info', 'warn', 'error']
      const records = (): LogRecord[] =>
        severities.map((severity, i) =>
          log({
            at: NOW - (10 - i) * MIN,
            severity,
            body: `Line ${i} ${severity === 'error' ? 'Exploded' : 'fine'}`,
            traceId: i === 3 ? 'c'.repeat(32) : undefined,
            functionId: i % 2 ? 'sendMail' : 'getUser',
            wireType: 'http',
            wireId: i % 2 ? 'POST:/mail' : 'GET:/user',
            source: i === 0 ? 'dev' : 'app',
          })
        )

      test('returns newest first and honours limit', async () => {
        await ingest(scope, { logs: records() })
        const all = await store.logs(scope, {})
        assert.deepEqual(
          all.map((r) => r.severity),
          ['error', 'warn', 'info', 'debug']
        )
        const two = await store.logs(scope, { limit: 2 })
        assert.deepEqual(
          two.map((r) => r.severity),
          ['error', 'warn']
        )
      })

      test('returns at most 100 records by default', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: Array.from({ length: 101 }, (_, i) =>
            log({ at: NOW - 200 * 1000 + i * 1000, body: `n${i}` })
          ),
        })
        const got = await store.logs(s, {})
        assert.equal(got.length, 100)
        assert.equal(got[0]!.body, 'n100')
      })

      test('since is inclusive and until is exclusive', async () => {
        const [, second, third] = records()
        const got = await store.logs(scope, {
          since: second!.at,
          until: third!.at,
        })
        assert.deepEqual(
          got.map((r) => r.body),
          [second!.body]
        )
      })

      test('filters by severity, search, trace, function, wire and source', async () => {
        const body = async (q: Parameters<typeof store.logs>[1]) =>
          (await store.logs(scope, q)).map((r) => r.severity)
        assert.deepEqual(await body({ severity: 'warn' }), ['warn'])
        assert.deepEqual(await body({ search: 'EXPLODED' }), ['error'])
        assert.deepEqual(await body({ traceId: 'c'.repeat(32) }), ['error'])
        assert.deepEqual(await body({ functionId: 'getUser' }), [
          'warn',
          'debug',
        ])
        assert.deepEqual(await body({ wireId: 'POST:/mail' }), [
          'error',
          'info',
        ])
        assert.deepEqual(await body({ source: 'dev' }), ['debug'])
        assert.deepEqual(await body({ wireType: 'http', severity: 'info' }), [
          'info',
        ])
        assert.deepEqual(await body({ search: 'no such text' }), [])
      })

      test('search treats the term as text, not a pattern', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: [log({ body: "it's 100% done_" }), log({ body: 'unrelated' })],
        })
        const got = await store.logs(s, { search: "'s 100% done_" })
        assert.equal(got.length, 1)
        assert.equal((await store.logs(s, { search: '%' })).length, 1)
        assert.equal((await store.logs(s, { search: '_' })).length, 1)
      })

      test('facets count severities and list functions and wires', async () => {
        const facets = await store.logFacets(scope, {})
        assert.deepEqual(facets.severities, {
          trace: 0,
          debug: 1,
          info: 1,
          warn: 1,
          error: 1,
          fatal: 0,
        })
        assert.deepEqual(facets.functions, ['getUser', 'sendMail'])
        assert.deepEqual(facets.wires, ['GET:/user', 'POST:/mail'])
        const recent = await store.logFacets(scope, { since: NOW - 8 * MIN })
        assert.equal(recent.severities.debug, 0)
        assert.equal(recent.severities.warn, 1)
      })

      test('returns rows the caller cannot use to change the store', async () => {
        const [first] = await store.logs(scope, { limit: 1 })
        first!.body = 'tampered'
        const [again] = await store.logs(scope, { limit: 1 })
        assert.notEqual(again!.body, 'tampered')
      })
    })

    describe('failures', () => {
      const t = (c: string) => c.repeat(32)

      test(
        'groups error root spans, orders by count, names the latest trace',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            spans: [
              // getUser fails twice. The older failure has the lexicographically
              // larger trace id, so "max trace id" is not "latest trace".
              span({
                id: '1',
                traceId: t('f'),
                status: 'error',
                statusMessage: 'db down',
                startAt: NOW - 5 * MIN,
                attributes: fn('getUser'),
              }),
              span({
                id: '2',
                traceId: t('2'),
                status: 'error',
                statusMessage: 'db down',
                startAt: NOW - 3 * MIN,
                attributes: fn('getUser'),
              }),
              // saveUser fails once, and most recently: count order, not recency.
              span({
                id: '3',
                traceId: t('3'),
                status: 'error',
                statusMessage: 'bad input',
                startAt: NOW - 1 * MIN,
                attributes: fn('saveUser'),
              }),
              // Not counted: a child span, an ok span, and one before `since`.
              span({
                id: '4',
                traceId: t('2'),
                parentSpanId: '2'.padStart(16, '0'),
                status: 'error',
                statusMessage: 'db down',
                attributes: fn('getUser'),
              }),
              span({ id: '5', traceId: t('5'), attributes: fn('getUser') }),
              span({
                id: '6',
                traceId: t('6'),
                status: 'error',
                statusMessage: 'old',
                startAt: NOW - 60 * MIN,
                attributes: fn('getUser'),
              }),
            ],
          })
          const rows = (await store.failures(s, { since: NOW - 10 * MIN })).map(
            ({ firstSeen, httpPath, httpMethod, httpStatus, ...base }) => base
          )
          assert.deepEqual(rows, [
            {
              functionId: 'getUser',
              wireType: 'http',
              message: 'db down',
              count: 2,
              last: NOW - 3 * MIN,
              sampleTraceId: t('2'),
            },
            {
              functionId: 'saveUser',
              wireType: 'http',
              message: 'bad input',
              count: 1,
              last: NOW - 1 * MIN,
              sampleTraceId: t('3'),
            },
          ])
          const one = await store.failures(s, {
            since: NOW - 10 * MIN,
            limit: 1,
          })
          assert.equal(one.length, 1)
          assert.deepEqual(await store.failures(s, { since: NOW }), [])
        }
      )

      test(
        'groups with equal counts put the more recent first',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            spans: [
              span({
                id: '1',
                traceId: t('1'),
                status: 'error',
                statusMessage: 'old',
                startAt: NOW - 5 * MIN,
                attributes: fn('older'),
              }),
              span({
                id: '2',
                traceId: t('2'),
                status: 'error',
                statusMessage: 'new',
                startAt: NOW - 1 * MIN,
                attributes: fn('newer'),
              }),
            ],
          })
          const rows = await store.failures(s, { since: NOW - 10 * MIN })
          assert.deepEqual(
            rows.map((r) => r.functionId),
            ['newer', 'older']
          )
        }
      )

      test('returns at most 50 groups by default', spanTest, async () => {
        const s = freshScope()
        await ingest(s, {
          spans: Array.from({ length: 51 }, (_, i) =>
            span({
              id: String(i + 1),
              traceId: String(i + 1).padStart(32, '0'),
              status: 'error',
              statusMessage: 'x',
              attributes: fn(`fn${i}`),
            })
          ),
        })
        const rows = await store.failures(s, { since: NOW - 10 * MIN })
        assert.equal(rows.length, 50)
      })
    })

    describe('metrics', () => {
      test('returns one metric oldest first, by prefix, within a window', async () => {
        const s = freshScope()
        await ingest(s, {
          metrics: [
            { at: NOW - 1 * MIN, name: 'pikku.process.cpu', value: 3 },
            { at: NOW - 3 * MIN, name: 'pikku.process.cpu', value: 1 },
            { at: NOW - 2 * MIN, name: 'pikku.process.cpu', value: 2 },
            { at: NOW - 2 * MIN, name: 'pikku.process.mem', value: 9 },
            { at: NOW - 2 * MIN, name: 'other', value: 7 },
          ],
        })
        const since = NOW - 10 * MIN
        const cpu = await store.metrics(s, { name: 'pikku.process.cpu', since })
        assert.deepEqual(
          cpu.map((p) => p.value),
          [1, 2, 3]
        )
        const prefixed = await store.metrics(s, {
          name: 'pikku.process.*',
          since,
        })
        assert.equal(prefixed.length, 4)
        assert.equal((await store.metrics(s, { since })).length, 5)
        const windowed = await store.metrics(s, {
          name: 'pikku.process.cpu',
          since: NOW - 3 * MIN + 1,
          until: NOW - 1 * MIN,
        })
        assert.deepEqual(
          windowed.map((p) => p.value),
          [2]
        )
        const newest = await store.metrics(s, {
          name: 'pikku.process.cpu',
          since,
          limit: 2,
        })
        assert.deepEqual(
          newest.map((p) => p.value),
          [2, 3]
        )
      })

      test(
        'summarises root spans: totals, traffic and per-function rows',
        spanTest,
        async () => {
          const s = freshScope()
          const since = NOW - 10 * MIN
          const slow = (
            id: string,
            startAt: number,
            ms: number,
            fnId: string,
            status: 'ok' | 'error' = 'ok'
          ) =>
            span({
              id,
              traceId: id.repeat(32).slice(0, 32),
              startAt,
              endAt: startAt + ms,
              durationMs: ms,
              status,
              attributes: fn(fnId),
            })
          await ingest(s, {
            spans: [
              slow('1', since + 1 * MIN, 10, 'a'),
              slow('2', since + 1 * MIN + 1, 30, 'a', 'error'),
              slow('3', since + 8 * MIN, 50, 'b'),
              // Excluded: a child, and one outside the window.
              span({
                id: '4',
                parentSpanId: '1'.padStart(16, '0'),
                startAt: since + 1 * MIN,
                durationMs: 999,
              }),
              slow('5', since - MIN, 999, 'a'),
            ],
          })
          const sum = await store.metricsSummary(s, {
            since,
            until: NOW,
            buckets: 2,
          })
          assert.deepEqual(sum.totals, {
            requests: 3,
            errors: 1,
            avgMs: 30,
            maxMs: 50,
          })
          assert.deepEqual(sum.traffic, [
            { at: since, requests: 2, errors: 1, avgMs: 20, maxMs: 30 },
            {
              at: since + 5 * MIN,
              requests: 1,
              errors: 0,
              avgMs: 50,
              maxMs: 50,
            },
          ])
          assert.deepEqual(sum.functions, [
            {
              name: 'a',
              wire: 'http',
              requests: 2,
              errors: 1,
              avgMs: 20,
              lastRun: since + 1 * MIN + 1,
            },
            {
              name: 'b',
              wire: 'http',
              requests: 1,
              errors: 0,
              avgMs: 50,
              lastRun: since + 8 * MIN,
            },
          ])
        }
      )

      test('defaults to 30 buckets aligned to since', spanTest, async () => {
        const s = freshScope()
        const since = NOW - 30 * MIN
        await ingest(s, {
          spans: Array.from({ length: 60 }, (_, i) =>
            span({
              id: String(i + 1),
              traceId: String(i + 1).padStart(32, '0'),
              startAt: since + i * 30_000,
            })
          ),
        })
        const sum = await store.metricsSummary(s, { since, until: NOW })
        assert.equal(sum.traffic.length, 30)
        assert.deepEqual(
          sum.traffic.map((b) => b.at),
          Array.from({ length: 30 }, (_, i) => since + i * MIN)
        )
        assert.ok(sum.traffic.every((b) => b.requests === 2))
      })

      test(
        'bucket width rounds up when the range does not divide',
        spanTest,
        async () => {
          const s = freshScope()
          const since = NOW - 1000
          // 100 ms over 30 buckets: width is ceil(3.33) = 4, not 3.
          await ingest(s, {
            spans: [0, 4, 99].map((offset, i) =>
              span({
                id: String(i + 1),
                traceId: String(i + 1).padStart(32, '0'),
                startAt: since + offset,
              })
            ),
          })
          const sum = await store.metricsSummary(s, {
            since,
            until: since + 100,
            buckets: 30,
          })
          assert.deepEqual(
            sum.traffic.map((b) => b.at),
            [since, since + 4, since + 96]
          )
        }
      )

      test(
        'an empty window summarises to nulls, not zeros or NaN',
        spanTest,
        async () => {
          const s = freshScope()
          const sum = await store.metricsSummary(s, {
            since: NOW - 10 * MIN,
            until: NOW,
          })
          assert.deepEqual(sum, {
            totals: { requests: 0, errors: 0, avgMs: null, maxMs: null },
            traffic: [],
            functions: [],
          })
        }
      )
    })

    describe('trace', () => {
      test(
        'returns every span of the trace, oldest first, and no other',
        spanTest,
        async () => {
          const s = freshScope()
          const trace = 'd'.repeat(32)
          await ingest(s, {
            spans: [
              span({
                id: '2',
                traceId: trace,
                parentSpanId: '1'.padStart(16, '0'),
                name: 'child',
                startAt: NOW - MIN + 5,
              }),
              span({
                id: '1',
                traceId: trace,
                name: 'root',
                startAt: NOW - MIN,
              }),
              span({ id: '3', traceId: 'e'.repeat(32), name: 'elsewhere' }),
            ],
          })
          const spans = await store.trace(s, trace)
          assert.deepEqual(
            spans.map((x) => x.name),
            ['root', 'child']
          )
          assert.equal(spans[1]!.parentSpanId, '1'.padStart(16, '0'))
          assert.equal(spans[0]!.parentSpanId, undefined)
          assert.deepEqual(await store.trace(s, 'f'.repeat(32)), [])
        }
      )

      test(
        'spans with the same start time order by span id',
        spanTest,
        async () => {
          const s = freshScope()
          const trace = '9'.repeat(32)
          await ingest(s, {
            spans: ['3', '1', '2'].map((id) =>
              span({ id, traceId: trace, name: `s${id}`, startAt: NOW - MIN })
            ),
          })
          assert.deepEqual(
            (await store.trace(s, trace)).map((x) => x.name),
            ['s1', 's2', 's3']
          )
        }
      )
    })

    describe('queueJobs', () => {
      const job = (
        id: string,
        queue: string,
        at: number,
        status: 'ok' | 'error' = 'ok',
        ms = 5,
        parentSpanId?: string
      ) =>
        span({
          id,
          traceId: id.padStart(32, '0'),
          parentSpanId,
          startAt: at,
          durationMs: ms,
          status,
          statusMessage: status === 'error' ? 'smtp refused' : undefined,
          attributes: { ...fn('send', 'queue'), 'pikku.queue.name': queue },
        })

      test(
        'counts outcomes per queue and lists queues most recently run first',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            // Inserted oldest queue first: recency order is not insertion order.
            spans: [
              job('4', 'resize', NOW - 9 * MIN),
              job('1', 'mail', NOW - 5 * MIN),
              job('2', 'mail', NOW - 3 * MIN, 'error', 7),
              job('3', 'mail', NOW - 4 * MIN),
              // Not queue jobs: an http root span, and a queue-typed child span.
              span({ id: '5', attributes: fn('getUser') }),
              job('6', 'ghost', NOW - 1 * MIN, 'ok', 5, '1'.padStart(16, '0')),
            ],
          })
          const rows = await store.queueJobs(s, { since: NOW - 20 * MIN })
          assert.deepEqual(
            rows.map((r) => [r.queue, r.completed, r.failed, r.lastRun]),
            [
              ['mail', 2, 1, NOW - 3 * MIN],
              ['resize', 1, 0, NOW - 9 * MIN],
            ]
          )
          assert.deepEqual(rows[0]!.recent, [
            {
              at: NOW - 3 * MIN,
              outcome: 'failed',
              durationMs: 7,
              error: 'smtp refused',
            },
            {
              at: NOW - 4 * MIN,
              outcome: 'completed',
              durationMs: 5,
              error: null,
            },
            {
              at: NOW - 5 * MIN,
              outcome: 'completed',
              durationMs: 5,
              error: null,
            },
          ])
          const recentOnly = await store.queueJobs(s, { since: NOW - 6 * MIN })
          assert.deepEqual(
            recentOnly.map((r) => r.queue),
            ['mail']
          )
        }
      )

      test(
        'recent keeps the newest 10 of a busier queue',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            spans: Array.from({ length: 12 }, (_, i) =>
              job(String(i + 1), 'mail', NOW - (20 - i) * MIN)
            ),
          })
          const [row] = await store.queueJobs(s, { since: NOW - 60 * MIN })
          assert.equal(row!.completed, 12)
          assert.equal(row!.recent.length, 10)
          assert.equal(row!.recent[0]!.at, NOW - 9 * MIN)
          assert.equal(row!.recent[9]!.at, NOW - 18 * MIN)
        }
      )

      test('returns at most 50 queues by default', spanTest, async () => {
        const s = freshScope()
        await ingest(s, {
          spans: Array.from({ length: 51 }, (_, i) =>
            job(String(i + 1), `q${i}`, NOW - MIN)
          ),
        })
        const rows = await store.queueJobs(s, { since: NOW - 10 * MIN })
        assert.equal(rows.length, 50)
      })
    })

    describe('tenant, duration and per-function views', () => {
      const org = (id: string, user?: string) => ({
        'pikku.org.id': id,
        ...(user ? { 'pikku.user.id': user } : {}),
      })

      test(
        'a log line carries the duration of its request root span',
        spanTest,
        async () => {
          const s = freshScope()
          const traceId = 'd'.repeat(32)
          await ingest(s, {
            spans: [
              span({
                id: '1',
                traceId,
                durationMs: 42,
                attributes: fn('getUser'),
              }),
              span({
                id: '2',
                traceId,
                parentSpanId: '1'.padStart(16, '0'),
                durationMs: 5,
              }),
            ],
            logs: [
              log({ traceId, body: 'in request' }),
              log({ body: 'no trace', at: NOW - 2 * MIN }),
            ],
          })
          const rows = await store.logs(s, {})
          assert.equal(
            rows.find((r) => r.body === 'in request')!.durationMs,
            42
          )
          assert.equal(
            rows.find((r) => r.body === 'no trace')!.durationMs,
            undefined
          )
        }
      )

      test('logs filter by tenant and a tenant nobody has returns nothing', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: [
            log({ body: 'a', attributes: org('acme', 'u1') }),
            log({
              body: 'b',
              attributes: org('acme', 'u2'),
              at: NOW - 2 * MIN,
            }),
            log({ body: 'c', attributes: org('other'), at: NOW - 3 * MIN }),
            log({ body: 'd', at: NOW - 4 * MIN }),
          ],
        })
        const bodies = async (tenant: { org?: string; user?: string }) =>
          (await store.logs(s, { tenant })).map((r) => r.body)
        assert.deepEqual(await bodies({ org: 'acme' }), ['a', 'b'])
        assert.deepEqual(await bodies({ org: 'acme', user: 'u2' }), ['b'])
        assert.deepEqual(await bodies({ org: 'nobody' }), [])
        assert.deepEqual(await bodies({ user: "u1' OR '1'='1" }), [])
      })

      test('span reads filter by tenant', spanTest, async () => {
        const s = freshScope()
        const traceA = 'e'.repeat(32)
        const traceB = 'f'.repeat(32)
        await ingest(s, {
          spans: [
            span({
              id: '1',
              traceId: traceA,
              attributes: { ...fn('a'), ...org('acme') },
            }),
            span({
              id: '2',
              traceId: traceA,
              parentSpanId: '1'.padStart(16, '0'),
            }),
            span({
              id: '3',
              traceId: traceB,
              attributes: { ...fn('b'), ...org('other') },
            }),
            span({
              id: '4',
              traceId: 'c'.repeat(32),
              attributes: fn('untagged'),
            }),
          ],
        })
        const window = { since: NOW - 10 * MIN, until: NOW }
        const acme = { org: 'acme' }
        assert.deepEqual(
          (
            await store.metricsSummary(s, { ...window, tenant: acme })
          ).functions.map((f) => f.name),
          ['a']
        )
        assert.deepEqual(
          (await store.functionMetrics(s, { ...window, tenant: acme })).map(
            (f) => f.functionId
          ),
          ['a']
        )
        assert.deepEqual(
          await store.wireTypes(s, { since: window.since, tenant: acme }),
          [{ wireType: 'http', requests: 1 }]
        )
        assert.equal((await store.trace(s, traceA, { tenant: acme })).length, 2)
        assert.deepEqual(await store.trace(s, traceB, { tenant: acme }), [])
        assert.deepEqual(
          await store.trace(s, 'c'.repeat(32), { tenant: acme }),
          []
        )
        assert.deepEqual(
          (
            await store.metricsSummary(s, {
              ...window,
              tenant: { org: 'nobody' },
            })
          ).functions,
          []
        )
        const other = freshScope()
        assert.deepEqual(await store.trace(other, traceA, { tenant: acme }), [])
      })

      test('metricsSummary narrows to one function', spanTest, async () => {
        const s = freshScope()
        await ingest(s, {
          spans: [
            span({ id: '1', attributes: fn('a'), durationMs: 10 }),
            span({
              id: '2',
              traceId: 'b'.repeat(32),
              attributes: fn('b'),
              durationMs: 30,
            }),
          ],
        })
        const q = { since: NOW - 10 * MIN, until: NOW }
        const only = await store.metricsSummary(s, { ...q, functionId: 'a' })
        assert.equal(only.totals.requests, 1)
        assert.equal(only.totals.maxMs, 10)
        assert.deepEqual(
          only.functions.map((f) => f.name),
          ['a']
        )
        const none = await store.metricsSummary(s, { ...q, functionId: 'zzz' })
        assert.equal(none.totals.requests, 0)
        assert.deepEqual(none.traffic, [])
      })

      test(
        'failures carry first seen and the latest failure http details',
        spanTest,
        async () => {
          const s = freshScope()
          const bad = (
            id: string,
            at: number,
            extra: Record<string, string | number>
          ) =>
            span({
              id,
              traceId: id.repeat(32).slice(0, 32),
              startAt: at,
              status: 'error',
              statusMessage: 'boom',
              attributes: { ...fn('save'), ...extra },
            })
          await ingest(s, {
            spans: [
              bad('1', NOW - 9 * MIN, {
                'pikku.http.path': '/old',
                'pikku.http.method': 'GET',
                'http.response.status_code': 500,
              }),
              bad('2', NOW - 3 * MIN, {
                'pikku.http.path': '/new',
                'pikku.http.method': 'POST',
                'http.response.status_code': 502,
              }),
              span({
                id: '3',
                traceId: '3'.repeat(32),
                startAt: NOW - 2 * MIN,
                status: 'error',
                statusMessage: 'plain',
                attributes: fn('other'),
              }),
            ],
          })
          const rows = await store.failures(s, { since: NOW - 20 * MIN })
          const save = rows.find((r) => r.functionId === 'save')!
          assert.equal(save.firstSeen, NOW - 9 * MIN)
          assert.equal(save.last, NOW - 3 * MIN)
          assert.equal(save.httpPath, '/new')
          assert.equal(save.httpMethod, 'POST')
          assert.equal(save.httpStatus, 502)
          const other = rows.find((r) => r.functionId === 'other')!
          assert.deepEqual(
            [other.httpPath, other.httpMethod, other.httpStatus],
            [null, null, null]
          )
        }
      )

      test(
        'functionMetrics groups by function and wire with weighted average and buckets',
        spanTest,
        async () => {
          const s = freshScope()
          const since = NOW - 10 * MIN
          const until = NOW
          await ingest(s, {
            spans: [
              span({
                id: '1',
                startAt: since + 1000,
                durationMs: 10,
                attributes: fn('a'),
              }),
              span({
                id: '2',
                traceId: 'b'.repeat(32),
                startAt: since + 2000,
                durationMs: 30,
                status: 'error',
                attributes: fn('a'),
              }),
              span({
                id: '3',
                traceId: 'c'.repeat(32),
                startAt: since + 8 * MIN,
                durationMs: 20,
                attributes: fn('a'),
              }),
              span({
                id: '4',
                traceId: 'd'.repeat(32),
                startAt: since + 3 * MIN,
                durationMs: 7,
                attributes: fn('b', 'queue'),
              }),
              span({
                id: '5',
                traceId: 'a'.repeat(32),
                parentSpanId: '1'.padStart(16, '0'),
                startAt: since + 1000,
                attributes: fn('child'),
              }),
              span({
                id: '6',
                traceId: 'e'.repeat(32),
                startAt: until,
                attributes: fn('late'),
              }),
            ],
          })
          const rows = await store.functionMetrics(s, {
            since,
            until,
            buckets: 10,
          })
          assert.deepEqual(
            rows.map((r) => [
              r.functionId,
              r.wireType,
              r.requests,
              r.errors,
              r.avgMs,
              r.lastRun,
            ]),
            [
              ['a', 'http', 3, 1, 20, since + 8 * MIN],
              ['b', 'queue', 1, 0, 7, since + 3 * MIN],
            ]
          )
          assert.deepEqual(rows[0]!.buckets, [
            { at: since, requests: 2, errors: 1 },
            { at: since + 8 * MIN, requests: 1, errors: 0 },
          ])
          const defaults = await store.functionMetrics(s, { since, until })
          assert.equal(defaults[0]!.buckets.length > 0, true)
          assert.equal(
            (await store.functionMetrics(s, { since, until, limit: 1 })).length,
            1
          )
          await assert.rejects(() =>
            store.functionMetrics(s, { since, until, limit: 0 })
          )
          await assert.rejects(() =>
            store.functionMetrics(s, { since, until, buckets: 1.5 })
          )
        }
      )

      test(
        'functionMetrics returns at most 200 functions by default',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            spans: Array.from({ length: 201 }, (_, i) =>
              span({
                id: String(i + 1),
                traceId: String(i + 1).padStart(32, '0'),
                attributes: fn(`f${i}`),
              })
            ),
          })
          const rows = await store.functionMetrics(s, {
            since: NOW - 10 * MIN,
            until: NOW,
          })
          assert.equal(rows.length, 200)
        }
      )

      test(
        'wireTypes counts root spans by wire, unknown when unset',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            spans: [
              span({ id: '1', attributes: fn('a', 'http') }),
              span({
                id: '2',
                traceId: 'b'.repeat(32),
                attributes: fn('a', 'http'),
              }),
              span({
                id: '3',
                traceId: 'c'.repeat(32),
                attributes: fn('b', 'scheduler'),
              }),
              span({ id: '4', traceId: 'd'.repeat(32), attributes: {} }),
              span({
                id: '5',
                traceId: 'a'.repeat(32),
                parentSpanId: '1'.padStart(16, '0'),
                attributes: fn('x', 'rpc'),
              }),
              span({
                id: '6',
                traceId: 'e'.repeat(32),
                startAt: NOW - 30 * MIN,
                attributes: fn('old', 'cli'),
              }),
            ],
          })
          assert.deepEqual(
            await store.wireTypes(s, { since: NOW - 10 * MIN }),
            [
              { wireType: 'http', requests: 2 },
              { wireType: 'scheduler', requests: 1 },
              { wireType: 'unknown', requests: 1 },
            ]
          )
          assert.deepEqual(
            await store.wireTypes(s, {
              since: NOW - 40 * MIN,
              until: NOW - 20 * MIN,
            }),
            [{ wireType: 'cli', requests: 1 }]
          )
        }
      )

      test(
        'wireRuns lists one wire type grouped by function, newest first',
        spanTest,
        async () => {
          const s = freshScope()
          const run = (
            id: string,
            name: string,
            at: number,
            status: 'ok' | 'error' = 'ok'
          ) =>
            span({
              id,
              traceId: id.padStart(32, '0'),
              startAt: at,
              durationMs: 4,
              status,
              statusMessage: status === 'error' ? 'cron failed' : undefined,
              attributes: fn(name, 'scheduler'),
            })
          await ingest(s, {
            spans: [
              run('1', 'nightly', NOW - 10 * MIN),
              run('2', 'nightly', NOW - 4 * MIN, 'error'),
              run('3', 'hourly', NOW - 6 * MIN),
              span({
                id: '4',
                traceId: '4'.padStart(32, '0'),
                attributes: fn('http-fn', 'http'),
              }),
              span({
                id: '5',
                traceId: '1'.padStart(32, '0'),
                parentSpanId: '1'.padStart(16, '0'),
                attributes: fn('child', 'scheduler'),
              }),
            ],
          })
          const rows = await store.wireRuns(s, {
            wireType: 'scheduler',
            since: NOW - 20 * MIN,
          })
          assert.deepEqual(
            rows.map((r) => [
              r.name,
              r.wireType,
              r.completed,
              r.failed,
              r.lastRun,
            ]),
            [
              ['nightly', 'scheduler', 1, 1, NOW - 4 * MIN],
              ['hourly', 'scheduler', 1, 0, NOW - 6 * MIN],
            ]
          )
          assert.deepEqual(rows[0]!.recent[0], {
            at: NOW - 4 * MIN,
            outcome: 'failed',
            durationMs: 4,
            error: 'cron failed',
          })
          assert.deepEqual(
            await store.wireRuns(s, { wireType: "x' OR '1'='1", since: 0 }),
            []
          )
          assert.equal(
            (
              await store.wireRuns(s, {
                wireType: 'scheduler',
                since: NOW - 20 * MIN,
                limit: 1,
              })
            ).length,
            1
          )
          await assert.rejects(() =>
            store.wireRuns(s, { wireType: 'scheduler', since: 0, limit: -1 })
          )
        }
      )

      test(
        'wireRuns keeps the newest 10 and returns at most 50 functions by default',
        spanTest,
        async () => {
          const s = freshScope()
          await ingest(s, {
            spans: [
              ...Array.from({ length: 12 }, (_, i) =>
                span({
                  id: String(i + 1),
                  traceId: String(i + 1).padStart(32, '0'),
                  startAt: NOW - (30 - i) * MIN,
                  attributes: fn('busy', 'scheduler'),
                })
              ),
              ...Array.from({ length: 50 }, (_, i) =>
                span({
                  id: String(i + 100),
                  traceId: String(i + 100).padStart(32, '0'),
                  attributes: fn(`t${i}`, 'scheduler'),
                })
              ),
            ],
          })
          const rows = await store.wireRuns(s, {
            wireType: 'scheduler',
            since: NOW - 60 * MIN,
          })
          assert.equal(rows.length, 50)
          const busy = (
            await store.wireRuns(s, {
              wireType: 'scheduler',
              since: NOW - 60 * MIN,
              limit: 100,
            })
          ).find((r) => r.name === 'busy')!
          assert.equal(busy.completed, 12)
          assert.equal(busy.recent.length, 10)
        }
      )

      test('the new views never cross scopes', spanTest, async () => {
        const a = freshScope()
        const b = freshScope()
        await ingest(a, {
          spans: [span({ id: '1', attributes: fn('a', 'scheduler') })],
        })
        const q = { since: NOW - 10 * MIN, until: NOW }
        assert.deepEqual(await store.functionMetrics(b, q), [])
        assert.deepEqual(await store.wireTypes(b, { since: q.since }), [])
        assert.deepEqual(
          await store.wireRuns(b, { wireType: 'scheduler', since: q.since }),
          []
        )
      })
    })

    describe('tail cursor', () => {
      // A page-walk: every page of `limit`, until one comes back empty.
      const walk = async (s: TelemetryScope, limit: number) => {
        const seen: LogRecord[] = []
        let cursor: string | null = null
        for (let guard = 0; guard < 50; guard++) {
          const page: Awaited<ReturnType<typeof store.tail>> = await store.tail(
            s,
            cursor,
            { limit }
          )
          seen.push(...page.records)
          if (!page.records.length) break
          cursor = page.cursor
        }
        return seen
      }

      test('unique timestamps come back in timestamp order across pages', async () => {
        const s = freshScope()
        // Ingested out of order on purpose: order is by timestamp.
        const order = [3, 1, 4, 0, 2]
        await ingest(s, {
          logs: order.map((i) =>
            log({ at: NOW - (10 - i) * MIN, body: `line ${i}` })
          ),
        })
        const seen = await walk(s, 2)
        assert.deepEqual(
          seen.map((r) => r.body),
          ['line 0', 'line 1', 'line 2', 'line 3', 'line 4']
        )
      })

      test('records sharing a timestamp are each returned exactly once across pages', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: Array.from({ length: 7 }, (_, i) =>
            log({ at: NOW - MIN, body: `line ${i}` })
          ),
        })
        const seen = (await walk(s, 2)).map((r) => r.body)
        assert.equal(seen.length, 7)
        assert.deepEqual(
          [...seen].sort(),
          Array.from({ length: 7 }, (_, i) => `line ${i}`)
        )
      })

      test('limit caps a page and the cursor continues after it', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: Array.from({ length: 5 }, (_, i) =>
            log({ at: NOW - (10 - i) * MIN, body: `line ${i}` })
          ),
        })
        const first = await store.tail(s, null, { limit: 2 })
        assert.deepEqual(
          first.records.map((r) => r.body),
          ['line 0', 'line 1']
        )
        const second = await store.tail(s, first.cursor, { limit: 2 })
        assert.deepEqual(
          second.records.map((r) => r.body),
          ['line 2', 'line 3']
        )
      })

      test('returns at most 100 records by default', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: Array.from({ length: 101 }, (_, i) =>
            log({ at: NOW - 200_000 + i * 1000, body: `n${i}` })
          ),
        })
        const page = await store.tail(s, null, {})
        assert.equal(page.records.length, 100)
        const rest = await store.tail(s, page.cursor, {})
        assert.deepEqual(
          rest.records.map((r) => r.body),
          ['n100']
        )
      })

      test('null starts at the beginning', async () => {
        const s = freshScope()
        await ingest(s, {
          logs: [log({ body: 'a', at: NOW - 2 * MIN }), log({ body: 'b' })],
        })
        const page = await store.tail(s, null, {})
        assert.deepEqual(
          page.records.map((r) => r.body),
          ['a', 'b']
        )
      })

      test('with nothing new the same cursor comes back, and newer records follow it', async () => {
        const s = freshScope()
        await ingest(s, { logs: [log({ body: 'a', at: NOW - 3 * MIN })] })
        const first = await store.tail(s, null, {})
        assert.equal(first.records.length, 1)
        const idle = await store.tail(s, first.cursor, {})
        assert.deepEqual(idle.records, [])
        assert.equal(idle.cursor, first.cursor)
        await ingest(s, { logs: [log({ body: 'b', at: NOW - 2 * MIN })] })
        const next = await store.tail(s, idle.cursor, {})
        assert.deepEqual(
          next.records.map((r) => r.body),
          ['b']
        )
      })

      test('an empty scope tails to nothing and later records appear', async () => {
        const s = freshScope()
        const empty = await store.tail(s, null, {})
        assert.deepEqual(empty.records, [])
        await ingest(s, { logs: [log()] })
        const after = await store.tail(s, empty.cursor, {})
        assert.equal(after.records.length, 1)
      })

      test("a cursor from one scope never leaks another scope's records", async () => {
        const a = freshScope()
        const b = { ...a, stage: 'develop' }
        await ingest(a, { logs: [log({ body: 'in a' })] })
        await ingest(b, { logs: [log({ body: 'in b' })] })
        const fromA = await store.tail(a, null, {})
        const fromB = await store.tail(b, fromA.cursor, {})
        assert.ok(fromB.records.every((r) => r.body === 'in b'))
        assert.deepEqual(
          (await store.tail(a, null, {})).records.map((r) => r.body),
          ['in a']
        )
      })
    })

    describe('write half (when the store has one)', () => {
      test('deleteProject removes that project in every stage and no other', async () => {
        if (!store.deleteProject) return
        const a = freshScope('production')
        const aDev = { ...a, stage: 'develop' }
        const b = freshScope()
        for (const s of [a, aDev, b]) await ingest(s, { logs: [log()] })
        await store.deleteProject(a.project)
        assert.deepEqual(await store.logs(a, {}), [])
        assert.deepEqual(await store.logs(aDev, {}), [])
        assert.equal((await store.logs(b, {})).length, 1)
      })

      test('retain drops records older than the policy and keeps newer ones', async () => {
        if (!store.retain) return
        const s = freshScope()
        await ingest(s, {
          logs: [
            log({ at: NOW - 40 * 86_400_000, body: 'old' }),
            log({ at: NOW - MIN, body: 'new' }),
          ],
        })
        await store.retain({ days: 14 })
        assert.deepEqual(
          (await store.logs(s, {})).map((r) => r.body),
          ['new']
        )
      })
    })
  })
}
