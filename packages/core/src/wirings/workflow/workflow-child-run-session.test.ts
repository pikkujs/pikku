import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

const registerChildWorkflow = (name: string) => {
  pikkuState(null, 'workflows', 'meta', {
    [name]: { name, pikkuFuncId: name, source: 'dsl', graphHash: 'h' },
  } as any)
  pikkuState(null, 'workflows', 'registrations').set(name, {
    name,
    func: async () => undefined,
  } as any)
  pikkuState(null, 'function', 'meta', {
    [name]: {
      pikkuFuncId: name,
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    },
  } as any)
  pikkuState(null, 'function', 'functions').set(name, {
    func: async () => undefined,
  } as any)
}

/**
 * A step whose rpcName names a workflow starts that workflow as a child. The
 * child's wire is built by the parent, so whatever identifies the caller has to
 * be copied across explicitly — nothing else carries it.
 */
describe('a child workflow inherits the parent run wire pikkuUserId', () => {
  const startParentWithChildStep = async (pikkuUserId?: string) => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
    } as any)
    registerChildWorkflow('childFlow')

    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('parentFlow', {}, true, '', {
      type: 'test',
      ...(pikkuUserId ? { pikkuUserId } : {}),
    })
    ws.registerInlineRun(runId)
    await ws.insertStepState(runId, 'callChild', 'childFlow', {})

    await (ws as any).rpcStep(runId, 'callChild', 'childFlow', {}, {})
    return ws
  }

  const childRunWire = async (ws: InMemoryWorkflowService) => {
    const runs: any[] = []
    for (const id of (ws as any).runs?.keys?.() ?? []) {
      const run = await ws.getRun(id)
      if (run?.workflow === 'childFlow') runs.push(run)
    }
    assert.equal(runs.length, 1, 'exactly one child run should have started')
    return runs[0]!.wire
  }

  test('the child run wire carries the parent pikkuUserId', async () => {
    const ws = await startParentWithChildStep('user-abc')

    assert.equal(
      (await childRunWire(ws)).pikkuUserId,
      'user-abc',
      'a child started from a step must inherit who the parent was running as'
    )
  })

  test('no pikkuUserId is invented when the parent has none', async () => {
    const ws = await startParentWithChildStep()

    assert.equal((await childRunWire(ws)).pikkuUserId, undefined)
  })

  test('the child records its parent', async () => {
    const ws = await startParentWithChildStep('user-abc')
    const wire = await childRunWire(ws)

    assert.equal(wire.type, 'workflow')
    assert.equal(wire.id, 'childFlow')
    assert.ok(wire.parentRunId, 'the child must name the run that started it')
  })
})

/**
 * Queuing a child workflow is only worth anything if the parent comes back with
 * the child's output. The routing tests assert which way a step goes; this
 * asserts what the parent is left holding once the child it queued has ended.
 */
describe('a queued child workflow hands its output back to the parent step', () => {
  const CHILD_OUTPUT = { invoiceId: 'inv-42' }

  const setup = async () => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
      queueService: { add: async () => {} },
    } as any)
    registerChildWorkflow('childFlow')
    pikkuState(null, 'function', 'functions').set('childFlow', {
      func: async () => CHILD_OUTPUT,
    } as any)

    const ws = new InMemoryWorkflowService()
    const parentRunId = await ws.createRun('parentFlow', {}, false, '', {
      type: 'test',
    })
    const step = await ws.insertStepState(
      parentRunId,
      'callChild',
      'childFlow',
      {}
    )
    const stepId = (step as any).stepId ?? (step as any).id
    assert.ok(stepId, 'the parent step must have an id to hand back to')
    return { ws, parentRunId, stepId }
  }

  const childRunIdOf = async (ws: InMemoryWorkflowService) => {
    for (const id of (ws as any).runs?.keys?.() ?? []) {
      const run = await ws.getRun(id)
      if (run?.workflow === 'childFlow') return run.id
    }
    throw new Error('no child run was started')
  }

  test('the parent step carries the child output once the child completes', async () => {
    const { ws, parentRunId, stepId } = await setup()

    // The step worker that picked the queued job off runs this; it starts the
    // child and unwinds the parent rather than waiting on it.
    await (ws as any).executeWorkflowStepInner(
      parentRunId,
      'callChild',
      'childFlow',
      {},
      {}
    )

    const childRunId = await childRunIdOf(ws)
    const childRun = await ws.getRun(childRunId)
    assert.equal(
      childRun?.wire?.parentStepId,
      stepId,
      'the child must name the step it has to hand its output back to'
    )

    await ws.updateRunStatus(childRunId, 'completed', CHILD_OUTPUT)
    await (ws as any).onChildWorkflowCompleted(
      await ws.getRun(childRunId),
      CHILD_OUTPUT
    )

    const steps = await ws.getRunSteps(parentRunId)
    const callChild = steps.find((s: any) => s.stepName === 'callChild')
    assert.deepEqual(
      callChild?.result,
      CHILD_OUTPUT,
      'the parent step must end up holding what the child returned'
    )
  })
})
