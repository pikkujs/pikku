import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeLogs,
  decodeMetrics,
  decodeTraces,
} from '../testing/otlp-decoder.js'
import { OtlpHttpExporter, OTLP_QUEUE_LIMITS } from './otlp-http-exporter.js'
import type { FinishedSpan } from '../tracer.js'

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'

const span = (
  name: string,
  attributes: FinishedSpan['attributes'] = {}
): FinishedSpan => ({
  traceId: TRACE,
  spanId: '00f067aa0ba902b7',
  name,
  kind: 'internal',
  startTimeUnixNano: 1n,
  endTimeUnixNano: 2n,
  status: { code: 'ok' },
  attributes,
})

type Call = {
  url: string
  headers: Record<string, string>
  body: Uint8Array
  init: RequestInit
}

const harness = (
  responses: Array<number | 'throw' | (() => Response)> = [],
  options: Partial<ConstructorParameters<typeof OtlpHttpExporter>[0]> = {}
) => {
  const calls: Call[] = []
  const warnings: string[] = []
  let clock = 1_000_000
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit
  ) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: init?.body as Uint8Array,
      init: init!,
    })
    const next =
      responses.length > 1 ? responses.shift()! : (responses[0] ?? 200)
    if (next === 'throw') throw new Error('connection refused')
    if (typeof next === 'function') return next()
    return new Response(null, { status: next })
  }) as typeof fetch
  const exporter = new OtlpHttpExporter({
    endpoint: 'http://127.0.0.1:4000/v1/otlp/',
    headers: { 'x-greptime-db-name': 'pikku' },
    resource: { serviceName: 'svc' },
    flushIntervalMs: 10,
    retryDelayMs: 1,
    fetch: fetchImpl,
    logger: { warn: (message: string) => warnings.push(message) },
    now: () => clock,
    ...options,
  })
  return { exporter, calls, warnings, tick: (ms: number) => (clock += ms) }
}

const until = async (predicate: () => boolean, ms = 3000) => {
  const deadline = Date.now() + ms
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('condition not reached')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('OtlpHttpExporter', () => {
  test('posts protobuf to /v1/<signal> under the base URL with the configured headers', async () => {
    const { exporter, calls } = harness()
    exporter.exportSpans([span('a')])
    exporter.exportLogs([{ severity: 'info', body: 'hi' }])
    exporter.exportMetrics([{ name: 'm', kind: 'gauge', value: 1 }])
    await exporter.flush()
    assert.deepEqual(calls.map((call) => call.url).sort(), [
      'http://127.0.0.1:4000/v1/otlp/v1/logs',
      'http://127.0.0.1:4000/v1/otlp/v1/metrics',
      'http://127.0.0.1:4000/v1/otlp/v1/traces',
    ])
    for (const call of calls) {
      assert.equal(call.headers['content-type'], 'application/x-protobuf')
      assert.equal(call.headers['x-greptime-db-name'], 'pikku')
      assert.equal(call.init.redirect, 'error')
      assert.equal(call.init.method, 'POST')
    }
    const traces = calls.find((c) => c.url.endsWith('/traces'))!
    assert.equal(decodeTraces(traces.body).items[0]!.name, 'a')
    assert.equal(
      decodeLogs(calls.find((c) => c.url.endsWith('/logs'))!.body).items[0]!
        .body.string,
      'hi'
    )
  })

  test('exports on the interval without a flush call', async () => {
    const { exporter, calls } = harness()
    exporter.exportSpans([span('timer')])
    assert.equal(calls.length, 0)
    await until(() => calls.length === 1)
  })

  test('a full batch is sent at once', async () => {
    const { exporter, calls } = harness([200], {
      maxBatch: 3,
      flushIntervalMs: 60_000,
    })
    exporter.exportSpans([span('1'), span('2'), span('3')])
    await until(() => calls.length === 1)
    assert.equal(decodeTraces(calls[0]!.body).items.length, 3)
  })

  test('batches larger than maxBatch go out as several requests', async () => {
    const { exporter, calls } = harness([200], {
      maxBatch: 2,
      flushIntervalMs: 60_000,
    })
    exporter.exportSpans([1, 2, 3, 4, 5].map((n) => span(`s${n}`)))
    await exporter.flush()
    assert.deepEqual(
      calls.map((call) => decodeTraces(call.body).items.length),
      [2, 2, 1]
    )
  })

  test('a failed request is retried once, then succeeds', async () => {
    const { exporter, calls, warnings } = harness([503, 200])
    exporter.exportSpans([span('retry')])
    await exporter.flush()
    assert.equal(calls.length, 2)
    assert.deepEqual(warnings, [])
    assert.equal(exporter.stats.dropped.spans, 0)
  })

  test('two failures drop the batch and warn once', async () => {
    const { exporter, calls, warnings } = harness(['throw'])
    exporter.exportSpans([span('lost')])
    await exporter.flush()
    assert.equal(calls.length, 2)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /failed; dropped/)
  })

  test('a 400 is not retried and never logs attribute values', async () => {
    const { exporter, calls, warnings } = harness([400])
    exporter.exportSpans([span('rejected', { secret: 'hunter2' })])
    await exporter.flush()
    assert.equal(calls.length, 1)
    assert.match(warnings[0]!, /HTTP 400/)
    assert.doesNotMatch(warnings.join(' '), /hunter2/)
  })

  test('429 and 408 are retried like a server error', async () => {
    for (const status of [429, 408]) {
      const { exporter, calls } = harness([status, 200])
      exporter.exportSpans([span('x')])
      await exporter.flush()
      assert.equal(calls.length, 2, String(status))
    }
  })

  test('warnings are limited to one a minute per signal', async () => {
    const { exporter, warnings, tick } = harness([400])
    for (let n = 0; n < 5; n++) {
      exporter.exportSpans([span(`s${n}`)])
      await exporter.flush()
    }
    assert.equal(warnings.length, 1)
    tick(61_000)
    exporter.exportSpans([span('later')])
    await exporter.flush()
    assert.equal(warnings.length, 2)
  })

  test('ten failed batches in a row back the signal off for 30 s, still queueing', async () => {
    const { exporter, calls, tick } = harness([400])
    for (let n = 0; n < 10; n++) {
      exporter.exportSpans([span(`s${n}`)])
      await exporter.flush()
    }
    assert.equal(calls.length, 10)

    exporter.exportSpans([span('during backoff')])
    await exporter.flush()
    assert.equal(calls.length, 10, 'nothing is sent while backed off')

    tick(30_001)
    await exporter.flush()
    assert.equal(calls.length, 11)
    assert.equal(decodeTraces(calls[10]!.body).items[0]!.name, 'during backoff')
  })

  test('a success resets the failure count', async () => {
    const { exporter, calls } = harness([400, 400, 200])
    for (let n = 0; n < 12; n++) {
      exporter.exportSpans([span(`s${n}`)])
      await exporter.flush()
    }
    assert.equal(calls.length, 12)
  })

  test('the span queue holds 2048 and drops the oldest, exporting the loss as a metric', async () => {
    const { exporter, calls } = harness([200], {
      flushIntervalMs: 60_000,
      maxBatch: 100_000,
    })
    const spans = Array.from({ length: OTLP_QUEUE_LIMITS.spans + 5 }, (_, n) =>
      span(`s${n}`)
    )
    exporter.exportSpans(spans)
    assert.equal(exporter.stats.dropped.spans, 5)
    await exporter.flush()
    const sent = decodeTraces(
      calls.find((c) => c.url.endsWith('/traces'))!.body
    )
    assert.equal(sent.items.length, 2048)
    assert.equal(sent.items[0]!.name, 's5', 'the oldest five were dropped')

    const metrics = decodeMetrics(
      calls.find((c) => c.url.endsWith('/metrics'))!.body
    )
    const dropped = metrics.items.find(
      (m) => m.name === 'pikku.telemetry.dropped'
    )!
    assert.equal(dropped.type, 'sum')
    assert.equal(dropped.points[0]!.value, 5n)
    assert.deepEqual(dropped.points[0]!.attributes.signal, { string: 'spans' })
  })

  test('log and metric queues have their own caps', () => {
    const { exporter } = harness([200], {
      flushIntervalMs: 60_000,
      maxBatch: 1e6,
    })
    exporter.exportLogs(
      Array.from({ length: 4096 + 3 }, () => ({
        severity: 'info' as const,
        body: 'x',
      }))
    )
    exporter.exportMetrics(
      Array.from({ length: 512 + 2 }, () => ({
        name: 'm',
        kind: 'gauge' as const,
        value: 1,
      }))
    )
    assert.equal(exporter.stats.dropped.logs, 3)
    assert.equal(exporter.stats.dropped.metrics, 2)
  })

  test('a later value of a different type is coerced to the key first seen', async () => {
    const { exporter, calls } = harness()
    exporter.exportSpans([span('a', { 'plugin.size': 3 })])
    await exporter.flush()
    exporter.exportSpans([
      span('b', { 'plugin.size': 2.5, 'pikku.function.duration_ms': 0.4 }),
    ])
    await exporter.flush()
    const second = decodeTraces(calls[1]!.body).items[0]!
    assert.deepEqual(second.attributes['plugin.size'], { int: 3n })
    assert.deepEqual(second.attributes['pikku.function.duration_ms'], {
      int: 0n,
    })
  })

  test('close flushes what is queued and then refuses more, never rejecting', async () => {
    const { exporter, calls } = harness([200], { flushIntervalMs: 60_000 })
    exporter.exportSpans([span('last')])
    await exporter.close()
    assert.equal(calls.length, 1)
    exporter.exportSpans([span('after close')])
    await exporter.flush()
    assert.equal(calls.length, 1)
    await exporter.close()
  })

  test('close gives up after two seconds on a hung endpoint', async () => {
    const hang = () => new Promise<Response>(() => {})
    const { exporter } = harness([hang as never], { flushIntervalMs: 60_000 })
    exporter.exportSpans([span('hung')])
    const started = Date.now()
    await exporter.close()
    assert.ok(Date.now() - started < 3500)
  })

  test('nothing the endpoint does can make an export method throw', async () => {
    const { exporter } = harness(['throw'])
    assert.doesNotThrow(() => exporter.exportSpans([span('x')]))
    assert.doesNotThrow(() =>
      exporter.exportLogs([{ severity: 'warn', body: 'x' }])
    )
    assert.doesNotThrow(() =>
      exporter.exportMetrics([{ name: 'm', kind: 'sum', value: 1 }])
    )
    await assert.doesNotReject(exporter.flush())
  })
})
