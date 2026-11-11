import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import type { CoreServices } from '../types/core.types.js'
import { MissingSessionError } from '../errors/errors.js'
import { RecordingTracer } from '../testing/recording-tracer.js'
import { childTraceWire, createTrace } from '../trace.js'
import type { Tracer } from '../tracer.js'
import type { PikkuWiringTypes } from '../types/core.types.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestFunction = (funcName: string, funcConfig: any) => {
  addFunction(funcName, funcConfig)
  pikkuState(null, 'function', 'meta')[funcName] = {
    pikkuFuncId: funcName,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }
}

const mockSingletonServices = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as any

const mockServices: CoreServices = {
  ...mockSingletonServices,
} as any

describe('runPikkuFunc - spans', () => {
  const run = (
    funcName: string,
    tracer: Tracer | undefined,
    wire: Record<string, unknown> = {},
    wireType: PikkuWiringTypes = 'rpc'
  ) =>
    runPikkuFunc(wireType, `wire-${funcName}`, funcName, {
      singletonServices: { ...mockSingletonServices, tracer },
      getAllServices: () => ({ ...mockServices, tracer }) as any,
      data: () => ({}),
      auth: false,
      wire,
    } as any)

  test('opens a span with the wire trace ids and ends it ok', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('spanned', { func: async () => 'fine' })
    const trace = createTrace()
    assert.equal(await run('spanned', tracer, { trace }), 'fine')

    assert.equal(tracer.spans.length, 1)
    const [span] = tracer.spans
    assert.equal(span!.name, 'spanned')
    assert.equal(span!.traceId, trace.traceId)
    assert.equal(span!.spanId, trace.spanId)
    assert.equal(span!.kind, 'internal')
    assert.deepEqual(span!.status, { code: 'ok' })
    assert.equal(span!.attributes['pikku.function.id'], 'spanned')
    assert.equal(span!.attributes['pikku.wire.type'], 'rpc')
    assert.equal(span!.attributes['pikku.wire.id'], 'wire-spanned')
    assert.equal(span!.attributes['pikku.trace.root'], false)
    assert.equal(
      typeof span!.attributes['pikku.function.duration_ms'],
      'number'
    )
  })

  test('a wire with no trace makes a root span', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('root', { func: async () => 1 })
    await run('root', tracer)
    assert.equal(tracer.spans[0]!.attributes['pikku.trace.root'], true)
    assert.equal(tracer.spans[0]!.parentSpanId, undefined)
  })

  test('a nested call is a child of the caller span', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('inner', { func: async () => 'inner' })
    addTestFunction('outer', {
      func: async (_s: unknown, _d: unknown, wire: any) =>
        run('inner', tracer, { trace: childTraceWire(wire.trace).trace }),
    })
    await run('outer', tracer, { trace: createTrace() })

    const byName = Object.fromEntries(tracer.spans.map((s) => [s.name, s]))
    assert.equal(tracer.spans.length, 2)
    assert.equal(byName.inner!.parentSpanId, byName.outer!.spanId)
    assert.equal(byName.inner!.traceId, byName.outer!.traceId)
    // The inner span ends first, inside the outer's lifetime.
    assert.deepEqual(
      tracer.spans.map((s) => s.name),
      ['inner', 'outer']
    )
  })

  test('a thrown error ends the span as error and is rethrown unchanged', async () => {
    const tracer = new RecordingTracer()
    const boom = new TypeError('boom')
    addTestFunction('throws', {
      func: async () => {
        throw boom
      },
    })
    await assert.rejects(
      run('throws', tracer, { trace: createTrace() }),
      (e) => {
        assert.equal(e, boom)
        return true
      }
    )
    const [span] = tracer.spans
    assert.equal(span!.status.code, 'error')
    assert.equal(span!.status.message, 'TypeError: boom')
    const [event] = span!.events!
    assert.equal(event!.name, 'exception')
    assert.equal(event!.attributes!['exception.type'], 'TypeError')
    assert.ok(
      !JSON.stringify(span!.events, (_k, v) =>
        typeof v === 'bigint' ? 0 : v
      ).includes('stack')
    )
  })

  test('a refused session ends the span as error', async () => {
    const tracer = new RecordingTracer()
    addFunction('needsSession', { func: async () => 'no' } as any)
    pikkuState(null, 'function', 'meta')['needsSession'] = {
      pikkuFuncId: 'needsSession',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: false,
    } as any
    await assert.rejects(
      run('needsSession', tracer, { trace: createTrace() }),
      MissingSessionError
    )
    assert.equal(tracer.spans.length, 1)
    assert.equal(tracer.spans[0]!.status.code, 'error')
    assert.match(tracer.spans[0]!.status.message!, /^MissingSessionError/)
  })

  test('the span covers the middleware chain; duration_ms is the body only', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('timed', {
      func: async () => 'ok',
      middleware: [
        async (_s: unknown, _w: unknown, next: () => Promise<void>) => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          await next()
        },
      ],
    })
    await run('timed', tracer, { trace: createTrace() })
    const [span] = tracer.spans
    const totalMs = Number(
      (span!.endTimeUnixNano - span!.startTimeUnixNano) / 1_000_000n
    )
    assert.ok(totalMs >= 25, `span lasted ${totalMs}ms`)
    assert.ok((span!.attributes['pikku.function.duration_ms'] as number) < 25)
  })

  test('records the allow-listed end attributes for a queue wire', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('worker', { func: async () => 1 })
    await run(
      'worker',
      tracer,
      {
        trace: createTrace(),
        queue: { queueName: 'emails', jobId: 'j1' },
        pikkuUserId: 'u1',
      },
      'queue'
    )
    const [span] = tracer.spans
    const { attributes } = span!
    assert.equal(span!.kind, 'consumer')
    assert.equal(attributes['pikku.queue.name'], 'emails')
    assert.equal(attributes['pikku.queue.job_id'], 'j1')
    assert.equal(attributes['pikku.user.id'], 'u1')
  })

  test('an http span carries method, route and status; a nested call on its wire does not', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('route', { func: async () => 1 })
    const http = {
      request: { method: () => 'POST' },
      response: { statusCode: 201 },
    }
    await run('route', tracer, { trace: createTrace(), http }, 'http')
    await run('route', tracer, { trace: createTrace(), http }, 'rpc')
    const [served, nested] = tracer.spans
    assert.equal(served!.kind, 'server')
    assert.equal(served!.attributes['http.request.method'], 'POST')
    assert.equal(served!.attributes['http.route'], 'wire-route')
    assert.equal(served!.attributes['http.response.status_code'], 201)
    assert.equal(nested!.kind, 'internal')
    assert.equal(nested!.attributes['http.route'], undefined)
    assert.equal(nested!.attributes['http.response.status_code'], undefined)
  })

  test('never sets anything outside the allow-list', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('strict', { func: async () => 1 })
    await run(
      'strict',
      tracer,
      {
        trace: createTrace(),
        http: {
          request: {
            method: () => 'GET',
            headers: () => ({ authorization: 'secret' }),
            query: () => ({ token: 'secret' }),
          },
          response: { statusCode: 200 },
        },
      },
      'http'
    )
    const allowed = new Set([
      'pikku.wire.type',
      'pikku.wire.id',
      'pikku.function.id',
      'pikku.package',
      'pikku.addon.namespace',
      'pikku.trace.root',
      'pikku.function.duration_ms',
      'pikku.user.id',
      'pikku.org.id',
      'http.request.method',
      'http.route',
      'http.response.status_code',
    ])
    for (const key of Object.keys(tracer.spans[0]!.attributes)) {
      assert.ok(allowed.has(key), `${key} is not on the allow-list`)
    }
    assert.ok(
      !JSON.stringify(tracer.spans[0], (_key, value) =>
        typeof value === 'bigint' ? 0 : value
      ).includes('secret')
    )
  })

  test('an unsampled trace opens no span', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('quiet', { func: async () => 'q' })
    assert.equal(
      await run('quiet', tracer, {
        trace: { ...createTrace(), sampled: false },
      }),
      'q'
    )
    assert.equal(tracer.stats.started, 0)
    assert.equal(tracer.spans.length, 0)
  })

  test('a tracer that throws changes neither result nor error, and is disabled once', async () => {
    const warnings: string[] = []
    const logger = {
      ...mockSingletonServices.logger,
      warn: (m: string) => warnings.push(m),
    }
    let calls = 0
    const throwing: Tracer = {
      startSpan: () => {
        calls++
        throw new Error('sink exploded')
      },
    }
    const boom = new Error('real failure')
    addTestFunction('ok', { func: async () => 'result' })
    addTestFunction('fails', {
      func: async () => {
        throw boom
      },
    })
    const runWith = (name: string) =>
      runPikkuFunc('rpc', 'w', name, {
        singletonServices: { logger, tracer: throwing } as any,
        getAllServices: () => ({ logger }) as any,
        data: () => ({}),
        auth: false,
        wire: { trace: createTrace() },
      } as any)
    assert.equal(await runWith('ok'), 'result')
    await assert.rejects(runWith('fails'), (e) => e === boom)
    assert.equal(await runWith('ok'), 'result')
    assert.equal(calls, 1, 'a throwing tracer is not called again')
    assert.equal(warnings.length, 1)
  })

  test('a tracer whose span throws on end is disabled and the result stands', async () => {
    let ends = 0
    const throwingEnd: Tracer = {
      startSpan: (_n, context) => ({
        context,
        setAttribute() {},
        addEvent() {},
        end() {
          ends++
          throw new Error('end exploded')
        },
      }),
    }
    addTestFunction('ok2', { func: async () => 'fine' })
    const call = () => run('ok2', throwingEnd, { trace: createTrace() })
    assert.equal(await call(), 'fine')
    assert.equal(await call(), 'fine')
    assert.equal(ends, 1)
  })

  test('runInSpan scopes the function and the middleware, once, with the open span', async () => {
    const inner = new RecordingTracer()
    const seen: unknown[] = []
    let current: unknown
    const tracer: Tracer = {
      startSpan: (n, c, o) => inner.startSpan(n, c, o),
      runInSpan: (span, fn) => {
        seen.push(span.context.spanId)
        current = span.context
        try {
          return fn()
        } finally {
          // an ALS would restore here; the awaited work below has already read it
        }
      },
    }
    let readInside: unknown
    addTestFunction('scoped', {
      func: async () => {
        readInside = current
        return 'v'
      },
      middleware: [async (_s: any, _w: any, next: any) => next()],
    })
    const trace = createTrace()
    assert.equal(await run('scoped', tracer, { trace }), 'v')
    assert.deepEqual(seen, [trace.spanId])
    assert.equal((readInside as { spanId: string }).spanId, trace.spanId)
  })

  test('runInSpan is not called for an unsampled trace or a tracer without it', async () => {
    let calls = 0
    const tracer: Tracer = {
      startSpan: () => {
        throw new Error('not reached')
      },
      runInSpan: (_s, fn) => {
        calls++
        return fn()
      },
    }
    addTestFunction('nope', { func: async () => 'x' })
    const unsampled = { ...createTrace(), sampled: false }
    assert.equal(await run('nope', tracer, { trace: unsampled }), 'x')
    assert.equal(calls, 0)
    const plain = new RecordingTracer()
    assert.equal(await run('nope', plain, { trace: createTrace() }), 'x')
  })

  test('a runInSpan that throws runs the function once, keeps result and error, and is disabled', async () => {
    let runs = 0
    let scopes = 0
    const inner = new RecordingTracer()
    const tracer: Tracer = {
      startSpan: (n, c, o) => inner.startSpan(n, c, o),
      runInSpan: () => {
        scopes++
        throw new Error('scope exploded')
      },
    }
    addTestFunction('okRun', {
      func: async () => {
        runs++
        return 'fine'
      },
    })
    addTestFunction('badRun', {
      func: async () => {
        throw new Error('boom')
      },
    })
    assert.equal(await run('okRun', tracer, { trace: createTrace() }), 'fine')
    assert.equal(runs, 1)
    await assert.rejects(
      run('badRun', tracer, { trace: createTrace() }),
      /boom/
    )
    assert.equal(scopes, 1, 'disabled after the first throw')
  })

  test('a runInSpan that runs the function then throws does not rerun it', async () => {
    let runs = 0
    const inner = new RecordingTracer()
    const tracer: Tracer = {
      startSpan: (n, c, o) => inner.startSpan(n, c, o),
      runInSpan: (_s, fn) => {
        fn()
        throw new Error('after')
      },
    }
    addTestFunction('once', {
      func: async () => {
        runs++
        return 'r'
      },
    })
    assert.equal(await run('once', tracer, { trace: createTrace() }), 'r')
    assert.equal(runs, 1)
  })

  test('with no tracer the function runs untouched', async () => {
    addTestFunction('plain', { func: async () => 'plain' })
    assert.equal(
      await run('plain', undefined, { trace: createTrace() }),
      'plain'
    )
  })
})

describe('runPikkuFunc - spans, hostile inputs', () => {
  const run = async (
    name: string,
    tracer: Tracer,
    wire: Record<string, unknown>,
    wireType: PikkuWiringTypes
  ) =>
    runPikkuFunc(wireType, `hostile-${name}`, name, {
      singletonServices: { ...mockSingletonServices, tracer },
      getAllServices: () => ({ ...mockServices, tracer }) as any,
      data: () => ({}),
      auth: false,
      wire,
    } as any)

  test('workflow attributes belong to a workflow invocation, not a nested rpc on its wire', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('step', { func: async () => 1 })
    const wire = {
      trace: createTrace(),
      workflow: { name: 'wf', runId: 'r1' },
      workflowStep: { stepId: 's1' },
    }
    await run('step', tracer, { ...wire }, 'workflow')
    await run('step', tracer, { ...wire, trace: createTrace() }, 'rpc')
    const [own, nested] = tracer.spans
    assert.equal(own!.attributes['pikku.workflow.name'], 'wf')
    assert.equal(own!.attributes['pikku.workflow.run_id'], 'r1')
    assert.equal(own!.attributes['pikku.workflow.step'], 's1')
    assert.equal(nested!.attributes['pikku.workflow.name'], undefined)
    assert.equal(nested!.attributes['pikku.workflow.run_id'], undefined)
    assert.equal(nested!.attributes['pikku.workflow.step'], undefined)
  })

  test('a throwing accessor loses that attribute only: the span ends, the tracer stays enabled, the result stands', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('accessor', { func: async () => 'result' })
    const http = {
      request: {
        method: () => {
          throw new Error('accessor exploded')
        },
      },
      response: { statusCode: 200 },
    }
    for (let i = 0; i < 2; i++) {
      assert.equal(
        await run('accessor', tracer, { trace: createTrace(), http }, 'http'),
        'result'
      )
    }
    assert.equal(tracer.spans.length, 2, 'both invocations were recorded')
    const [span] = tracer.spans
    assert.deepEqual(span!.status, { code: 'ok' })
    assert.equal(span!.attributes['http.request.method'], undefined)
    assert.equal(span!.attributes['http.response.status_code'], 200)
  })

  test('an error whose toString and message throw still ends the span and is rethrown', async () => {
    const tracer = new RecordingTracer()
    const hostile = Object.create(null)
    hostile.toString = () => {
      throw new Error('hostile toString')
    }
    addTestFunction('hostile', {
      func: async () => {
        throw hostile
      },
    })
    await assert.rejects(
      run('hostile', tracer, { trace: createTrace() }, 'rpc'),
      (e) => e === hostile
    )
    assert.equal(tracer.spans.length, 1)
    assert.equal(tracer.spans[0]!.status.code, 'error')
    const [event] = tracer.spans[0]!.events!
    assert.equal(event!.attributes!['exception.message'], '[unprintable error]')
    // The tracer was not disabled.
    await assert.rejects(
      run('hostile', tracer, { trace: createTrace() }, 'rpc')
    )
    assert.equal(tracer.spans.length, 2)
  })

  test('exception.message is the bare message, not Type: message', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('bare', {
      func: async () => {
        throw new RangeError('out of range')
      },
    })
    await assert.rejects(run('bare', tracer, { trace: createTrace() }, 'rpc'))
    const [event] = tracer.spans[0]!.events!
    assert.equal(event!.attributes!['exception.type'], 'RangeError')
    assert.equal(event!.attributes!['exception.message'], 'out of range')
    assert.equal(tracer.spans[0]!.status.message, 'RangeError: out of range')
  })
})
