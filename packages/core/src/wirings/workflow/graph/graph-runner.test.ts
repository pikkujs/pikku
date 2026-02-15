import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../../services/in-memory-workflow-service.js'
import { continueGraph, runWorkflowGraph } from './graph-runner.js'
import type { WorkflowRuntimeMeta } from '../workflow.types.js'
import { pikkuState } from '../../../pikku-state.js'

describe('graph-runner bugs', () => {
  test('continueGraph should NOT mark workflow completed while nodes are still running', async () => {
    const ws = new InMemoryWorkflowService()

    const meta: WorkflowRuntimeMeta = {
      name: 'testPrematureCompletion',
      pikkuFuncId: 'testPrematureCompletion',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'test-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', next: 'b' },
        b: { nodeId: 'b', rpcName: 'doB' },
      },
    }

    const runId = await ws.createRun(
      'testPrematureCompletion',
      {},
      false,
      'test-hash'
    )

    const stepA = await ws.insertStepState(runId, 'a', 'doA', {})
    await ws.setStepRunning(stepA.stepId)
    await ws.setStepResult(stepA.stepId, { ok: true })

    const stepB = await ws.insertStepState(runId, 'b', 'doB', {})
    await ws.setStepRunning(stepB.stepId)

    await continueGraph(ws, runId, 'testPrematureCompletion', meta)

    const run = await ws.getRun(runId)
    assert.notEqual(
      run?.status,
      'completed',
      'workflow should NOT be completed while node b is still running'
    )
    assert.equal(run?.status, 'running')
  })

  test('runWorkflowGraph should throw and not create a run when no entry nodes are ready', async () => {
    const ws = new InMemoryWorkflowService()

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testOrphanedRun'] = {
      name: 'testOrphanedRun',
      pikkuFuncId: 'testOrphanedRun',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'orphan-hash',
      nodes: {
        a: {
          nodeId: 'a',
          rpcName: 'doA',
          input: { dep: { $ref: 'someOtherNode', path: 'value' } },
        },
      },
    }

    await assert.rejects(() => runWorkflowGraph(ws, 'testOrphanedRun', {}), {
      message: /no entry nodes have satisfied dependencies/,
    })

    const runs: string[] = [...(ws as any).runs.keys()]
    assert.equal(
      runs.length,
      0,
      'no run should be created when entry nodes have unsatisfied dependencies'
    )

    delete metaState['testOrphanedRun']
  })

  test('inline graph node failure should mark workflow as failed', async () => {
    const ws = new InMemoryWorkflowService()

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, _data: any, _wire: any) => {
        if (rpcName === 'doA') return { ok: true }
        if (rpcName === 'doB') throw new Error('doB exploded')
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testInlineFailure'] = {
      name: 'testInlineFailure',
      pikkuFuncId: 'testInlineFailure',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'inline-fail-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', next: 'b' },
        b: { nodeId: 'b', rpcName: 'doB' },
      },
    }

    let runId: string | undefined
    try {
      const result = await runWorkflowGraph(
        ws,
        'testInlineFailure',
        {},
        mockRpcService,
        true
      )
      runId = result.runId
    } catch (_) {
      const runs = (ws as any).runs as Map<string, any>
      for (const [id] of runs) {
        runId = id
        break
      }
    }

    assert.ok(runId, 'should have created a run')
    const run = await ws.getRun(runId!)
    assert.equal(
      run?.status,
      'failed',
      'workflow should be failed after inline node error, not left running'
    )

    delete metaState['testInlineFailure']
  })
})
