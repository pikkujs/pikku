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
    assert.equal(exporter.stats.dropped.spans, 1)
  })

  test('a batch rejected with a 4xx is counted as dropped, and exported in the loss counter', async () => {
    const { exporter, calls } = harness([400, 200])
    exporter.exportSpans([span('a'), span('b')])
    await exporter.flush()
    assert.equal(exporter.stats.dropped.spans, 2)
    exporter.exportMetrics([{ name: 'g', kind: 'gauge', value: 1 }])
    await exporter.flush()
    const metrics = decodeMetrics(calls[1]!.body).items
    const dropped = metrics.find((m) => m.name === 'pikku.telemetry.dropped')!
    assert.equal(dropped.points[0]!.value, 2n)
  })

  test('a batch that cannot be encoded is counted as dropped', async () => {
    const { exporter } = harness([200])
    const bad = span('bad')
    bad.startTimeUnixNano = 'x' as unknown as bigint
    exporter.exportSpans([bad])
    await exporter.flush()
    assert.equal(exporter.stats.dropped.spans, 1)
  })

  test('a failed metrics batch counts its points but not the loss counters it carried', async () => {
    const { exporter } = harness(['throw'])
    exporter.exportLogs(
      Array.from({ length: OTLP_QUEUE_LIMITS.logs + 1 }, () => ({
        severity: 'info' as const,
        body: 'x',
      }))
    )
    exporter.exportMetrics([{ name: 'g', kind: 'gauge', value: 1 }])
    await exporter.flush()
    assert.equal(exporter.stats.dropped.metrics, 1)
  })

  /** Records every timer made while `run` executes: its delay, unref and clear. */
  const spyTimers = async (run: () => Promise<void>) => {
    type Rec = { ms: number; unref: boolean; cleared: boolean; handle: unknown }
    const recs: Rec[] = []
    const realSet = globalThis.setTimeout
    const realClear = globalThis.clearTimeout
    globalThis.setTimeout = ((
      fn: () => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      const handle = (realSet as (...a: unknown[]) => unknown)(
        fn,
        ms,
        ...args
      ) as {
        unref?: () => unknown
      }
      const rec: Rec = { ms: ms ?? 0, unref: false, cleared: false, handle }
      const realUnref = handle.unref?.bind(handle)
      handle.unref = () => {
        rec.unref = true
        return realUnref?.()
      }
      recs.push(rec)
      return handle
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = ((handle: unknown) => {
      for (const rec of recs) if (rec.handle === handle) rec.cleared = true
      return (realClear as (h: unknown) => void)(handle)
    }) as typeof clearTimeout
    try {
      await run()
    } finally {
      globalThis.setTimeout = realSet
      globalThis.clearTimeout = realClear
    }
    return recs
  }

  test('close() on an idle exporter returns promptly, unrefs its timer and clears the cap', async () => {
    const { exporter } = harness([200])
    const started = Date.now()
    const timers = await spyTimers(() => exporter.close())
    assert.ok(Date.now() - started < 500)
    const cap = timers.find((t) => t.ms === 2000)
    assert.ok(cap, 'close() arms a 2s cap')
    assert.ok(
      timers.every((t) => t.unref),
      'every timer close() makes is unref d'
    )
    assert.ok(cap.cleared, 'the cap timer is cleared after the race')
  })

  test('the retry sleep is unref d', async () => {
    const { exporter, calls } = harness([503, 200], { retryDelayMs: 7 })
    exporter.exportSpans([span('retry')])
    const timers = await spyTimers(() => exporter.flush())
    assert.equal(calls.length, 2)
    const sleep = timers.find((t) => t.ms === 7)
    assert.ok(sleep?.unref, 'the retry sleep does not keep the process alive')
  })

  test('a failing endpoint after a lost batch gets one extras-only metrics attempt per flush', async () => {
    // No background flush: only the explicit ones below send.
    const { exporter, calls } = harness(['throw'], { flushIntervalMs: 60_000 })
    exporter.exportSpans([span('lost')])
    await exporter.flush()
    const metricCalls = () => calls.filter((c) => c.url.endsWith('/v1/metrics'))
    // The loss is only known once the span batch has failed, so the counter
    // goes out with the next flush: one batch, an attempt plus its single
    // retry, not ten rounds of the same points.
    assert.equal(metricCalls().length, 0)
    await exporter.flush()
    assert.equal(metricCalls().length, 2)
    assert.equal(
      exporter.stats.dropped.metrics,
      0,
      'counters are not counted as lost'
    )
    await exporter.flush()
    assert.equal(metricCalls().length, 4)
  })

  test('headersBySignal overrides the global header and content-type always wins', async () => {
    const { exporter, calls } = harness([200], {
      headers: {
        'x-a': 'global',
        'x-greptime-db-name': 'pikku',
        'content-type': 'text/plain',
      },
      headersBySignal: {
        traces: { 'x-a': 'traces', 'content-type': 'application/json' },
      },
    })
    exporter.exportSpans([span('s')])
    exporter.exportLogs([{ severity: 'info', body: 'l' }])
    await exporter.flush()
    const byUrl = (suffix: string) => calls.find((c) => c.url.endsWith(suffix))!
    assert.equal(byUrl('/v1/traces').headers['x-a'], 'traces')
    assert.equal(byUrl('/v1/logs').headers['x-a'], 'global')
    assert.equal(byUrl('/v1/traces').headers['x-greptime-db-name'], 'pikku')
    for (const c of calls) {
      assert.equal(c.headers['content-type'], 'application/x-protobuf')
    }
  })

  test('header values never appear in warn or debug output', async () => {
    const SENTINEL = 'sentinel-secret-value'
    const logs: string[] = []
    const { exporter } = harness(['throw'], {
      headers: { authorization: `Bearer ${SENTINEL}` },
      headersBySignal: { traces: { 'x-extra': SENTINEL } },
      logger: {
        warn: (m: string) => logs.push(m),
        debug: (m: string) => logs.push(m),
      },
    })
    exporter.exportSpans([span('s')])
    exporter.exportLogs([{ severity: 'info', body: 'l' }])
    await exporter.flush()
    assert.ok(logs.length > 0)
    assert.doesNotMatch(logs.join('\n'), new RegExp(SENTINEL))
  })

  test('a 400 is not retried and never logs attribute values', async () => {
    const { exporter, calls, warnings } = harness([400])
    exporter.exportSpans([span('rejected', { 'db.secret': 'hunter2' })])
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
    const spanWarnings = () => warnings.filter((w) => /spans/.test(w))
    assert.equal(spanWarnings().length, 1)
    tick(61_000)
    exporter.exportSpans([span('later')])
    await exporter.flush()
    assert.equal(spanWarnings().length, 2)
  })

  test('ten failed batches in a row back the signal off for 30 s, still queueing', async () => {
    const { exporter, calls: all, tick } = harness([400])
    // The loss counter rides on the metrics signal; only traces are under test.
    const calls = {
      get length() {
        return all.filter((c) => c.url.endsWith('/v1/traces')).length
      },
      get 10() {
        return all.filter((c) => c.url.endsWith('/v1/traces'))[10]!
      },
    }
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
    assert.equal(decodeTraces(calls[10].body).items[0]!.name, 'during backoff')
  })

  test('a success resets the failure count', async () => {
    const { exporter, calls } = harness([400, 400, 200])
    for (let n = 0; n < 12; n++) {
      exporter.exportSpans([span(`s${n}`)])
      await exporter.flush()
    }
    assert.equal(calls.filter((c) => c.url.endsWith('/v1/traces')).length, 12)
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
    exporter.exportSpans([span('a', { 'db.size': 3 })])
    await exporter.flush()
    exporter.exportSpans([
      span('b', { 'db.size': 2.5, 'pikku.function.duration_ms': 0.4 }),
    ])
    await exporter.flush()
    const second = decodeTraces(calls[1]!.body).items[0]!
    assert.deepEqual(second.attributes['db.size'], { int: 3n })
    assert.deepEqual(second.attributes['pikku.function.duration_ms'], {
      int: 0n,
    })
  })

  test('a key that is not allow-listed never leaves, and the loss is a metric', async () => {
    const { exporter, calls } = harness()
    exporter.exportSpans([
      span('a', { 'pikku.function.id': 'f', 'user.email': 'a@example.com' }),
    ])
    await exporter.flush()
    const [first] = decodeTraces(calls[0]!.body).items
    assert.deepEqual(Object.keys(first!.attributes), ['pikku.function.id'])
    assert.equal(exporter.stats.attributesDropped, 1)
    exporter.exportMetrics([{ name: 'g', kind: 'gauge', value: 1 }])
    await exporter.flush()
    const metrics = decodeMetrics(calls[1]!.body).items
    const dropped = metrics.find((m) => m.name === 'pikku.telemetry.dropped')!
    assert.equal(dropped.points[0]!.value, 1n)
    assert.deepEqual(dropped.points[0]!.attributes.signal, {
      string: 'span_attributes',
    })
  })

  test('a span event keeps only exception.type and exception.message and a short identifier name', async () => {
    const { exporter, calls } = harness()
    const event = (name: string, attributes: Record<string, string>) => ({
      name,
      timeUnixNano: 1n,
      attributes,
    })
    exporter.exportSpans([
      {
        ...span('a'),
        events: [
          event('exception', {
            'exception.type': 'TypeError',
            'exception.message': 'm',
            'user.email': 'a@example.com',
          }),
          event('user a@example.com did x', {}),
        ],
      },
    ])
    await exporter.flush()
    const [decoded] = decodeTraces(calls[0]!.body).items
    assert.equal(decoded!.events.length, 1)
    assert.deepEqual(Object.keys(decoded!.events[0]!.attributes).sort(), [
      'exception.message',
      'exception.type',
    ])
    assert.equal(exporter.stats.attributesDropped, 2)
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
