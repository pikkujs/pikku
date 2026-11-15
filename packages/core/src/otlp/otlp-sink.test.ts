import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { FinishedSpan } from '../tracer.js'
import { createTrace } from '../trace.js'
import { OtlpTracer } from './otlp-tracer.js'
import {
  createOtlpSinks,
  fanOutOtlp,
  type OpenSpan,
  type OtlpSinkBase,
} from './otlp-sink.js'

const span = (name = 's'): FinishedSpan => ({
  traceId: 't'.repeat(32),
  spanId: 's'.repeat(16),
  name,
  kind: 'internal',
  startTimeUnixNano: 1n,
  endTimeUnixNano: 2n,
  status: { code: 'ok' },
  attributes: {},
})

class Recorder implements OtlpSinkBase {
  spans: string[] = []
  started: OpenSpan[] = []
  resources: string[] = []
  closed = 0
  setResource(resource: { serviceName: string }) {
    this.resources.push(resource.serviceName)
  }
  onSpanStart(s: OpenSpan) {
    this.started.push(s)
  }
  exportSpans(spans: FinishedSpan[]) {
    this.spans.push(...spans.map((s) => s.name))
  }
  exportLogs() {}
  exportMetrics() {}
  async flush() {}
  async close() {
    this.closed++
  }
}

const throwing: OtlpSinkBase = {
  onSpanStart() {
    throw new Error('boom')
  },
  exportSpans() {
    throw new Error('boom')
  },
  exportLogs() {
    throw new Error('boom')
  },
  exportMetrics() {
    throw new Error('boom')
  },
  flush: () => {
    throw new Error('boom')
  },
  close: () => Promise.reject(new Error('boom')),
}

const never: OtlpSinkBase = {
  exportSpans() {},
  exportLogs() {},
  exportMetrics() {},
  flush: () => new Promise(() => {}),
  close: () => new Promise(() => {}),
}

describe('fanOutOtlp', () => {
  test('an empty registry does nothing and does not throw', async () => {
    const fan = fanOutOtlp(createOtlpSinks())
    assert.equal(fan.active, false)
    fan.exportSpans([span()])
    fan.exportLogs([])
    fan.exportMetrics([])
    await fan.flush()
    await fan.close()
  })

  test('a throwing sink never throws and never costs the others', async () => {
    const registry = createOtlpSinks()
    const good = new Recorder()
    registry.add(throwing)
    registry.add(good)
    const fan = fanOutOtlp(registry)
    fan.onSpanStart!({} as OpenSpan)
    fan.exportSpans([span('a')])
    fan.exportLogs([])
    fan.exportMetrics([])
    await fan.flush()
    await fan.close()
    assert.deepEqual(good.spans, ['a'])
    assert.equal(good.started.length, 1)
    assert.equal(good.closed, 1)
  })

  test('a sink added after the fan-out was built still receives spans', () => {
    const registry = createOtlpSinks()
    const fan = fanOutOtlp(registry)
    const late = new Recorder()
    registry.add(late)
    fan.exportSpans([span('after')])
    assert.deepEqual(late.spans, ['after'])
    assert.equal(fan.active, true)
  })

  test('a sink that never settles holds close for two seconds, not longer, and not the others', async () => {
    const registry = createOtlpSinks()
    const good = new Recorder()
    registry.add(never)
    registry.add(good)
    const started = Date.now()
    await fanOutOtlp(registry).close()
    const took = Date.now() - started
    assert.ok(took >= 1900 && took < 3500, `close took ${took} ms`)
    assert.equal(good.closed, 1, 'the healthy sink was closed in parallel')
  })

  test('flush shares the same cap', async () => {
    const registry = createOtlpSinks()
    registry.add(never)
    const started = Date.now()
    await fanOutOtlp(registry).flush()
    assert.ok(Date.now() - started < 3500)
  })

  test('a registered sink is told the resource, before and after registration', () => {
    const registry = createOtlpSinks()
    const before = new Recorder()
    registry.add(before)
    registry.setResource({ serviceName: 'svc' })
    const after = new Recorder()
    registry.add(after)
    assert.deepEqual(before.resources, ['svc'])
    assert.deepEqual(after.resources, ['svc'])
  })

  test('add hands the map to the sink', () => {
    const registry = createOtlpSinks()
    const maps: unknown[] = []
    registry.add(
      Object.assign(new Recorder(), {
        setMap: (map: { a: number }) => void maps.push(map),
      }),
      { a: 1 }
    )
    assert.deepEqual(maps, [{ a: 1 }])
  })
})

describe('OtlpTracer on the fan-out', () => {
  test('a sink sees a sampled span start with its parent, then end', () => {
    const registry = createOtlpSinks()
    const sink = new Recorder()
    registry.add(sink)
    const tracer = new OtlpTracer(fanOutOtlp(registry))
    const trace = createTrace()
    const open = tracer.startSpan('work', trace, {
      attributes: { 'pikku.function.id': 'f' },
    })
    assert.equal(sink.started.length, 1)
    assert.equal(sink.started[0]!.name, 'work')
    assert.equal(sink.started[0]!.attributes['pikku.function.id'], 'f')
    assert.deepEqual(sink.spans, [])
    open.end()
    assert.deepEqual(sink.spans, ['work'])
  })

  test('an unsampled trace reaches no sink', () => {
    const registry = createOtlpSinks()
    const sink = new Recorder()
    registry.add(sink)
    const tracer = new OtlpTracer(fanOutOtlp(registry))
    tracer.startSpan('quiet', { ...createTrace(), sampled: false }).end()
    assert.deepEqual(sink.started, [])
    assert.deepEqual(sink.spans, [])
  })
  test('an empty registry records nothing but keeps the context, and a sink added later sees later spans', () => {
    const registry = createOtlpSinks()
    const tracer = new OtlpTracer(fanOutOtlp(registry))
    const context = createTrace()
    const idle = tracer.startSpan('idle', context)
    assert.equal(idle.context, context)
    assert.equal(tracer.stats.started, 0)
    idle.setAttribute('k', 'v')
    idle.end()

    const sink = new Recorder()
    registry.add(sink)
    tracer.startSpan('heard', createTrace()).end()
    assert.deepEqual(
      sink.started.map((s) => s.name),
      ['heard']
    )
    assert.deepEqual(sink.spans, ['heard'])
  })
})
