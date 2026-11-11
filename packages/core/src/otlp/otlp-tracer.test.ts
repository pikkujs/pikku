import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeTraces } from '../testing/otlp-decoder.js'
import { createTrace } from '../trace.js'
import type { TraceContext } from '../trace.js'
import { SPAN_LIMITS } from '../tracer.js'
import { OtlpHttpExporter } from './otlp-http-exporter.js'
import { OtlpTracer, type ContextStorage } from './otlp-tracer.js'

const setup = (contextStorage?: ContextStorage) => {
  const bodies: Uint8Array[] = []
  const exporter = new OtlpHttpExporter({
    endpoint: 'http://127.0.0.1:4000/v1/otlp',
    resource: { serviceName: 's' },
    flushIntervalMs: 60_000,
    fetch: (async (_url: string, init: RequestInit) => {
      bodies.push(init.body as Uint8Array)
      return new Response(null, { status: 200 })
    }) as never,
  })
  const tracer = new OtlpTracer(
    exporter,
    contextStorage ? { contextStorage } : {}
  )
  const sent = async () => {
    await tracer.flush()
    return bodies.flatMap((body) => decodeTraces(body).items)
  }
  return { tracer, sent }
}

describe('OtlpTracer', () => {
  test('exports one span with the ids it was given, never minting its own', async () => {
    const { tracer, sent } = setup()
    const context = { ...createTrace(), parentSpanId: 'b7ad6b7169203331' }
    const span = tracer.startSpan('fn', context, {
      kind: 'server',
      attributes: { 'pikku.wire.type': 'http' },
    })
    span.setAttribute('http.response.status_code', 200)
    span.end({ code: 'ok' })
    const [out] = await sent()
    assert.equal(out!.traceId, context.traceId)
    assert.equal(out!.spanId, context.spanId)
    assert.equal(out!.parentSpanId, 'b7ad6b7169203331')
    assert.equal(out!.name, 'fn')
    assert.equal(out!.kind, 2)
    assert.equal(out!.status.code, 1)
    assert.ok(out!.endTimeUnixNano >= out!.startTimeUnixNano)
    assert.deepEqual(out!.attributes['http.response.status_code'], {
      int: 200n,
    })
  })

  test('an unsampled trace exports nothing', async () => {
    const { tracer, sent } = setup()
    tracer
      .startSpan('fn', { ...createTrace(), sampled: false })
      .end({ code: 'ok' })
    assert.deepEqual(await sent(), [])
    assert.equal(tracer.stats.started, 0)
  })

  test('an error is redacted to class and message, never a stack', async () => {
    const { tracer, sent } = setup()
    const span = tracer.startSpan('fn', createTrace())
    const error = new TypeError('bad input')
    span.addEvent('exception', { 'exception.type': 'TypeError' })
    span.end({ code: 'error', error })
    const [out] = await sent()
    assert.equal(out!.status.code, 2)
    assert.equal(out!.status.message, 'TypeError: bad input')
    assert.doesNotMatch(
      JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? 0 : v)),
      /at .*\.ts/
    )
  })

  test('end is idempotent and later writes are ignored', async () => {
    const { tracer, sent } = setup()
    const span = tracer.startSpan('fn', createTrace())
    span.end({ code: 'ok' })
    span.end({ code: 'error', error: new Error('late') })
    span.setAttribute('late', 'x')
    span.addEvent('late')
    const out = await sent()
    assert.equal(out.length, 1)
    assert.equal(out[0]!.status.code, 1)
    assert.equal(out[0]!.attributes.late, undefined)
  })

  test('limits: 64 attributes, 128 char keys, 1024 char strings, 32 events', async () => {
    const { tracer, sent } = setup()
    const span = tracer.startSpan('fn', createTrace())
    for (let n = 0; n < 80; n++) span.setAttribute(`db.k${n}`, 'v')
    span.setAttribute('k'.repeat(SPAN_LIMITS.keyLength + 1), 'x')
    span.setAttribute('db.k0', 'z'.repeat(5000))
    for (let n = 0; n < 40; n++) span.addEvent(`e${n}`)
    span.end({ code: 'ok' })
    const [out] = await sent()
    assert.equal(Object.keys(out!.attributes).length, SPAN_LIMITS.attributes)
    const value = out!.attributes['db.k0'] as { string: string }
    assert.equal(value.string.length, SPAN_LIMITS.stringLength)
    assert.equal(value.string.endsWith('…'), true)
    assert.equal(out!.events.length, SPAN_LIMITS.events)
    assert.equal(tracer.stats.dropped, 80 - 64 + 1 + 8)
  })

  test('runInSpan makes the span current through an injected storage', () => {
    let current: TraceContext | undefined
    const storage: ContextStorage = {
      run: (context, fn) => {
        const before = current
        current = context
        try {
          return fn()
        } finally {
          current = before
        }
      },
      get: () => current,
    }
    const { tracer } = setup(storage)
    const context = createTrace()
    const span = tracer.startSpan('fn', context)
    assert.equal(tracer.currentContext(), undefined)
    const seen = tracer.runInSpan(span, () => tracer.currentContext())
    assert.deepEqual(seen, context)
    assert.equal(tracer.currentContext(), undefined)
  })

  test('without a storage runInSpan just runs the function', () => {
    const { tracer } = setup()
    const span = tracer.startSpan('fn', createTrace())
    assert.equal(
      tracer.runInSpan(span, () => 42),
      42
    )
    assert.equal(tracer.currentContext(), undefined)
  })
})
