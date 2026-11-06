import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  continueTrace,
  createTrace,
  formatTraceparent,
  parseTraceparent,
} from './trace.js'
import { unwrapJobTrace, wrapJobTrace } from './wirings/queue/queue-trace.js'

const SEED = 0x7ace1234
const RUNS = 20_000
const CANONICAL =
  /^(?!ff)[0-9a-f]{2}-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/

/** mulberry32: a failure here reproduces from the seed alone. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const fuzzer = (seed: number) => {
  const next = random(seed)
  const int = (max: number) => Math.floor(next() * max)
  const pick = <T>(values: readonly T[]) => values[int(values.length)]!
  const chars = (alphabet: string, length: number) =>
    Array.from({ length }, () => pick([...alphabet])).join('')
  const hex = (length: number) => chars('0123456789abcdef', length)
  const SHAPES: Array<() => unknown> = [
    () => `00-${hex(32)}-${hex(16)}-${hex(2)}`,
    () => `${hex(2)}-${hex(32)}-${hex(16)}-${hex(2)}`,
    () => `00-${hex(int(40))}-${hex(int(24))}-${hex(int(4))}`,
    () => `00-${hex(32).toUpperCase()}-${hex(16)}-01`,
    () => `00-${'0'.repeat(32)}-${hex(16)}-01`,
    () => `00-${hex(32)}-${'0'.repeat(16)}-01`,
    () => `ff-${hex(32)}-${hex(16)}-01`,
    () => `00-${hex(32)}-${hex(16)}-01-${hex(4)}`,
    () => ` 00-${hex(32)}-${hex(16)}-01\n`,
    () => `00-${hex(32)}-${hex(16)}-01${'x'.repeat(int(10_000))}`,
    () => 'x'.repeat(1_000_000),
    () => chars('😀é\u0000‮日本-0a', int(70)),
    () => `00-${chars('٠١٢٣a', 32)}-${hex(16)}-01`,
    () => chars('-0123456789abcdefg ', int(80)),
    () => pick([null, undefined, 0, 1, true, {}, [], () => {}, Symbol('s')]),
    () => ({ toString: () => `00-${hex(32)}-${hex(16)}-01` }),
    () => [`00-${hex(32)}-${hex(16)}-01`],
  ]
  return { int, hex, value: () => pick(SHAPES)() }
}

describe(`traceparent, fuzzed with seed ${SEED.toString(16)}`, () => {
  test('never throws and never accepts an id it should not', () => {
    const { value } = fuzzer(SEED)
    let accepted = 0
    for (let run = 0; run < RUNS; run++) {
      const header = value()
      const parsed = parseTraceparent(header)
      if (!parsed) continue
      accepted++
      assert.equal(typeof header, 'string')
      assert.match((header as string).slice(0, 55), CANONICAL)
      assert.match(parsed.traceId, /^[0-9a-f]{32}$/)
      assert.match(parsed.parentSpanId, /^[0-9a-f]{16}$/)
      assert.notEqual(parsed.traceId, '0'.repeat(32))
    }
    assert.ok(accepted > 0, 'the fuzzer never produced a valid header')
  })

  test('what continues is well formed, whatever was carried', () => {
    const { value } = fuzzer(SEED + 1)
    for (let run = 0; run < RUNS; run++) {
      const trace = continueTrace(value())
      assert.match(formatTraceparent(trace), CANONICAL)
    }
  })

  test('format and parse agree', () => {
    const { hex, int } = fuzzer(SEED + 2)
    for (let run = 0; run < RUNS; run++) {
      const trace = {
        ...createTrace(`1${hex(31)}`),
        spanId: `2${hex(15)}`,
        sampled: int(2) === 0,
      }
      const parsed = parseTraceparent(formatTraceparent(trace))
      assert.deepEqual(
        {
          traceId: parsed?.traceId,
          span: parsed?.parentSpanId,
          on: parsed?.sampled,
        },
        { traceId: trace.traceId, span: trace.spanId, on: trace.sampled }
      )
    }
  })

  test('the job envelope never changes the data', () => {
    const { value, hex, int } = fuzzer(SEED + 3)
    for (let run = 0; run < RUNS; run++) {
      const raw = value()
      const data = int(4)
        ? raw
        : {
            __pikkuTraceparent: typeof raw === 'string' ? raw : hex(4),
            data: 1,
          }
      const traceparent = int(2) ? `00-1${hex(31)}-2${hex(15)}-01` : undefined
      const carried = unwrapJobTrace(wrapJobTrace(data, traceparent))
      assert.strictEqual(carried.data, data)
      assert.equal(carried.traceparent, traceparent)
    }
  })
})
