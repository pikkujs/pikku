import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { InMemoryWorkflowService } from '../in-memory-workflow-service.js'
import type { WorkflowRuntimeMeta } from '../workflow.types.js'
import { executeGraphStep, runWorkflowGraph } from './graph-runner.js'

const meta: WorkflowRuntimeMeta = {
  name: 'parentGraph',
  pikkuFuncId: 'parentGraph',
  source: 'graph',
  entryNodeIds: ['a'],
  graphHash: 'hash',
  nodes: { a: { nodeId: 'a', rpcName: 'childFlow' } },
}

const capturingService = () => {
  const ws = new InMemoryWorkflowService()
  const wires: any[] = []
  ws.startWorkflow = (async (_name: string, _data: unknown, wire: unknown) => {
    wires.push(wire)
    const runId = await ws.createRun('childFlow', {}, true, 'hash', wire as any)
    await ws.updateRunStatus(runId, 'completed', {})
    return { runId }
  }) as any
  return { ws, wires }
}

describe('a graph child run stays with the user', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    } as any)
    pikkuState(null, 'workflows', 'meta', {
      parentGraph: meta,
      childFlow: { ...meta, name: 'childFlow', pikkuFuncId: 'childFlow' },
    } as any)
  })

  test('on an inline run', async () => {
    const { ws, wires } = capturingService()

    await runWorkflowGraph(ws, 'parentGraph', {}, {}, true, undefined, {
      type: 'test',
      pikkuUserId: 'user-1',
    } as any)

    assert.equal(wires.length, 1)
    assert.equal(wires[0].pikkuUserId, 'user-1')
  })

  test('on a queued step', async () => {
    const { ws, wires } = capturingService()
    const runId = await ws.createRun('parentGraph', {}, false, 'hash', {
      type: 'test',
      pikkuUserId: 'user-1',
    } as any)
    const step = await ws.insertStepState(runId, 'a', 'childFlow', {})

    await executeGraphStep(
      ws,
      {},
      runId,
      step.stepId,
      'a',
      'childFlow',
      {},
      'parentGraph'
    )

    assert.equal(wires.length, 1)
    assert.equal(wires[0].pikkuUserId, 'user-1')
  })

  test('a run with no user starts a child with none', async () => {
    const { ws, wires } = capturingService()

    await runWorkflowGraph(ws, 'parentGraph', {}, {}, true, undefined, {
      type: 'test',
    } as any)

    assert.equal(wires[0].pikkuUserId, undefined)
  })
})
