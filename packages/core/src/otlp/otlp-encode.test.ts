import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeLogs,
  decodeMetrics,
  decodeTraces,
} from '../testing/otlp-decoder.js'
import { encodeLogs, encodeMetrics, encodeTraces } from './otlp-encode.js'
import { ProtobufWriter } from './protobuf-writer.js'

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

const RESOURCE = {
  serviceName: 'golden',
  serviceVersion: '1.2.3',
  environment: 'production',
  project: 'demo',
  stage: 'production',
}

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN_ID = '00f067aa0ba902b7'

// Golden bytes: produced by the spike's independently written encoder
// (greptime-spike/scripts/otlp.ts, the one GreptimeDB 1.3.0 was proven against)
// for these exact inputs, with this resource and the '@pikku/core' scope.
const GOLDEN_TRACES =
  '0aa5030a99010a180a0c736572766963652e6e616d6512080a06676f6c64656e0a1a0a0f7365' +
  '72766963652e76657273696f6e12070a05312e322e330a2b0a1b6465706c6f796d656e742e65' +
  '6e7669726f6e6d656e742e6e616d65120c0a0a70726f64756374696f6e0a170a0d70696b6b75' +
  '2e70726f6a65637412060a0464656d6f0a1b0a0b70696b6b752e7374616765120c0a0a70726f' +
  '64756374696f6e1286020a0d0a0b4070696b6b752f636f726512af010a104bf92f3577b34da6' +
  'a3ce929d0e0e4736120800f067aa0ba902b72208b7ad6b71692033312a0d637265617465496e' +
  '766f69636530023900002a36fe9c971741c0d47e3dfe9c97174a190a0f70696b6b752e776972' +
  '652e7479706512060a04687474704a200a19687474702e726573706f6e73652e737461747573' +
  '5f636f6465120318f4034a160a1070696b6b752e74726163652e726f6f74120210017a0f120b' +
  '4572726f723a20626f6f6d180212430a104bf92f3577b34da6a3ce929d0e0e47361208111111' +
  '11111111112a0d637265617465496e766f69636530053900002a36fe9c971741c0d47e3dfe9c' +
  '97177a021801'

const GOLDEN_LOGS =
  '0a81020a99010a180a0c736572766963652e6e616d6512080a06676f6c64656e0a1a0a0f7365' +
  '72766963652e76657273696f6e12070a05312e322e330a2b0a1b6465706c6f796d656e742e65' +
  '6e7669726f6e6d656e742e6e616d65120c0a0a70726f64756374696f6e0a170a0d70696b6b75' +
  '2e70726f6a65637412060a0464656d6f0a1b0a0b70696b6b752e7374616765120c0a0a70726f' +
  '64756374696f6e12630a0d0a0b4070696b6b752f636f726512520901002a36fe9c971710111a' +
  '056572726f722a0a0a0869742062726f6b65320d0a07617474656d7074120218024a104bf92f' +
  '3577b34da6a3ce929d0e0e4736520800f067aa0ba902b75901002a36fe9c9717'

const GOLDEN_METRICS =
  '0abb020a99010a180a0c736572766963652e6e616d6512080a06676f6c64656e0a1a0a0f7365' +
  '72766963652e76657273696f6e12070a05312e322e330a2b0a1b6465706c6f796d656e742e65' +
  '6e7669726f6e6d656e742e6e616d65120c0a0a70726f64756374696f6e0a170a0d70696b6b75' +
  '2e70726f6a65637412060a0464656d6f0a1b0a0b70696b6b752e7374616765120c0a0a70726f' +
  '64756374696f6e129c010a0d0a0b4070696b6b752f636f726512370a1270726f636573732e6d' +
  '656d6f72792e7273731a0242792a1d0a1b1100002a36fe9c97171902002a36fe9c9717210000' +
  '00000000f83f12520a1770696b6b752e74656c656d657472792e64726f707065641a01313a34' +
  '0a2e1100002a36fe9c97171902002a36fe9c97173107000000000000003a110a067369676e61' +
  '6c12070a057370616e7310021801'

describe('otlp-encode: byte-exact against the spike encoder', () => {
  test('traces', () => {
    const bytes = encodeTraces(RESOURCE, [
      {
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        parentSpanId: 'b7ad6b7169203331',
        name: 'createInvoice',
        kind: 'server',
        startTimeUnixNano: 1700000000000000000n,
        endTimeUnixNano: 1700000000123000000n,
        status: { code: 'error', message: 'Error: boom' },
        attributes: {
          'pikku.wire.type': 'http',
          'http.response.status_code': 500,
          'pikku.trace.root': true,
        },
      },
      {
        traceId: TRACE_ID,
        spanId: '1111111111111111',
        name: 'createInvoice',
        kind: 'consumer',
        startTimeUnixNano: 1700000000000000000n,
        endTimeUnixNano: 1700000000123000000n,
        status: { code: 'ok' },
        attributes: {},
      },
    ])
    assert.equal(toHex(bytes), GOLDEN_TRACES)
  })

  test('logs', () => {
    const bytes = encodeLogs(RESOURCE, [
      {
        timeUnixNano: 1700000000000000001n,
        severity: 'error',
        body: 'it broke',
        attributes: { attempt: 2 },
        traceId: TRACE_ID,
        spanId: SPAN_ID,
      },
    ])
    assert.equal(toHex(bytes), GOLDEN_LOGS)
  })

  test('metrics', () => {
    const bytes = encodeMetrics(
      RESOURCE,
      [
        {
          name: 'process.memory.rss',
          unit: 'By',
          kind: 'gauge',
          value: 1.5,
          timeUnixNano: 1700000000000000002n,
        },
        {
          name: 'pikku.telemetry.dropped',
          unit: '1',
          kind: 'sum',
          integer: true,
          value: 7,
          timeUnixNano: 1700000000000000002n,
          attributes: { signal: 'spans' },
        },
      ],
      1700000000000000000n
    )
    assert.equal(toHex(bytes), GOLDEN_METRICS)
  })
})

describe('otlp-encode: decoded by the independent test reader', () => {
  test('a span with an event and a double attribute round-trips', () => {
    const { resource, items } = decodeTraces(
      encodeTraces(RESOURCE, [
        {
          traceId: TRACE_ID,
          spanId: SPAN_ID,
          name: 'n',
          kind: 'client',
          startTimeUnixNano: 5n,
          endTimeUnixNano: 9n,
          status: { code: 'unset' },
          attributes: { ratio: { double: 2 }, big: 2 ** 40, text: 'é✓' },
          events: [
            {
              name: 'exception',
              timeUnixNano: 7n,
              attributes: { 'exception.type': 'Error' },
            },
          ],
        },
      ])
    )
    assert.deepEqual(resource['deployment.environment.name'], {
      string: 'production',
    })
    assert.deepEqual(resource['pikku.stage'], { string: 'production' })
    const [span] = items
    assert.equal(span!.kind, 3)
    assert.equal(span!.parentSpanId, undefined)
    assert.deepEqual(span!.attributes.ratio, { double: 2 })
    assert.deepEqual(span!.attributes.big, { int: 2n ** 40n })
    assert.deepEqual(span!.attributes.text, { string: 'é✓' })
    assert.equal(span!.events[0]!.name, 'exception')
    assert.equal(span!.events[0]!.timeUnixNano, 7n)
    assert.equal(span!.status.code, 0)
  })

  test('a non-finite number is sent as text, not as a broken double', () => {
    const { items } = decodeLogs(
      encodeLogs(RESOURCE, [
        {
          severity: 'info',
          body: 'x',
          attributes: { nan: Number.NaN, inf: Infinity },
        },
      ])
    )
    assert.deepEqual(items[0]!.attributes.nan, { string: 'NaN' })
    assert.deepEqual(items[0]!.attributes.inf, { string: 'Infinity' })
  })

  test('points of one name share a metric', () => {
    const { items } = decodeMetrics(
      encodeMetrics(
        RESOURCE,
        [
          { name: 'a', kind: 'gauge', value: 1, attributes: { k: 'x' } },
          { name: 'a', kind: 'gauge', value: 2, attributes: { k: 'y' } },
          { name: 'a', kind: 'sum', value: 3, integer: true },
        ],
        1n
      )
    )
    assert.equal(items.length, 2)
    assert.equal(items[0]!.points.length, 2)
    assert.equal(items[1]!.type, 'sum')
    assert.equal(items[1]!.monotonic, true)
    assert.equal(items[1]!.temporality, 2)
    assert.equal(items[1]!.points[0]!.value, 3n)
  })
})

describe('ProtobufWriter', () => {
  test('writes varints across the byte boundaries and negatives as ten bytes', () => {
    const w = new ProtobufWriter()
    w.varint(1, 0)
    w.varint(1, 127)
    w.varint(1, 128)
    w.varint(1, -1)
    assert.equal(
      toHex(w.finish()),
      '0800' + '087f' + '088001' + '08ffffffffffffffffff01'
    )
  })

  test('grows past its first buffer', () => {
    const w = new ProtobufWriter()
    w.string(2, 'x'.repeat(10_000))
    assert.equal(w.finish().length, 1 + 2 + 10_000)
  })
})
