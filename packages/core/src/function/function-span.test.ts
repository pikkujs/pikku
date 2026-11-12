import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { openFunctionSpan, runInFunctionSpan } from './function-span.js'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import type { CoreServices } from '../types/core.types.js'
import { MissingSessionError } from '../errors/errors.js'
import { RecordingTracer } from '../testing/recording-tracer.js'
import { decodeTraces } from '../testing/otlp-decoder.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  childTraceWire,
  createTrace,
  formatTraceparent,
  type TraceContext,
} from '../trace.js'
import {
  asContextStorage,
  createRuntimeTelemetry,
} from '../otlp/runtime-telemetry.js'
import { runTraceWire } from '../wirings/workflow/workflow-run-trace.js'
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

  test('a versioned function carries its version as an int; an unversioned one carries none', async () => {
    const requests: Uint8Array[] = []
    const telemetry = createRuntimeTelemetry(
      { PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:1/v1/otlp' },
      {
        logger: mockSingletonServices.logger,
        serviceName: 'svc',
        contextStorage: asContextStorage(new AsyncLocalStorage()),
        fetch: (async (_url: string, init: RequestInit) => {
          requests.push(init.body as Uint8Array)
          return new Response(null, { status: 200 })
        }) as never,
      }
    )
    telemetry.stopMetrics()
    const recording = new RecordingTracer()
    addTestFunction('foo@v2', { func: async () => 1 })
    addTestFunction('foo', { func: async () => 1 })
    await run('foo@v2', recording)
    await run('foo', recording)
    assert.strictEqual(recording.spans[0]!.attributes['pikku.function.version'], 2)
    assert.ok(!('pikku.function.version' in recording.spans[1]!.attributes))

    await run('foo@v2', telemetry.tracer)
    await run('foo', telemetry.tracer)
    await telemetry.close()
    const spans = requests.flatMap((body) => {
      try {
        return decodeTraces(body).items
      } catch {
        return []
      }
    })
    const versioned = spans.find((span) => span.name === 'foo@v2')!
    const plain = spans.find((span) => span.name === 'foo')!
    assert.deepStrictEqual(versioned.attributes['pikku.function.version'], {
      int: 2n,
    })
    assert.ok(!('pikku.function.version' in plain.attributes))
  })

  test('a wire with no trace makes a root span', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('root', { func: async () => 1 })
    await run('root', tracer)
    assert.equal(tracer.spans[0]!.attributes['pikku.trace.root'], true)
    assert.equal(tracer.spans[0]!.parentSpanId, undefined)
  })

  test('a workflow step is a consumer span with the run and step; a call it makes is not', async () => {
    const tracer = new RecordingTracer()
    addTestFunction('inner', { func: async () => 'inner' })
    addTestFunction('stepFn', {
      func: async (_s: unknown, _d: unknown, wire: any) =>
        run('inner', tracer, {
          ...wire,
          trace: childTraceWire(wire.trace).trace,
        }),
    })
    const stepWire = runTraceWire(formatTraceparent(createTrace()), {
      runId: 'run-1',
      stepId: 'step-1',
    })
    await run('stepFn', tracer, stepWire)

    const byName = Object.fromEntries(tracer.spans.map((s) => [s.name, s]))
    assert.equal(byName.stepFn!.kind, 'consumer')
    assert.equal(byName.stepFn!.attributes['pikku.workflow.step'], 'step-1')
    assert.equal(byName.stepFn!.attributes['pikku.workflow.run_id'], 'run-1')
    assert.equal(byName.inner!.kind, 'internal')
    assert.equal(byName.inner!.attributes['pikku.workflow.step'], undefined)
  })

  test('a function that publishes to a queue leaves a producer span under its own', async () => {
    const tracer = new RecordingTracer()
    const added: any[] = []
    addTestFunction('publisher', {
      func: async (services: any) => {
        await services.queueService.add('emails', { to: 'x' })
      },
    })
    const queueService = {
      supportsResults: false,
      add: async (...args: unknown[]) => (added.push(args), 'job-1'),
      getJob: async () => null,
    }
    await runPikkuFunc('rpc', 'wire-publisher', 'publisher', {
      singletonServices: { ...mockSingletonServices, tracer, queueService },
      getAllServices: () => ({ ...mockServices, tracer, queueService }) as any,
      data: () => ({}),
      auth: false,
      wire: { trace: createTrace() },
    } as any)

    const byName = Object.fromEntries(tracer.spans.map((s) => [s.name, s]))
    assert.equal(tracer.spans.length, 2)
    assert.equal(
      byName['queue.publish emails']!.parentSpanId,
      byName.publisher!.spanId
    )
    assert.equal(
      added[0][2].traceparent,
      `00-${byName['queue.publish emails']!.traceId}-${byName['queue.publish emails']!.spanId}-01`
    )
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

  test('the user and org are on the span when it opens, not only when it ends', async () => {
    const started: Array<Record<string, unknown>> = []
    class StartCapturingTracer extends RecordingTracer {
      override startSpan(
        ...args: Parameters<RecordingTracer['startSpan']>
      ): ReturnType<RecordingTracer['startSpan']> {
        started.push({ ...(args[2]?.attributes ?? {}) })
        return super.startSpan(...args)
      }
    }
    const tracer = new StartCapturingTracer()
    addTestFunction('identified', { func: async () => 1 })
    await run('identified', tracer, {
      trace: createTrace(),
      pikkuUserId: 'u1',
      session: { userId: 'u1', orgId: 'org_1' },
    })
    await run('identified', tracer, { trace: createTrace() })
    assert.equal(started[0]!['pikku.user.id'], 'u1')
    assert.equal(started[0]!['pikku.org.id'], 'org_1')
    assert.ok(!('pikku.user.id' in started[1]!))
    assert.ok(!('pikku.org.id' in started[1]!))
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

  test('a service with no wire parents its client span on the function span through currentContext', async () => {
    const tracer = new RecordingTracer({
      contextStorage: asContextStorage(new AsyncLocalStorage<TraceContext>()),
    })
    const startupService = {
      call: async () => {
        const parent = tracer.currentContext()
        if (!parent) return
        tracer
          .startSpan('HTTP GET', childTraceWire(parent).trace, {
            kind: 'client',
          })
          .end({ code: 'ok' })
      },
    }
    addTestFunction('egress', {
      func: async () => {
        await startupService.call()
        return 'v'
      },
    })
    const trace = createTrace()
    assert.equal(await run('egress', tracer, { trace }), 'v')
    await startupService.call()
    const client = tracer.spans.filter((s) => s.kind === 'client')
    assert.equal(client.length, 1)
    assert.equal(client[0]!.traceId, trace.traceId)
    assert.equal(client[0]!.parentSpanId, trace.spanId)
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

  test('a runInSpan that returns without running the function: it still runs once and the tracer is disabled', async () => {
    let runs = 0
    let calls = 0
    const inner = new RecordingTracer()
    const tracer: Tracer = {
      startSpan: (n, c, o) => inner.startSpan(n, c, o),
      runInSpan: () => {
        calls++
        return Promise.resolve('skipped') as any
      },
    }
    addTestFunction('skipme', {
      func: async () => {
        runs++
        return 'r'
      },
    })
    assert.equal(await run('skipme', tracer, { trace: createTrace() }), 'r')
    assert.equal(runs, 1)
    assert.equal(await run('skipme', tracer, { trace: createTrace() }), 'r')
    assert.equal(runs, 2)
    assert.equal(calls, 1, 'a disabled tracer is not asked again')
  })

  describe('fn runs once and the caller gets exactly its outcome', () => {
    const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
    const tracers: Record<string, (fn: () => any) => any> = {
      'sync call': (fn) => fn(),
      'microtask defer': (fn) => Promise.resolve().then(() => fn()),
      'setTimeout defer': (fn) =>
        new Promise((r, j) =>
          setTimeout(() => {
            Promise.resolve(fn()).then(r, j)
          }, 5)
        ),
      'never calls': () => Promise.resolve('DIFF'),
      'throws before': () => {
        throw new Error('before')
      },
      'throws after': (fn) => {
        fn().catch(() => {})
        throw new Error('after')
      },
      'calls twice': (fn) => {
        fn().catch(() => {})
        return fn()
      },
      'returns a different value': (fn) => {
        fn().catch(() => {})
        return Promise.resolve('DIFF')
      },
      'calls then awaits': async (fn) => {
        const r = await fn()
        return r
      },
      'async throws after': async (fn) => {
        await fn().catch(() => {})
        throw new Error('async after')
      },
    }
    const fns: Record<string, () => Promise<string>> = {
      resolves: async () => 'R',
      rejects: async () => {
        throw new Error('fn-rejected')
      },
      'throws synchronously': (() => {
        throw new Error('fn-sync')
      }) as any,
    }
    for (const [tname, runInSpan] of Object.entries(tracers)) {
      for (const [fname, body] of Object.entries(fns)) {
        test(`${tname} x fn ${fname}`, async () => {
          const unhandled: unknown[] = []
          const onUnhandled = (e: unknown) => unhandled.push(e)
          process.on('unhandledRejection', onUnhandled)
          try {
            let runs = 0
            const inner = new RecordingTracer()
            const tracer: Tracer = {
              startSpan: (n, c, o) => inner.startSpan(n, c, o),
              runInSpan: (_s, fn) => runInSpan(fn),
            }
            const id = `o-${tname}-${fname}`
            addTestFunction(id, {
              func: (async () => {
                runs++
                return body()
              }) as any,
            })
            const outcome = await run(id, tracer, {
              trace: createTrace(),
            }).then(
              (v: unknown) => ({ ok: v }),
              (e: Error) => ({ err: e.message })
            )
            await tick(30)
            assert.equal(runs, 1)
            assert.deepEqual(
              outcome,
              fname === 'resolves'
                ? { ok: 'R' }
                : { err: fname === 'rejects' ? 'fn-rejected' : 'fn-sync' }
            )
            assert.deepEqual(unhandled, [])
          } finally {
            process.off('unhandledRejection', onUnhandled)
          }
        })
      }
    }
  })

  test('runInFunctionSpan: a synchronously throwing fn rejects, once', async () => {
    let runs = 0
    const inner = new RecordingTracer()
    const tracer: Tracer = {
      startSpan: (n, c, o) => inner.startSpan(n, c, o),
      runInSpan: (_s, fn) => fn(),
    }
    const logger = { info() {}, warn() {}, error() {}, debug() {} } as any
    const open = openFunctionSpan(
      tracer,
      logger,
      { trace: createTrace() } as any,
      'rpc',
      {}
    )
    await assert.rejects(
      runInFunctionSpan(open, (() => {
        runs++
        throw new Error('sync')
      }) as any),
      /sync/
    )
    assert.equal(runs, 1)
  })

  test('runInFunctionSpan: a non-promise fn result with a rejecting tracer is the result, tracer disabled', async () => {
    const inner = new RecordingTracer()
    let calls = 0
    const tracer: Tracer = {
      startSpan: (n, c, o) => inner.startSpan(n, c, o),
      runInSpan: (_s, fn) => {
        calls++
        fn()
        return Promise.reject(new Error('tracer')) as any
      },
    }
    const logger = { info() {}, warn() {}, error() {}, debug() {} } as any
    const open = openFunctionSpan(
      tracer,
      logger,
      { trace: createTrace() } as any,
      'rpc',
      {}
    )
    assert.equal(await runInFunctionSpan(open, (() => 'plain') as any), 'plain')
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(await runInFunctionSpan(open, (() => 'plain') as any), 'plain')
    assert.equal(calls, 1)
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
