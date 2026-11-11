import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { unwrapJobTrace, wrapJobTrace } from './queue-trace.js'
import { RecordingTracer } from '../../testing/recording-tracer.js'
import { traceQueueService } from '../../function/trace-queue-service.js'
import { InMemoryQueueService } from './in-memory-queue-service.js'
import { SignedQueueService } from './signed-queue-service.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  createTrace,
  formatTraceparent,
  type TraceContext,
} from '../../trace.js'
import type { JobOptions, QueueService } from './queue.types.js'

const OTHER_TRACE = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`

const recordingQueue = () => {
  const added: Array<{ queueName: string; data: any; options?: JobOptions }> =
    []
  const queue: QueueService = {
    supportsResults: false,
    add: async (queueName: string, data: any, options?: JobOptions) => {
      added.push({ queueName, data, options })
      return 'job-1'
    },
    getJob: async () => null,
  }
  return { queue, added }
}

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any

describe('traceQueueService', () => {
  test('stamps a job with the wire trace', async () => {
    const { queue, added } = recordingQueue()
    const trace = createTrace()
    await traceQueueService(queue, { trace }).add('q', { a: 1 } as any)
    assert.equal(added[0]!.options?.traceparent, formatTraceparent(trace))
    assert.deepEqual(added[0]!.data, { a: 1 })
  })

  test('a publish is a producer span and the job is its child', async () => {
    const { queue, added } = recordingQueue()
    const tracer = new RecordingTracer()
    const trace = createTrace()
    await traceQueueService(queue, { trace }, { tracer, logger }).add(
      'emails',
      { to: 'a@example.com', secret: 'payload' } as any
    )
    const span = tracer.spans[0]!
    assert.equal(span.name, 'queue.publish emails')
    assert.equal(span.kind, 'producer')
    assert.equal(span.traceId, trace.traceId)
    assert.equal(span.parentSpanId, trace.spanId)
    assert.deepEqual(span.attributes, {
      'messaging.system': 'pikku',
      'messaging.destination.name': 'emails',
    })
    assert.equal(
      added[0]!.options?.traceparent,
      `00-${span.traceId}-${span.spanId}-01`
    )
    assert.ok(
      !JSON.stringify(span, (_, v) =>
        typeof v === 'bigint' ? String(v) : v
      ).includes('payload')
    )
  })

  test('a failed publish ends the span in error and rethrows', async () => {
    const tracer = new RecordingTracer()
    const boom = new Error('broker down')
    const queue = {
      supportsResults: false,
      add: async () => {
        throw boom
      },
      getJob: async () => null,
    } as QueueService
    await assert.rejects(
      () =>
        traceQueueService(
          queue,
          { trace: createTrace() },
          { tracer, logger }
        ).add('q', {} as any),
      boom
    )
    assert.equal(tracer.spans[0]!.status.code, 'error')
  })

  test('a failed publish records the error class, never its message', async () => {
    const tracer = new RecordingTracer()
    const queue = {
      supportsResults: false,
      add: async () => {
        throw new TypeError(
          'connect ECONNREFUSED redis://user:hunter2@10.0.0.5:6379'
        )
      },
      getJob: async () => null,
    } as QueueService
    await assert.rejects(() =>
      traceQueueService(
        queue,
        { trace: createTrace() },
        { tracer, logger }
      ).add('q', {} as any)
    )
    const span = tracer.spans[0]!
    assert.equal(span.events?.[0]?.attributes?.['exception.type'], 'TypeError')
    const text = JSON.stringify(span, (_, v) =>
      typeof v === 'bigint' ? String(v) : v
    )
    assert.ok(!text.includes('hunter2') && !text.includes('redis://'))
  })

  test('an unsampled trace or a missing tracer records nothing and stamps the wire trace', async () => {
    const tracer = new RecordingTracer()
    const { queue, added } = recordingQueue()
    const unsampled = { ...createTrace(), sampled: false }
    await traceQueueService(
      queue,
      { trace: unsampled },
      { tracer, logger }
    ).add('q', {} as any)
    assert.equal(tracer.spans.length, 0)
    assert.equal(added[0]!.options?.traceparent, formatTraceparent(unsampled))
  })

  test('a tracer that throws never breaks the publish', async () => {
    const { queue, added } = recordingQueue()
    const tracer = {
      startSpan: () => {
        throw new Error('tracer bug')
      },
    }
    const trace = createTrace()
    await traceQueueService(queue, { trace }, { tracer, logger }).add(
      'q',
      {} as any
    )
    assert.equal(added[0]!.options?.traceparent, formatTraceparent(trace))
  })

  test('keeps a traceparent the caller set, and the other options', async () => {
    const { queue, added } = recordingQueue()
    await traceQueueService(queue, { trace: createTrace() }).add(
      'q',
      {} as any,
      { traceparent: OTHER_TRACE, delay: 5 }
    )
    assert.deepEqual(added[0]!.options, { traceparent: OTHER_TRACE, delay: 5 })
  })

  test('leaves options alone when the wire has no trace', async () => {
    const { queue, added } = recordingQueue()
    await traceQueueService(queue, {}).add('q', {} as any)
    assert.equal(added[0]!.options, undefined)
  })

  test('reads the trace at add time, not when wrapped', async () => {
    const { queue, added } = recordingQueue()
    const wire: { trace?: TraceContext } = {}
    const wrapped = traceQueueService(queue, wire)
    wire.trace = createTrace()
    await wrapped.add('q', {} as any)
    assert.equal(added[0]!.options?.traceparent, formatTraceparent(wire.trace))
  })

  test('a service with private state and extra methods keeps working', async () => {
    class Extended extends InMemoryQueueService {
      #secret = 'kept'
      read() {
        return this.#secret
      }
    }
    const wrapped = traceQueueService(new Extended(), {
      trace: createTrace(),
    })
    assert.equal(wrapped.read(), 'kept')
    assert.equal(wrapped.supportsResults, new Extended().supportsResults)
  })

  test('composes over SignedQueueService without touching the data', async () => {
    const { queue, added } = recordingQueue()
    const secrets = {
      getSecret: async () => ({ reveal: () => 'x'.repeat(32) }),
    } as any
    const trace = createTrace()
    const signed = new SignedQueueService(queue, secrets, logger)
    await traceQueueService(signed, { trace }).add('q', { a: 1 } as any, {
      pikkuUserId: 'user-1',
    })
    assert.equal(added[0]!.options?.traceparent, formatTraceparent(trace))
    assert.notEqual(added[0]!.options?.pikkuUserId, 'user-1')
    assert.deepEqual(added[0]!.data, { a: 1 })
  })

  test('a wrapper holding the service, like PikkuQueue, is stamped', async () => {
    class GeneratedQueue {
      constructor(private readonly service: QueueService) {}
      add(name: string, data: any, options?: JobOptions) {
        return this.service.add(name, data, options)
      }
    }
    const { queue, added } = recordingQueue()
    const trace = createTrace()
    await new GeneratedQueue(traceQueueService(queue, { trace })).add('q', {})
    assert.equal(added[0]!.options?.traceparent, formatTraceparent(trace))
  })
})

describe('the function runner', () => {
  beforeEach(() => resetPikkuState())

  const register = (name: string, func: any) => {
    addFunction(name, { func, auth: false } as any)
    pikkuState(null, 'function', 'meta')[name] = {
      pikkuFuncId: name,
      sessionless: true,
    } as any
  }

  test('binds the queue to each invocation, so concurrent calls keep their own trace', async () => {
    const { queue, added } = recordingQueue()
    const singletonServices = { logger, queueService: queue } as any
    register('enqueues', async ({ queueService }: any, data: any) => {
      await new Promise((resolve) => setTimeout(resolve, data.wait))
      await queueService.add('q', data)
    })
    const a = createTrace()
    const b = createTrace()
    await Promise.all(
      [
        { trace: a, wait: 5 },
        { trace: b, wait: 0 },
      ].map(({ trace, wait }) =>
        runPikkuFunc('rpc', Math.random().toString(), 'enqueues', {
          singletonServices,
          getAllServices: () => singletonServices,
          data: () => ({ wait }),
          auth: false,
          wire: { trace, traceId: trace.traceId },
        } as any)
      )
    )
    assert.equal(
      added.find((job) => job.data.wait === 5)!.options?.traceparent,
      formatTraceparent(a)
    )
    assert.equal(
      added.find((job) => job.data.wait === 0)!.options?.traceparent,
      formatTraceparent(b)
    )
    assert.equal(singletonServices.queueService, queue)
  })
})

describe('the job envelope', () => {
  test('round-trips data and traceparent', () => {
    const data = { a: 1, nested: { b: [2] } }
    assert.deepEqual(unwrapJobTrace(wrapJobTrace(data, OTHER_TRACE)), {
      data,
      traceparent: OTHER_TRACE,
    })
  })

  test('sends data as it is when there is no trace', () => {
    const data = { a: 1 }
    assert.equal(wrapJobTrace(data), data)
  })

  test('reads a job enqueued before the envelope', () => {
    for (const data of [{ a: 1 }, 'text', 7, null, undefined, [1]]) {
      assert.deepEqual(unwrapJobTrace(data), { data })
    }
  })

  test('survives JSON, with an undefined payload too', () => {
    const stored = JSON.parse(JSON.stringify(wrapJobTrace({}, OTHER_TRACE)))
    assert.equal(unwrapJobTrace(stored).traceparent, OTHER_TRACE)
    const empty = JSON.parse(
      JSON.stringify(wrapJobTrace(undefined, OTHER_TRACE))
    )
    assert.deepEqual(unwrapJobTrace(empty), {
      data: undefined,
      traceparent: OTHER_TRACE,
    })
  })

  test('carries an identity claim, with or without a trace', () => {
    const data = { a: 1 }
    assert.deepEqual(
      unwrapJobTrace(
        JSON.parse(JSON.stringify(wrapJobTrace(data, undefined, 'claim')))
      ),
      { data, pikkuUserId: 'claim' }
    )
    assert.deepEqual(
      unwrapJobTrace(
        JSON.parse(JSON.stringify(wrapJobTrace(data, OTHER_TRACE, 'claim')))
      ),
      { data, traceparent: OTHER_TRACE, pikkuUserId: 'claim' }
    )
  })

  test('a payload that only resembles the envelope is the job data', () => {
    for (const payload of [
      { __pikkuTraceparent: 7, data: {} },
      { __pikkuUserId: 7, data: {} },
      { __pikkuTraceparent: OTHER_TRACE, __pikkuUserId: 7, data: {} },
      { __pikkuUserId: 'claim', data: {}, extra: true },
      { __pikkuTraceparent: OTHER_TRACE, data: {}, extra: true },
      { data: {} },
    ]) {
      assert.deepEqual(unwrapJobTrace(payload), { data: payload })
    }
  })
})
