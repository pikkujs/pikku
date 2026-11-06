import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adoptTraceparent,
  createTrace,
  formatTraceparent,
  isValidTraceId,
  outgoingTraceparent,
  parseTraceparent,
  resolveHTTPTrace,
} from './trace.js'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const PARENT = '00f067aa0ba902b7'
const HEADER = `00-${TRACE_ID}-${PARENT}-01`

const createLogger = () => {
  const warnings: unknown[] = []
  return {
    warnings,
    logger: { warn: (message: unknown) => warnings.push(message) } as any,
  }
}

describe('parseTraceparent', () => {
  test('reads a valid header', () => {
    assert.deepEqual(parseTraceparent(HEADER), {
      traceId: TRACE_ID,
      parentSpanId: PARENT,
      sampled: true,
    })
  })

  test('reads the sampled bit, not the whole flags byte', () => {
    assert.equal(
      parseTraceparent(`00-${TRACE_ID}-${PARENT}-00`)?.sampled,
      false
    )
    assert.equal(parseTraceparent(`00-${TRACE_ID}-${PARENT}-03`)?.sampled, true)
    assert.equal(
      parseTraceparent(`00-${TRACE_ID}-${PARENT}-02`)?.sampled,
      false
    )
  })

  test('accepts extra fields only on a future version', () => {
    assert.equal(
      parseTraceparent(`01-${TRACE_ID}-${PARENT}-01-future`)?.traceId,
      TRACE_ID
    )
    assert.equal(parseTraceparent(`${HEADER}-future`), undefined)
  })

  for (const [name, value] of [
    ['version ff', `ff-${TRACE_ID}-${PARENT}-01`],
    ['all-zero trace id', `00-${'0'.repeat(32)}-${PARENT}-01`],
    ['all-zero parent id', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
    ['upper case', `00-${TRACE_ID.toUpperCase()}-${PARENT}-01`],
    ['short trace id', `00-${TRACE_ID.slice(1)}-${PARENT}-01`],
    ['non-hex', `00-${'g'.repeat(32)}-${PARENT}-01`],
    ['surrounding text', `x${HEADER}`],
    ['empty', ''],
    ['not a string', [HEADER]],
    ['missing', undefined],
  ] as const) {
    test(`rejects ${name}`, () => {
      assert.equal(parseTraceparent(value), undefined)
    })
  }
})

describe('createTrace', () => {
  test('issues W3C ids that differ per request', () => {
    const a = createTrace()
    const b = createTrace()
    assert.ok(isValidTraceId(a.traceId))
    assert.match(a.spanId, /^[0-9a-f]{16}$/)
    assert.notEqual(a.traceId, b.traceId)
    assert.notEqual(a.spanId, b.spanId)
  })

  test('round-trips through formatTraceparent', () => {
    const trace = createTrace()
    assert.deepEqual(parseTraceparent(formatTraceparent(trace)), {
      traceId: trace.traceId,
      parentSpanId: trace.spanId,
      sampled: true,
    })
  })
})

describe('resolveHTTPTrace', () => {
  test('ignores an inbound header by default', () => {
    const { logger } = createLogger()
    const trace = resolveHTTPTrace(() => HEADER, logger, {})
    assert.notEqual(trace.traceId, TRACE_ID)
    assert.equal(trace.parentSpanId, undefined)
  })

  test('continues an inbound header when the deployment opts in', () => {
    const { logger } = createLogger()
    const trace = resolveHTTPTrace(() => HEADER, logger, {
      trustInboundTraceparent: true,
    })
    assert.equal(trace.traceId, TRACE_ID)
    assert.equal(trace.parentSpanId, PARENT)
    assert.notEqual(trace.spanId, PARENT)
  })

  test('falls back to a new trace on an invalid or unreadable header', () => {
    const { logger } = createLogger()
    const options = { trustInboundTraceparent: true }
    assert.ok(
      isValidTraceId(resolveHTTPTrace(() => 'bad', logger, options).traceId)
    )
    assert.ok(
      isValidTraceId(
        resolveHTTPTrace(
          () => {
            throw new Error('no headers')
          },
          logger,
          options
        ).traceId
      )
    )
  })

  test('prefers a valid runtime traceId over the header', () => {
    const { logger } = createLogger()
    const runtimeId = 'a'.repeat(32)
    const trace = resolveHTTPTrace(() => HEADER, logger, {
      traceId: runtimeId,
      trustInboundTraceparent: true,
    })
    assert.equal(trace.traceId, runtimeId)
  })

  test('refuses a runtime traceId that is not W3C, and says so', () => {
    const { logger, warnings } = createLogger()
    const trace = resolveHTTPTrace(() => undefined, logger, {
      traceId: 'cf-ray-value',
    })
    assert.notEqual(trace.traceId, 'cf-ray-value')
    assert.ok(isValidTraceId(trace.traceId))
    assert.equal(warnings.length, 1)
  })
})

describe('adoptTraceparent', () => {
  test('continues the trace in place and keeps this span', () => {
    const trace = createTrace()
    const { spanId } = trace
    const wire = { traceId: trace.traceId, trace }
    adoptTraceparent(wire, `00-${TRACE_ID}-${PARENT}-00`)
    assert.equal(wire.traceId, TRACE_ID)
    assert.equal(wire.trace, trace)
    assert.deepEqual(trace, {
      traceId: TRACE_ID,
      spanId,
      parentSpanId: PARENT,
      sampled: false,
    })
  })

  test('leaves the wire alone on an invalid header', () => {
    const trace = createTrace()
    const before = { ...trace }
    const wire = { traceId: trace.traceId, trace }
    adoptTraceparent(wire, 'forged')
    assert.deepEqual(wire.trace, before)
    assert.equal(wire.traceId, before.traceId)
  })
})

describe('outgoingTraceparent', () => {
  test('makes this span the parent of the next hop', () => {
    const trace = createTrace()
    assert.equal(
      outgoingTraceparent({ trace }),
      `00-${trace.traceId}-${trace.spanId}-01`
    )
  })

  test('sends nothing from a wire outside a W3C trace', () => {
    assert.equal(outgoingTraceparent({}), undefined)
  })
})
