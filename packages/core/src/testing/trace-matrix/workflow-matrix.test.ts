import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { pikkuState } from '../../pikku-state.js'
import {
  createTrace,
  formatTraceparent,
  parseTraceparent,
  type TraceContext,
} from '../../trace.js'
import { QueuedWorkflowHarness } from '../service-tests/queued-workflow-harness.js'
import { workflowMatrix, type Adapter, type Outcome } from './dimensions.js'
import { TRANSPORTS } from './transports.js'
import { defineRun, ScheduledSleeps, type RunCase } from './workflow-cases.js'

type Combo = Omit<RunCase, 'id'> & { adapter: Adapter }

const settledStatus = (outcome: Outcome) =>
  outcome === 'success'
    ? ['completed']
    : outcome === 'workflow-cancelled'
      ? ['cancelled', 'compensated']
      : ['failed', 'cancelled', 'compensated']

const scopedLogger = (errors: Array<string | undefined>) => {
  const make = (scope?: string): any => ({
    info() {},
    warn() {},
    debug() {},
    error: () => errors.push(scope),
    scope: (traceId: string) => make(traceId),
  })
  return make()
}

/** Runs one combination to its end and asserts the trace survived it. */
const runCombo = async ({ adapter, workflow, step, outcome }: Combo) => {
  const sleeps: Array<{ runId: string; stepId: string }> = []
  const service = new ScheduledSleeps()
  const h = new QueuedWorkflowHarness(service)
  const errors: Array<string | undefined> = []
  const singletons = pikkuState(null, 'package', 'singletonServices') as any
  singletons.logger = scopedLogger(errors)
  singletons.schedulerService = {
    scheduleRPC: async (_at: unknown, _rpc: string, data: any) => {
      sleeps.push(data)
    },
  }
  const transport = TRANSPORTS[adapter]
  h.transport = (data, options) =>
    transport.decode(transport.encode(data, options))

  const { settle } = defineRun(h, { id: 'x', workflow, step, outcome })
  const caller = createTrace()
  const traceparent = formatTraceparent(caller)
  const inline = workflow.endsWith('-inline')
  let runId: string | undefined
  // An inline run that fails throws here, with its run already stored.
  await h.ws
    .startWorkflow(
      'flow-x',
      {},
      { type: 'test', traceparent },
      h.rpc as never,
      { inline, onRunCreated: (id) => (runId = id) }
    )
    .then((started) => (runId = started.runId))
    .catch(() => {})
  assert.ok(runId, 'the run never started')
  await h.pump()
  await settle(runId, async () => {
    for (const { runId: id, stepId } of sleeps.splice(0)) {
      await h.ws.executeWorkflowSleepCompleted(id, stepId)
    }
  }).catch(() => {})

  const run = await h.run(runId)
  assert.equal(run.wire.traceparent, traceparent, 'the stored trace changed')
  assert.ok(
    settledStatus(outcome).includes(run.status),
    `the run ended ${run.status}`
  )
  const steps = h.traces.map(({ trace }) => trace as TraceContext)
  assert.ok(steps.length > 0, 'no step ran')
  for (const trace of steps) {
    assert.equal(trace.traceId, caller.traceId, 'a step left the trace')
    assert.equal(trace.parentSpanId, caller.spanId, 'steps hang off the start')
  }
  const spans = steps.map(({ spanId }) => spanId)
  assert.equal(new Set(spans).size, spans.length, 'a step reused a span')
  for (const job of h.jobTraceparents) {
    assert.equal(
      parseTraceparent(job)?.traceId,
      caller.traceId,
      'a job left the trace'
    )
  }
  for (const scope of errors) {
    assert.equal(scope, caller.traceId, 'an error logged off the trace')
  }
}

describe('adapter × workflow × step × outcome', () => {
  for (const combo of workflowMatrix().combos) {
    const label = Object.values(combo).join(' / ')
    test(label, () => runCombo(combo as unknown as Combo))
  }
})
