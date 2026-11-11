import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { encodeGauges, encodeLogs, encodeTraces } from './otlp-encode.js'

const resource = {
  serviceName: 's',
  environment: 'production',
  project: 'p',
  stage: 'production',
}

describe('otlp encoding', () => {
  test('logs carry the resource, the text and the ids', () => {
    const bytes = encodeLogs(resource, [
      {
        timeUnixNano: 1n,
        severity: 'info',
        body: 'hello',
        attributes: { a: 1 },
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
      },
    ])
    const text = Buffer.from(bytes).toString('latin1')
    for (const needle of [
      'pikku.project',
      'deployment.environment.name',
      'hello',
      '@pikku/addon-greptime',
    ]) {
      assert.ok(text.includes(needle), needle)
    }
  })
  test('a span id that is not hex of the right length is refused', () => {
    assert.throws(
      () =>
        encodeTraces(resource, [
          {
            traceId: 'x',
            spanId: 'b'.repeat(16),
            name: 'n',
            kind: 'server',
            startTimeUnixNano: 1n,
            endTimeUnixNano: 2n,
            status: 'ok',
            attributes: {},
          },
        ]),
      TypeError
    )
  })
  test('a log with an id that is not hex loses the id, not the batch', () => {
    const line = (traceId?: string, spanId?: string) => ({
      timeUnixNano: 1n,
      severity: 'info' as const,
      body: 'b',
      attributes: {},
      traceId,
      spanId,
    })
    const none = encodeLogs(resource, [line()])
    for (const bad of ['', 'ABC', 'not-hex', 'g'.repeat(32), 'a'.repeat(31)]) {
      const encoded = encodeLogs(resource, [line(bad, bad), line()])
      const twoPlain = encodeLogs(resource, [line(), line()])
      assert.deepEqual(encoded, twoPlain, `'${bad}'`)
    }
    assert.ok(encodeLogs(resource, [line('a'.repeat(32))]).length > none.length)
  })
  test('uppercase hex encodes the same bytes as lowercase', () => {
    const line = (id: string, span: string) => ({
      timeUnixNano: 1n,
      severity: 'info' as const,
      body: 'b',
      attributes: {},
      traceId: id,
      spanId: span,
    })
    assert.deepEqual(
      encodeLogs(resource, [
        line('ABCDEF0123456789ABCDEF0123456789', 'ABCDEF0123456789'),
      ]),
      encodeLogs(resource, [
        line('abcdef0123456789abcdef0123456789', 'abcdef0123456789'),
      ])
    )
    const span = (traceId: string) => ({
      traceId,
      spanId: 'b'.repeat(16),
      name: 'n',
      kind: 'server' as const,
      startTimeUnixNano: 1n,
      endTimeUnixNano: 2n,
      status: 'ok' as const,
      attributes: {},
    })
    assert.deepEqual(
      encodeTraces(resource, [span('ABCDEF0123456789ABCDEF0123456789')]),
      encodeTraces(resource, [span('abcdef0123456789abcdef0123456789')])
    )
  })
  test('gauges are grouped by name and a whole-number double stays a double', () => {
    const one = encodeGauges(resource, [
      { name: 'm', timeUnixNano: 1n, value: 1, attributes: {} },
    ])
    const many = encodeGauges(resource, [
      { name: 'm', timeUnixNano: 1n, value: 1, attributes: {} },
      { name: 'm', timeUnixNano: 2n, value: 2, attributes: {} },
    ])
    assert.ok(many.length > one.length)
    const withDouble = encodeLogs(resource, [
      {
        timeUnixNano: 1n,
        severity: 'info',
        body: 'x',
        attributes: { d: { double: 3 } },
      },
    ])
    const withInt = encodeLogs(resource, [
      { timeUnixNano: 1n, severity: 'info', body: 'x', attributes: { d: 3 } },
    ])
    assert.notDeepEqual(withDouble, withInt)
  })
})
