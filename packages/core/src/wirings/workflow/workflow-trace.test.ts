import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'
import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { pikkuState } from '../../pikku-state.js'
import { parseTraceparent } from '../../trace.js'
import { addWorkflow } from './dsl/workflow-runner.js'

const STARTED = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`
const TRACE_ID = 'a'.repeat(32)
const SPAN_ID = 'b'.repeat(16)
const wire = { type: 'http', traceparent: STARTED }
const inline = { inline: true }

const setup = () => new QueuedWorkflowHarness(new InMemoryWorkflowService())

/**
 * Everything the run did stayed on the trace it started on: every job carries
 * it, and each hop is a new span whose parent is the span that started the run.
 */
const assertOnTrace = async (
  h: QueuedWorkflowHarness,
  runId: string,
  minimumHops = 1,
  traceparent = STARTED
) => {
  const run = await h.run(runId)
  assert.equal(run.wire.traceparent, traceparent)
  const started = parseTraceparent(traceparent)!
  assert.ok(h.traces.length >= minimumHops, `saw ${h.traces.length} hops`)
  for (const { rpc, trace } of h.traces) {
    assert.ok(trace, `${rpc} ran without a trace`)
    assert.equal(trace.traceId, started.traceId, rpc)
    assert.equal(trace.parentSpanId, started.parentSpanId, rpc)
    assert.notEqual(trace.spanId, started.parentSpanId, rpc)
  }
  const spans = h.traces.map(({ trace }) => trace.spanId)
  assert.equal(new Set(spans).size, spans.length, 'each hop has its own span')
  for (const job of h.jobTraceparents) assert.equal(job, traceparent)
}

const flakyOnce = () => {
  let calls = 0
  return {
    forward: async () => {
      if (++calls === 1) throw new Error('flaky')
      return {}
    },
  }
}

describe('a workflow run keeps one trace', () => {
  describe('starting', () => {
    test('a wire with no trace, like a trigger, gets a new one and keeps it', async () => {
      const h = setup()
      h.register('a', h.ok())
      h.register('b', h.ok())
      h.defineDsl('flow', async (w) => {
        await w.do('A', 'a', {})
        await w.do('B', 'b', {})
      })
      const runId = await h.start('flow', {}, { type: 'trigger' })
      const { traceparent } = (await h.run(runId)).wire
      assert.ok(parseTraceparent(traceparent), traceparent)
      await assertOnTrace(h, runId, 2, traceparent)
    })

    test('an invalid traceparent on the wire is replaced', async () => {
      const h = setup()
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => w.do('A', 'a', {}))
      const runId = await h.start('flow', {}, { type: 'x', traceparent: 'no' })
      const { traceparent } = (await h.run(runId)).wire
      assert.ok(parseTraceparent(traceparent))
      await assertOnTrace(h, runId, 1, traceparent)
    })

    test('the caller rpc trace is used when the wire has none', async () => {
      const h = setup()
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => w.do('A', 'a', {}))
      ;(h.rpc as any).traceparent = STARTED
      const runId = await h.start('flow', {}, { type: 'internal' })
      await assertOnTrace(h, runId, 1)
    })

    test('runToCompletion keeps the caller trace', async () => {
      const h = setup()
      h.register('a', { ...h.ok(), queued: false })
      h.defineDsl('flow', async (w) => w.do('A', 'a', {}))
      ;(h.rpc as any).traceparent = STARTED
      await h.ws.runToCompletion('flow', {}, h.rpc as never)
      assert.equal(h.traces[0]!.trace.traceId, TRACE_ID)
    })
  })

  for (const [mode, options] of [
    ['queued', undefined],
    ['inline', inline],
  ] as const) {
    const queued = mode === 'queued'

    describe(`DSL, ${mode}`, () => {
      test('rpc steps, a branch and a parallel fan-out', async () => {
        const h = setup()
        for (const name of ['a', 'left', 'right', 'p1', 'p2', 'p3']) {
          h.register(name, { ...h.ok({ go: 'left' }), queued })
        }
        h.defineDsl('flow', async (w) => {
          const { go } = await w.do('A', 'a', {})
          await w.do('Branch', go, {})
          await Promise.all(
            ['p1', 'p2', 'p3'].map((name) => w.do(name, name, {}))
          )
        })
        const runId = await h.start('flow', {}, wire, options)
        assert.equal((await h.run(runId)).status, 'completed')
        await assertOnTrace(h, runId, 5)
      })

      test('a retry stays on the trace in a new span', async () => {
        const h = setup()
        h.register('flaky', { ...flakyOnce(), queued })
        h.defineDsl('flow', async (w) =>
          w.do('Flaky', 'flaky', {}, { retries: 2 })
        )
        const runId = await h.start('flow', {}, wire, options)
        assert.equal((await h.run(runId)).status, 'completed')
        assert.equal(h.traces.filter((t) => t.rpc === 'flaky').length, 2)
        await assertOnTrace(h, runId, 2)
      })

      test('compensation runs on the trace', async () => {
        const h = setup()
        h.register('a', { ...h.undoable(), queued })
        h.register('b', { ...h.boom(), queued })
        h.defineDsl('flow', async (w) => {
          await w.do('A', 'a', {})
          await w.do('B', 'b', {})
        })
        await h.start('flow', {}, wire, options).catch(() => {})
        assert.deepEqual(h.undone, ['undo:a'])
        assert.ok(h.traces.length >= 3)
        for (const { rpc, trace } of h.traces) {
          assert.equal(trace?.traceId, TRACE_ID, rpc)
          assert.equal(trace?.parentSpanId, SPAN_ID, rpc)
        }
      })

      test('the workflow body runs on the trace', async () => {
        const h = setup()
        h.register('a', { ...h.ok(), queued })
        let bodyTrace: any
        h.defineDsl('seen', async (w) => w.do('A', 'a', {}))
        addWorkflow('seen', {
          func: async (_s: any, _i: any, runWire: any) => {
            bodyTrace = runWire.trace
            return runWire.workflow.do('A', 'a', {})
          },
        } as never)
        await h.start('seen', {}, wire, options)
        assert.equal(bodyTrace.traceId, TRACE_ID)
        assert.equal(bodyTrace.parentSpanId, SPAN_ID)
      })

      test('a child workflow inherits the trace', async () => {
        const h = setup()
        h.register('c', { ...h.ok(), queued })
        h.defineDsl('child', async (w) => w.do('C', 'c', {}))
        h.defineDsl('parent', async (w) => w.do('Child', 'child', {}))
        const runId = await h.start('parent', {}, wire, options)
        assert.equal((await h.run(runId)).status, 'completed')
        const childRunId = (await h.ws.getRunHistory(runId)).find(
          (s) => s.childRunId
        )?.childRunId
        assert.ok(childRunId)
        await assertOnTrace(h, childRunId, 1)
      })
    })

    describe(`graph, ${mode}`, () => {
      test('nodes, a parallel split and a join', async () => {
        const h = setup()
        for (const name of ['a', 'b', 'c', 'd']) {
          h.register(name, { ...h.ok(), queued })
        }
        h.defineGraph('g', 'a', {
          a: { next: ['b', 'c'] },
          b: { next: 'd' },
          c: {},
          d: {},
        })
        const runId = await h.start('g', {}, wire, options)
        assert.equal((await h.run(runId)).status, 'completed')
        await assertOnTrace(h, runId, 4)
      })

      // An inline graph node has no retry loop.
      test(
        'a retried node stays on the trace in a new span',
        { skip: !queued },
        async () => {
          const h = setup()
          h.register('flaky', { ...flakyOnce(), queued })
          h.defineGraph('g', 'flaky', { flaky: { retries: 2 } })
          const runId = await h.start('g', {}, wire, options)
          assert.equal((await h.run(runId)).status, 'completed')
          assert.equal(h.traces.length, 2)
          await assertOnTrace(h, runId, 2)
        }
      )

      test('compensation runs on the trace', async () => {
        const h = setup()
        h.register('a', { ...h.undoable(), queued })
        h.register('b', { ...h.boom(), queued })
        h.defineGraph('g', 'a', { a: { next: 'b' }, b: {} })
        const runId = await h.start('g', {}, wire, options)
        assert.deepEqual(h.undone, ['undo:a'])
        await assertOnTrace(h, runId, 3)
      })

      test('a child workflow node inherits the trace', async () => {
        const h = setup()
        h.register('c', { ...h.ok(), queued })
        h.defineDsl('child', async (w) => w.do('C', 'c', {}))
        h.defineGraph('g', 'child', { child: {} })
        const runId = await h.start('g', {}, wire, options)
        assert.equal((await h.run(runId)).status, 'completed')
        const childRunId = (await h.ws.getRunHistory(runId)).find(
          (s) => s.childRunId
        )?.childRunId
        assert.ok(childRunId)
        await assertOnTrace(h, childRunId, 1)
      })
    })
  }

  describe('waiting', () => {
    test('a sleep schedules its wake-up on the trace', async () => {
      // The in-memory service arms its own timer; use the scheduler path.
      class ScheduledSleeps extends InMemoryWorkflowService {
        protected override scheduleSleep(
          ...args: [string, string, number | string]
        ) {
          return PikkuWorkflowService.prototype['scheduleSleep'].apply(
            this,
            args
          )
        }
      }
      const h = new QueuedWorkflowHarness(new ScheduledSleeps())
      const scheduled: any[][] = []
      pikkuState(null, 'package', 'singletonServices', {
        ...pikkuState(null, 'package', 'singletonServices'),
        schedulerService: {
          scheduleRPC: async (...args: any[]) => {
            scheduled.push(args)
            return 'task'
          },
        },
      } as never)
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => {
        await w.sleep('Nap', 1000)
        await w.do('A', 'a', {})
      })
      const runId = await h.start('flow', {}, wire)
      assert.equal(scheduled.length, 1)
      assert.equal(scheduled[0]![4], STARTED, 'the timer carries the trace')

      const { stepId } = scheduled[0]![2]
      await h.ws.executeWorkflowSleepCompleted(runId, stepId)
      await h.pump()
      assert.equal((await h.run(runId)).status, 'completed')
      await assertOnTrace(h, runId, 1)
    })

    test('a suspended run resumes on the trace', async () => {
      const h = setup()
      let released = false
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => {
        if (!released) await w.suspend('Hold')
        await w.do('A', 'a', {})
      })
      const runId = await h.start('flow', {}, wire)
      assert.equal((await h.run(runId)).status, 'suspended')
      released = true
      await h.ws.resumeWorkflow(runId)
      await h.pump()
      assert.equal((await h.run(runId)).status, 'completed')
      await assertOnTrace(h, runId, 1)
    })

    test('an approval resumes on the trace', async () => {
      const h = setup()
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => {
        await w.approval('Sign off', {
          schema: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: (value: unknown) => ({ value }),
            },
          },
        })
        await w.do('A', 'a', {})
      })
      const runId = await h.start('flow', {}, wire)
      assert.equal((await h.run(runId)).status, 'suspended')
      await h.ws.approveStep(runId, 'Sign off', { ok: true })
      await h.pump()
      assert.equal((await h.run(runId)).status, 'completed')
      await assertOnTrace(h, runId, 1)
    })
  })

  describe('durability', () => {
    test('a stalled run is recovered on the trace', async () => {
      const h = setup()
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => w.do('A', 'a', {}))
      h.dropWhen = () => true
      const runId = await h.start('flow', {}, wire)
      h.dropWhen = undefined
      h.jobTraceparents = []
      const past = new Date(Date.now() - 3_600_000)
      ;(await h.run(runId)).updatedAt = past
      const { resumed } = await h.ws.recoverStalledRuns()
      assert.deepEqual(resumed, [runId])
      await h.pump()
      assert.equal((await h.run(runId)).status, 'completed')
      assert.ok(h.jobTraceparents.length > 0)
      await assertOnTrace(h, runId, 1)
    })

    test('an undispatched step is re-dispatched on the trace', async () => {
      const h = setup()
      h.register('a', h.ok())
      h.defineDsl('flow', async (w) => w.do('A', 'a', {}))
      const runId = await h.ws.createRun('flow', {}, false, 'flow-hash', wire)
      // The row committed; the process died before the job was enqueued.
      await h.ws.insertStepState(runId, 'A', 'a', {})
      const { redispatched } = await h.ws.relayUndispatchedSteps({
        undispatchedAfterMs: -1000,
      })
      assert.deepEqual(redispatched, [runId])
      await h.pump()
      assert.equal((await h.run(runId)).status, 'completed')
      assert.ok(h.jobTraceparents.length > 0)
      await assertOnTrace(h, runId, 1)
    })
  })
})
