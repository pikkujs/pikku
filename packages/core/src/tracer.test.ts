import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOOP_TRACER,
  SPAN_LIMITS,
  nowUnixNano,
  redactSpanError,
  setBoundedAttribute,
} from './tracer.js'
import { NOOP_TRACER as FromTrace } from './trace.js'
import { createTrace } from './trace.js'
import { RecordingTracer } from './testing/recording-tracer.js'

describe('NOOP_TRACER', () => {
  test('is exported from @pikku/core/trace and records nothing', () => {
    assert.equal(FromTrace, NOOP_TRACER)
    const span = NOOP_TRACER.startSpan('x', createTrace(), {
      attributes: { a: 1 },
    })
    span.setAttribute('k', 'v')
    span.addEvent('e')
    span.end({ code: 'error', error: new Error('boom') })
    span.end()
  })

  test('hands out one shared span', () => {
    assert.equal(
      NOOP_TRACER.startSpan('a', createTrace()),
      NOOP_TRACER.startSpan('b', createTrace())
    )
  })
})

describe('redactSpanError', () => {
  test('keeps class and message, never a stack', () => {
    const error = new TypeError('bad input')
    const { type, message } = redactSpanError(error)
    assert.equal(type, 'TypeError')
    assert.equal(message, 'TypeError: bad input')
    assert.ok(!message.includes('at '))
    assert.ok(!message.includes(error.stack!.split('\n')[1]!))
  })

  test('truncates to 256 characters', () => {
    const { message } = redactSpanError(new Error('x'.repeat(1000)))
    assert.equal(message.length, SPAN_LIMITS.statusMessageLength)
    assert.ok(message.endsWith('…'))
  })

  test('handles a thrown non-error', () => {
    assert.deepEqual(redactSpanError('nope'), {
      type: 'string',
      message: 'string: nope',
    })
    assert.equal(redactSpanError(null).type, 'null')
  })
})

describe('setBoundedAttribute', () => {
  test('truncates long strings and keeps numbers and booleans', () => {
    const attributes: Record<string, string | number | boolean> = {}
    setBoundedAttribute(attributes, 's', 'a'.repeat(5000))
    setBoundedAttribute(attributes, 'n', 42)
    setBoundedAttribute(attributes, 'b', false)
    assert.equal((attributes.s as string).length, SPAN_LIMITS.stringLength)
    assert.equal(attributes.n, 42)
    assert.equal(attributes.b, false)
  })

  test('drops an over-long key and anything past 64 attributes', () => {
    const attributes: Record<string, string | number | boolean> = {}
    assert.equal(setBoundedAttribute(attributes, 'k'.repeat(129), 1), false)
    for (let i = 0; i < SPAN_LIMITS.attributes; i++) {
      assert.equal(setBoundedAttribute(attributes, `k${i}`, i), true)
    }
    assert.equal(setBoundedAttribute(attributes, 'extra', 1), false)
    // An existing key may still be overwritten at the limit.
    assert.equal(setBoundedAttribute(attributes, 'k0', 99), true)
    assert.equal(attributes.k0, 99)
    assert.equal(Object.keys(attributes).length, SPAN_LIMITS.attributes)
  })
})

describe('nowUnixNano', () => {
  test('is a bigint close to Date.now()', () => {
    const ns = nowUnixNano()
    assert.equal(typeof ns, 'bigint')
    const ms = Number(ns / 1_000_000n)
    assert.ok(Math.abs(ms - Date.now()) < 1000)
  })
})

describe('RecordingTracer', () => {
  test('records ids from the context, never its own', () => {
    const tracer = new RecordingTracer()
    const context = { ...createTrace(), parentSpanId: 'a'.repeat(16) }
    const span = tracer.startSpan('fn', context, { kind: 'server' })
    span.end({ code: 'ok' })
    const [finished] = tracer.spans
    assert.equal(finished!.traceId, context.traceId)
    assert.equal(finished!.spanId, context.spanId)
    assert.equal(finished!.parentSpanId, context.parentSpanId)
    assert.equal(finished!.kind, 'server')
    assert.deepEqual(finished!.status, { code: 'ok' })
    assert.ok(finished!.endTimeUnixNano >= finished!.startTimeUnixNano)
  })

  test('end is idempotent and later writes are ignored', () => {
    const tracer = new RecordingTracer()
    const span = tracer.startSpan('fn', createTrace())
    span.end({ code: 'ok' })
    span.setAttribute('late', 1)
    span.end({ code: 'error', error: new Error('again') })
    assert.equal(tracer.spans.length, 1)
    assert.equal(tracer.spans[0]!.attributes.late, undefined)
    assert.equal(tracer.spans[0]!.status.code, 'ok')
  })

  test('redacts the error and counts drops', () => {
    const tracer = new RecordingTracer()
    const span = tracer.startSpan('fn', createTrace())
    span.setAttribute('k'.repeat(200), 1)
    for (let i = 0; i < SPAN_LIMITS.events + 3; i++) span.addEvent('e')
    span.end({ code: 'error', error: new Error('secret token abc') })
    const [finished] = tracer.spans
    assert.equal(finished!.status.code, 'error')
    assert.equal(finished!.status.message, 'Error: secret token abc')
    assert.equal(finished!.events!.length, SPAN_LIMITS.events)
    assert.equal(tracer.stats.dropped, 4)
    assert.ok(
      !JSON.stringify(finished, (_k, v) =>
        typeof v === 'bigint' ? 0 : v
      ).includes('at ')
    )
  })
})
