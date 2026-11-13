import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import {
  assertFunctionTelemetry,
  decideFunctionTrace,
  type FunctionSpans,
} from './function-telemetry.js'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import { RecordingTracer } from '../testing/recording-tracer.js'
import { createTrace, childTraceWire, type TraceContext } from '../trace.js'
import { markWorkflowStep, workflowStepOfTrace } from '../workflow-step-mark.js'
import type { Span, Tracer } from '../tracer.js'

beforeEach(() => {
  resetPikkuState()
})

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const rootTrace = (): TraceContext => createTrace()
const childOf = (parent: TraceContext): TraceContext =>
  childTraceWire(parent).trace
const unsampledChild = (): TraceContext =>
  childOf({ ...createTrace(), sampled: false })

describe('decideFunctionTrace', () => {
  test('unset and on change nothing and allocate nothing', () => {
    for (const trace of [rootTrace(), childOf(rootTrace()), unsampledChild()]) {
      assert.equal(decideFunctionTrace(undefined, trace), trace)
      assert.equal(decideFunctionTrace('on', trace), trace)
    }
  })

  test('on under an unsampled caller stays unsampled', () => {
    assert.equal(decideFunctionTrace('on', unsampledChild()).sampled, false)
  })

  test('off unsamples, keeping the ids, at the root and under a caller', () => {
    const root = rootTrace()
    const offRoot = decideFunctionTrace('off', root)
    assert.deepEqual(offRoot, { ...root, sampled: false })
    const child = childOf(root)
    const offChild = decideFunctionTrace('off', child)
    assert.deepEqual(offChild, { ...child, sampled: false })
    const already = unsampledChild()
    assert.equal(decideFunctionTrace('off', already), already)
  })

  test('always records under an unsampled caller as a root of the same trace', () => {
    const caller = unsampledChild()
    const forced = decideFunctionTrace('always', caller)
    assert.equal(forced.sampled, true)
    assert.equal(forced.traceId, caller.traceId)
    assert.equal(forced.spanId, caller.spanId)
    assert.equal(forced.parentSpanId, undefined)
  })

  test('always under a sampled caller changes nothing', () => {
    const child = childOf(rootTrace())
    assert.equal(decideFunctionTrace('always', child), child)
  })

  test('sample decides only at the head of a trace', () => {
    const never = () => 0.999
    const child = childOf(rootTrace())
    assert.equal(decideFunctionTrace({ sample: 0 }, child), child)
    const unsampled = unsampledChild()
    assert.equal(decideFunctionTrace({ sample: 1 }, unsampled), unsampled)
    const root = rootTrace()
    assert.equal(
      decideFunctionTrace({ sample: 0.5 }, root, () => 0.2),
      root
    )
    assert.equal(
      decideFunctionTrace({ sample: 0.5 }, root, never).sampled,
      false
    )
    assert.equal(
      decideFunctionTrace({ sample: 0 }, root, () => 0).sampled,
      false
    )
    assert.equal(decideFunctionTrace({ sample: 1 }, root, never), root)
  })

  test('sample keeps close to its probability over many calls', () => {
    for (const p of [0.01, 0.1, 0.25, 0.5, 0.9]) {
      const random = seeded(42)
      const n = 20000
      let kept = 0
      for (let i = 0; i < n; i++) {
        if (decideFunctionTrace({ sample: p }, rootTrace(), random).sampled) {
          kept++
        }
      }
      const tolerance = 4 * Math.sqrt((p * (1 - p)) / n)
      assert.ok(
        Math.abs(kept / n - p) < tolerance,
        `sample ${p} kept ${kept / n}`
      )
    }
  })

  test('a workflow step stays marked when its sampling changes', () => {
    const trace = childOf(rootTrace())
    markWorkflowStep(trace, { runId: 'run-1', stepId: 'step-1' })
    const off = decideFunctionTrace('off', trace)
    assert.deepEqual(workflowStepOfTrace(off), {
      runId: 'run-1',
      stepId: 'step-1',
    })
  })
})

describe('assertFunctionTelemetry', () => {
  test('accepts every valid setting', () => {
    for (const telemetry of [
      undefined,
      {},
      { spans: 'off' },
      { spans: 'on' },
      { spans: 'always' },
      { spans: { sample: 0 } },
      { spans: { sample: 0.5 } },
      { spans: { sample: 1 } },
    ]) {
      assertFunctionTelemetry('fn', telemetry)
    }
  })

  test('rejects invalid values, naming the function', () => {
    for (const telemetry of [
      null,
      'off',
      { spans: 'errors' },
      { spans: 'ON' },
      { spans: true },
      { spans: null },
      { spans: { sample: Number.NaN } },
      { spans: { sample: -0.1 } },
      { spans: { sample: 1.5 } },
      { spans: { sample: Number.POSITIVE_INFINITY } },
      { spans: { sample: '0.5' } },
      { spans: { sample: 0.5, extra: 1 } },
      { spans: {} },
      { span: 'off' },
    ]) {
      assert.throws(
        () => assertFunctionTelemetry('myFn', telemetry),
        /Function 'myFn' has an invalid telemetry/,
        JSON.stringify(telemetry)
      )
    }
  })

  test('addFunction refuses an invalid setting at registration', () => {
    assert.throws(
      () =>
        addFunction('badSample', {
          telemetry: { spans: { sample: 2 } },
          func: async () => {},
        } as any),
      /Function 'badSample' has an invalid telemetry/
    )
    assert.equal(
      pikkuState(null, 'function', 'functions').get('badSample'),
      undefined
    )
  })
})

const logger = () => {
  const lines: string[] = []
  const write = (level: string) => (message: unknown) => {
    lines.push(`${level}:${String(message)}`)
  }
  return {
    lines,
    logger: {
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      debug: write('debug'),
    },
  }
}

const countingTracer = () => {
  const recording = new RecordingTracer()
  const tracer: Tracer & { opened: number } = {
    opened: 0,
    startSpan(name, context, options) {
      tracer.opened++
      return recording.startSpan(name, context, options) as Span
    },
  }
  return { tracer, spans: recording.spans }
}

const define = (
  name: string,
  spans: FunctionSpans | undefined,
  func: (services: any, data: any, wire: any) => Promise<unknown>
) => {
  addFunction(name, {
    ...(spans === undefined ? {} : { telemetry: { spans } }),
    func,
  } as any)
  pikkuState(null, 'function', 'meta')[name] = {
    pikkuFuncId: name,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }
  pikkuState(null, 'rpc', 'meta')[name] = name
}

const run = (
  name: string,
  singletonServices: Record<string, unknown>,
  wire: Record<string, unknown> = {}
) =>
  runPikkuFunc('rpc', `wire-${name}`, name, {
    singletonServices: singletonServices as any,
    data: () => ({}),
    auth: false,
    wire,
  })

describe('runPikkuFunc with telemetry.spans', () => {
  test('off at the root builds no span objects for it or its rpc children', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    let childTrace: TraceContext | undefined
    define('leaf', undefined, async (_s, _d, wire) => {
      childTrace = wire.trace
    })
    define('quiet', 'off', async (_s, _d, wire) => wire.rpc.invoke('leaf', {}))
    await run('quiet', { logger: log, tracer })
    assert.equal(tracer.opened, 0)
    assert.equal(spans.length, 0)
    assert.equal(childTrace!.sampled, false)
  })

  test('a job enqueued by an off function carries an unsampled traceparent, and by an always one a sampled one', async () => {
    for (const [spans, flags, opened] of [
      ['off', '00', 0],
      ['always', '01', 2],
    ] as const) {
      resetPikkuState()
      const { tracer } = countingTracer()
      const { logger: log } = logger()
      const added: any[] = []
      const queueService = {
        supportsResults: false,
        add: async (...args: unknown[]) => (added.push(args), 'job-1'),
        getJob: async () => null,
      }
      define('publisher', spans, async (services) => {
        await services.queueService.add('emails', { to: 'x' })
      })
      await run('publisher', { logger: log, tracer, queueService })
      assert.equal(added.length, 1)
      assert.match(added[0][2].traceparent, new RegExp(`-${flags}$`))
      assert.equal(tracer.opened, opened)
    }
  })

  test('off restores the caller wire trace after the call', async () => {
    const { tracer } = countingTracer()
    const { logger: log } = logger()
    define('quiet', 'off', async () => {})
    const trace = rootTrace()
    const wire = { trace, traceId: trace.traceId }
    await run('quiet', { logger: log, tracer }, wire)
    assert.equal(wire.trace, trace)
    assert.equal(trace.sampled, true)
  })

  test('on under an off parent records nothing', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    define('child', 'on', async () => {})
    define('parent', 'off', async (_s, _d, wire) =>
      wire.rpc.invoke('child', {})
    )
    await run('parent', { logger: log, tracer })
    assert.equal(tracer.opened, 0)
    assert.equal(spans.length, 0)
  })

  test('a head-sampled-out parent is followed by its children', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    define('child', { sample: 1 }, async () => {})
    define('parent', { sample: 0 }, async (_s, _d, wire) =>
      wire.rpc.invoke('child', {})
    )
    await run('parent', { logger: log, tracer })
    assert.equal(tracer.opened, 0)
    assert.equal(spans.length, 0)
  })

  test('sample 1 at the root records the call and its children', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    define('child', undefined, async () => {})
    define('parent', { sample: 1 }, async (_s, _d, wire) =>
      wire.rpc.invoke('child', {})
    )
    await run('parent', { logger: log, tracer })
    const byName = Object.fromEntries(spans.map((s) => [s.name, s]))
    assert.equal(spans.length, 2)
    assert.equal(byName.child!.parentSpanId, byName.parent!.spanId)
  })

  test('always under an off parent records itself and its children, not the parent', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    define('grandchild', undefined, async () => {})
    define('forced', 'always', async (_s, _d, wire) =>
      wire.rpc.invoke('grandchild', {})
    )
    define('parent', 'off', async (_s, _d, wire) =>
      wire.rpc.invoke('forced', {})
    )
    const trace = rootTrace()
    await run(
      'parent',
      { logger: log, tracer },
      {
        trace,
        traceId: trace.traceId,
      }
    )
    const byName = Object.fromEntries(spans.map((s) => [s.name, s]))
    assert.deepEqual(Object.keys(byName).sort(), ['forced', 'grandchild'])
    assert.equal(byName.forced!.traceId, trace.traceId)
    assert.equal(byName.forced!.parentSpanId, undefined)
    assert.equal(
      byName.forced!.attributes['pikku.trace.unrecorded_parent_span_id'],
      trace.spanId
    )
    assert.equal(byName.grandchild!.traceId, trace.traceId)
    assert.equal(byName.grandchild!.parentSpanId, byName.forced!.spanId)
    assert.equal(
      byName.grandchild!.attributes['pikku.trace.unrecorded_parent_span_id'],
      undefined
    )
  })

  test('off under an always parent builds no span objects for that child', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    let leafTrace: TraceContext | undefined
    define('leaf', 'always', async (_s, _d, wire) => {
      leafTrace = wire.trace
    })
    define('quietChild', 'off', async (_s, _d, wire) => {
      await wire.rpc.invoke('leaf', {})
    })
    define('forced', 'always', async (_s, _d, wire) =>
      wire.rpc.invoke('quietChild', {})
    )
    define('parent', 'off', async (_s, _d, wire) =>
      wire.rpc.invoke('forced', {})
    )
    await run('parent', { logger: log, tracer })
    const names = spans.map((s) => s.name).sort()
    assert.deepEqual(names, ['forced', 'leaf'])
    assert.equal(tracer.opened, 2)
    assert.equal(leafTrace!.parentSpanId, undefined)
  })

  test('always under a sampled parent is an ordinary child', async () => {
    const { tracer, spans } = countingTracer()
    const { logger: log } = logger()
    define('child', 'always', async () => {})
    define('parent', undefined, async (_s, _d, wire) =>
      wire.rpc.invoke('child', {})
    )
    await run('parent', { logger: log, tracer })
    const byName = Object.fromEntries(spans.map((s) => [s.name, s]))
    assert.equal(byName.child!.parentSpanId, byName.parent!.spanId)
    assert.equal(
      byName.child!.attributes['pikku.trace.unrecorded_parent_span_id'],
      undefined
    )
  })

  test('the generated meta setting applies when the config has none', async () => {
    const { tracer } = countingTracer()
    const { logger: log } = logger()
    define('fromMeta', undefined, async () => {})
    pikkuState(null, 'function', 'meta').fromMeta!.telemetry = {
      spans: 'off',
    }
    await run('fromMeta', { logger: log, tracer })
    assert.equal(tracer.opened, 0)
  })
})

describe('telemetry.spans leaves everything but spans alone', () => {
  const observe = async (spans: FunctionSpans | undefined, fail: boolean) => {
    const { tracer } = countingTracer()
    const { logger: log, lines } = logger()
    const audited: any[] = []
    const analytics: any[] = []
    let invocations = 0
    const error = new Error('boom')
    define('observed', spans, async (services) => {
      invocations++
      services.logger.info('working')
      await services.auditLog.write({ type: 'did', source: 'explicit' })
      await services.analytics.record({ name: 'clicked' })
      if (fail) throw error
      return 'done'
    })
    pikkuState(null, 'function', 'functions').get('observed')!.audit = {
      durability: 'transactional',
    }
    const trace = rootTrace()
    let outcome: unknown
    try {
      outcome = await run(
        'observed',
        {
          logger: log,
          tracer,
          audit: { audit: async (event: unknown) => audited.push(event) },
          analyticsService: {
            write: async (batch: unknown[]) => analytics.push(...batch),
          },
        },
        { trace, traceId: trace.traceId }
      )
    } catch (caught) {
      outcome = caught
    }
    const strip = (records: any[]) =>
      records.map(
        ({ occurredAt, at, timestamp, eventId, traceId, ...rest }) => rest
      )
    return {
      invocations,
      lines,
      audited: strip(audited),
      analytics: strip(analytics),
      outcome: outcome === error ? 'the same error' : outcome,
      onTheCallersTrace: [...audited, ...analytics].every(
        (record) => record.traceId === trace.traceId
      ),
      spans: tracer.opened,
    }
  }

  for (const fail of [false, true]) {
    test(`logs, audit, analytics, invocations and ${fail ? 'the error' : 'the result'} are the same for every setting`, async () => {
      const baseline = await observe(undefined, fail)
      assert.equal(baseline.spans, 1)
      assert.equal(baseline.invocations, 1)
      assert.equal(baseline.audited.length, 1)
      assert.equal(baseline.analytics.length, 1)
      assert.equal(baseline.outcome, fail ? 'the same error' : 'done')
      assert.equal(baseline.onTheCallersTrace, true)
      for (const spans of [
        'off',
        'on',
        'always',
        { sample: 0 },
        { sample: 1 },
      ] as FunctionSpans[]) {
        resetPikkuState()
        const { spans: opened, ...seen } = await observe(spans, fail)
        assert.equal(
          opened,
          spans === 'off' || (typeof spans === 'object' && spans.sample === 0)
            ? 0
            : 1,
          JSON.stringify(spans)
        )
        const { spans: _baseSpans, ...base } = baseline
        assert.deepEqual(seen, base, JSON.stringify(spans))
      }
    })
  }
})
