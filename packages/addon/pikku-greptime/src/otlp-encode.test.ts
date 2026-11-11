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
  test('an id that is not lowercase hex of the right length is refused', () => {
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
    assert.throws(
      () =>
        encodeLogs(resource, [
          {
            timeUnixNano: 1n,
            severity: 'info',
            body: '',
            attributes: {},
            spanId: 'ABC',
          },
        ]),
      TypeError
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
