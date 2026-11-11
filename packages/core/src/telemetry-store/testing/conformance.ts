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
          spans: [
            span({
              id: '1',
              traceId: trace,
              status: 'error',
              statusMessage: 'boom',
              attributes: fn('f'),
            }),
            span({
              id: '2',
              attributes: { ...fn('q', 'queue'), 'pikku.queue.name': 'mail' },
            }),
          ],
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
      test('groups error root spans and names a sample trace', async () => {
        const s = freshScope()
        const t = (c: string) => c.repeat(32)
        await ingest(s, {
          spans: [
            span({
              id: '1',
              traceId: t('1'),
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
              startAt: NOW - 2 * MIN,
              attributes: fn('getUser'),
            }),
            span({
              id: '3',
              traceId: t('3'),
              status: 'error',
              statusMessage: 'bad input',
              startAt: NOW - 3 * MIN,
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
        const rows = await store.failures(s, { since: NOW - 10 * MIN })
        assert.deepEqual(rows, [
          {
            functionId: 'getUser',
            wireType: 'http',
            message: 'db down',
            count: 2,
            last: NOW - 2 * MIN,
            sampleTraceId: t('2'),
          },
          {
            functionId: 'saveUser',
            wireType: 'http',
            message: 'bad input',
            count: 1,
            last: NOW - 3 * MIN,
            sampleTraceId: t('3'),
          },
        ])
        const one = await store.failures(s, { since: NOW - 10 * MIN, limit: 1 })
        assert.equal(one.length, 1)
        assert.deepEqual(await store.failures(s, { since: NOW }), [])
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

      test('summarises root spans: totals, traffic and per-function rows', async () => {
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
          { at: since + 5 * MIN, requests: 1, errors: 0, avgMs: 50, maxMs: 50 },
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
      })

      test('an empty window summarises to nulls, not zeros or NaN', async () => {
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
      })
    })

    describe('trace', () => {
      test('returns every span of the trace, oldest first, and no other', async () => {
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
            span({ id: '1', traceId: trace, name: 'root', startAt: NOW - MIN }),
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
      })
    })

    describe('queueJobs', () => {
      test('counts outcomes per queue and lists recent runs newest first', async () => {
        const s = freshScope()
        const job = (
          id: string,
          queue: string,
          at: number,
          status: 'ok' | 'error' = 'ok',
          ms = 5
        ) =>
          span({
            id,
            traceId: id.repeat(32).slice(0, 32),
            startAt: at,
            durationMs: ms,
            status,
            statusMessage: status === 'error' ? 'smtp refused' : undefined,
            attributes: { ...fn('send', 'queue'), 'pikku.queue.name': queue },
          })
        await ingest(s, {
          spans: [
            job('1', 'mail', NOW - 5 * MIN),
            job('2', 'mail', NOW - 3 * MIN, 'error', 7),
            job('3', 'mail', NOW - 4 * MIN),
            job('4', 'resize', NOW - 9 * MIN),
            // Not a queue job: an http root span.
            span({ id: '5', attributes: fn('getUser') }),
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
      })
    })

    describe('tail cursor', () => {
      const lines = (from: number, n: number) =>
        Array.from({ length: n }, (_, i) =>
          // Every record shares one timestamp: a cursor on time alone loses some.
          log({ at: NOW - MIN, body: `line ${from + i}` })
        )

      test('walks every record exactly once, in order, in pages', async () => {
        const s = freshScope()
        await ingest(s, { logs: lines(0, 7) })
        const seen: string[] = []
        let cursor: string | null = null
        for (let guard = 0; guard < 10; guard++) {
          const page: Awaited<ReturnType<typeof store.tail>> = await store.tail(
            s,
            cursor,
            { limit: 3 }
          )
          seen.push(...page.records.map((r) => r.body))
          if (!page.records.length) break
          cursor = page.cursor
        }
        assert.deepEqual(
          seen,
          Array.from({ length: 7 }, (_, i) => `line ${i}`)
        )
      })

      test('with nothing new the same cursor comes back, and new records follow it', async () => {
        const s = freshScope()
        await ingest(s, { logs: lines(0, 2) })
        const first = await store.tail(s, null, {})
        assert.equal(first.records.length, 2)
        const idle = await store.tail(s, first.cursor, {})
        assert.deepEqual(idle.records, [])
        assert.equal(idle.cursor, first.cursor)
        await ingest(s, { logs: lines(2, 1) })
        const next = await store.tail(s, idle.cursor, {})
        assert.deepEqual(
          next.records.map((r) => r.body),
          ['line 2']
        )
      })

      test('an empty scope tails to nothing and later records appear', async () => {
        const s = freshScope()
        const empty = await store.tail(s, null, {})
        assert.deepEqual(empty.records, [])
        await ingest(s, { logs: lines(0, 1) })
        const after = await store.tail(s, empty.cursor, {})
        assert.equal(after.records.length, 1)
      })

      test("a cursor from one scope never leaks another scope's records", async () => {
        const a = freshScope()
        const b = { ...a, stage: 'develop' }
        await ingest(a, { logs: lines(0, 1) })
        await ingest(b, { logs: [log({ body: 'in b' })] })
        const fromA = await store.tail(a, null, {})
        const fromB = await store.tail(b, fromA.cursor, {})
        assert.ok(fromB.records.every((r) => r.body === 'in b'))
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
