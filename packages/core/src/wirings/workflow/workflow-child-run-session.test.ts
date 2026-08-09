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
