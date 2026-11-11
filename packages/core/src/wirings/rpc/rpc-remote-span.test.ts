import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { RecordingTracer } from '../../testing/recording-tracer.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { ContextAwareRPCService } from './rpc-runner.js'

const createLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

const createServices = (overrides: Record<string, unknown> = {}) =>
  ({
    logger: createLogger(),
    ...overrides,
  }) as never

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', createServices())
})

const REMOTE_TRACE = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
}
const REMOTE_TRACEPARENT =
  '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

describe('ContextAwareRPCService.rpc - boundary spans', () => {
  test("a remote call is a client span, the remote function's parent", async () => {
    const tracer = new RecordingTracer()
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        tracer,
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
            return { remote: true }
          },
        },
      }),
      { trace: REMOTE_TRACE, getSession: async () => undefined } as never,
      {}
    )

    await service.rpc('missingRpc', { secret: 'do-not-record' })

    assert.equal(tracer.spans.length, 1)
    const span = tracer.spans[0]!
    assert.equal(span.name, 'rpc.call missingRpc')
    assert.equal(span.kind, 'client')
    assert.equal(span.traceId, REMOTE_TRACE.traceId)
    assert.equal(span.parentSpanId, REMOTE_TRACE.spanId)
    assert.deepEqual(span.attributes, { 'rpc.service': 'deployment' })
    assert.equal(span.status.code, 'ok')
    // The remote function becomes the child of the client span.
    assert.equal(calls[0]![3], `00-${span.traceId}-${span.spanId}-01`)
    assert.ok(
      !JSON.stringify(span, (_, v) =>
        typeof v === 'bigint' ? String(v) : v
      ).includes('do-not-record')
    )
  })

  test('a failed remote call ends the client span in error and rethrows', async () => {
    const tracer = new RecordingTracer()
    const boom = new Error('remote is down')
    const service = new ContextAwareRPCService(
      createServices({
        tracer,
        deploymentService: {
          invoke: async () => {
            throw boom
          },
        },
      }),
      { trace: REMOTE_TRACE, getSession: async () => undefined } as never,
      {}
    )

    await assert.rejects(() => service.rpc('acme:missing', {}), boom)

    const span = tracer.spans[0]!
    assert.equal(span.status.code, 'error')
    assert.equal(span.attributes['rpc.service'], 'acme')
    assert.equal(span.events?.[0]?.name, 'exception')
  })

  test('a failed remote call records the error class, never its message', async () => {
    const tracer = new RecordingTracer()
    const service = new ContextAwareRPCService(
      createServices({
        tracer,
        deploymentService: {
          invoke: async () => {
            throw new TypeError(
              'connect ECONNREFUSED nats://user:hunter2@10.0.0.5:4222'
            )
          },
        },
      }),
      { trace: REMOTE_TRACE, getSession: async () => undefined } as never,
      {}
    )
    await assert.rejects(() => service.rpc('acme:missing', {}))
    const span = tracer.spans[0]!
    assert.equal(span.events?.[0]?.attributes?.['exception.type'], 'TypeError')
    const text = JSON.stringify(span, (_, v) =>
      typeof v === 'bigint' ? String(v) : v
    )
    assert.ok(!text.includes('hunter2') && !text.includes('nats://'))
  })

  test('a function name that is not a plain identifier gets a fixed span name', async () => {
    const tracer = new RecordingTracer()
    const service = new ContextAwareRPCService(
      createServices({
        tracer,
        deploymentService: { invoke: async () => undefined },
      }),
      { trace: REMOTE_TRACE, getSession: async () => undefined } as never,
      {}
    )
    await service.rpc('user 42@example.com: lookup?id=7', {})
    await service.rpc('x'.repeat(200), {})
    for (const span of tracer.spans) {
      assert.equal(span.name, 'rpc.call')
      assert.deepEqual(span.attributes, { 'rpc.service': 'deployment' })
    }
  })

  test('a remote call with no tracer keeps the caller trace on the wire', async () => {
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
          },
        },
      }),
      { trace: REMOTE_TRACE, getSession: async () => undefined } as never,
      {}
    )
    await service.rpc('missingRpc', {})
    assert.equal(calls[0]![3], REMOTE_TRACEPARENT)
  })

  test('a local call adds no client span, only the callee span', async () => {
    const tracer = new RecordingTracer()
    pikkuState(null, 'rpc', 'meta').localFn = 'localFn'
    addFunction('localFn', { func: async () => 'ok' } as never)
    pikkuState(null, 'function', 'meta').localFn = {
      name: 'localFn',
      sessionless: true,
      permissions: [],
      expose: true,
    } as never
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        tracer,
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
          },
        },
      }),
      { trace: REMOTE_TRACE } as never,
      {}
    )
    assert.equal(await service.rpc('localFn', {}), 'ok')
    assert.deepEqual(calls, [])
    assert.deepEqual(
      tracer.spans.map((span) => [span.name, span.kind]),
      [['localFn', 'internal']]
    )
  })
})
