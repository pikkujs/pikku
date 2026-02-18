import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../../services/in-memory-workflow-service.js'
import {
  continueGraph,
  executeGraphStep,
  runWorkflowGraph,
} from './graph-runner.js'
import type { WorkflowRuntimeMeta } from '../workflow.types.js'
import { pikkuState } from '../../../pikku-state.js'
import { RPCNotFoundError } from '../../rpc/rpc-runner.js'

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

  test('runWorkflowGraph should throw and not create a run for unknown input refs', async () => {
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
      message: /references unknown node 'someOtherNode' in input/,
    })

    const runs: string[] = [...(ws as any).runs.keys()]
    assert.equal(
      runs.length,
      0,
      'no run should be created when entry nodes have unsatisfied dependencies'
    )

    delete metaState['testOrphanedRun']
  })

  test('runWorkflowGraph should throw and not create a run for unknown next targets', async () => {
    const ws = new InMemoryWorkflowService()

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testUnknownNextTarget'] = {
      name: 'testUnknownNextTarget',
      pikkuFuncId: 'testUnknownNextTarget',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'unknown-next-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', next: 'missingNode' },
      },
    }

    await assert.rejects(
      () => runWorkflowGraph(ws, 'testUnknownNextTarget', {}),
      {
        message: /routes to unknown node 'missingNode'/,
      }
    )

    const runs: string[] = [...(ws as any).runs.keys()]
    assert.equal(
      runs.length,
      0,
      'no run should be created for invalid next targets'
    )

    delete metaState['testUnknownNextTarget']
  })

  test('continueGraph should throw for ambiguous template step remapping', async () => {
    const ws = new InMemoryWorkflowService()

    const meta: WorkflowRuntimeMeta = {
      name: 'testAmbiguousTemplateStepRemap',
      pikkuFuncId: 'testAmbiguousTemplateStepRemap',
      source: 'graph',
      entryNodeIds: ['start'],
      graphHash: 'ambiguous-step-remap-hash',
      nodes: {
        start: { nodeId: 'start', rpcName: 'doStart' },
        'task-${id}': { nodeId: 'task-${id}', rpcName: 'doTaskById' },
        'task-${name}': { nodeId: 'task-${name}', rpcName: 'doTaskByName' },
      },
    }

    const runId = await ws.createRun(
      'testAmbiguousTemplateStepRemap',
      {},
      false,
      'ambiguous-step-remap-hash'
    )

    const step = await ws.insertStepState(runId, 'task-123', 'doTask', {})
    await ws.setStepRunning(step.stepId)
    await ws.setStepResult(step.stepId, { ok: true })

    await assert.rejects(
      () => continueGraph(ws, runId, 'testAmbiguousTemplateStepRemap', meta),
      {
        message: /ambiguous template node match for 'task-123'/i,
      }
    )
  })

  test('continueGraph should throw for ambiguous template branch key remapping', async () => {
    const ws = new InMemoryWorkflowService()

    const meta: WorkflowRuntimeMeta = {
      name: 'testAmbiguousTemplateBranchRemap',
      pikkuFuncId: 'testAmbiguousTemplateBranchRemap',
      source: 'graph',
      entryNodeIds: ['start'],
      graphHash: 'ambiguous-branch-remap-hash',
      nodes: {
        start: { nodeId: 'start', rpcName: 'doStart' },
        'branch-${id}': { nodeId: 'branch-${id}', rpcName: 'doBranchById' },
        'branch-${name}': {
          nodeId: 'branch-${name}',
          rpcName: 'doBranchByName',
        },
      },
    }

    const runId = await ws.createRun(
      'testAmbiguousTemplateBranchRemap',
      {},
      false,
      'ambiguous-branch-remap-hash'
    )

    const step = await ws.insertStepState(runId, 'branch-1', 'doBranch', {})
    await ws.setBranchTaken(step.stepId, 'next')

    await assert.rejects(
      () => continueGraph(ws, runId, 'testAmbiguousTemplateBranchRemap', meta),
      {
        message: /ambiguous template branch key match for 'branch-1'/i,
      }
    )
  })

  test('continueGraph should queue converging next node only once', async () => {
    const ws = new InMemoryWorkflowService()
    const queuedNodes: string[] = []

    ws.setServices(
      {
        queueService: {
          add: async (_queueName: string, data: any) => {
            if (data?.stepName) {
              queuedNodes.push(data.stepName)
            }
          },
        },
      } as any,
      (() => ({})) as any,
      {} as any
    )

    const meta: WorkflowRuntimeMeta = {
      name: 'testConvergingNextNode',
      pikkuFuncId: 'testConvergingNextNode',
      source: 'graph',
      entryNodeIds: ['a', 'b'],
      graphHash: 'converging-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', next: 'c' },
        b: { nodeId: 'b', rpcName: 'doB', next: 'c' },
        c: { nodeId: 'c', rpcName: 'doC' },
      },
    }

    const runId = await ws.createRun(
      'testConvergingNextNode',
      {},
      false,
      'converging-hash'
    )

    const stepA = await ws.insertStepState(runId, 'a', 'doA', {})
    await ws.setStepRunning(stepA.stepId)
    await ws.setStepResult(stepA.stepId, { ok: true })

    const stepB = await ws.insertStepState(runId, 'b', 'doB', {})
    await ws.setStepRunning(stepB.stepId)
    await ws.setStepResult(stepB.stepId, { ok: true })

    await continueGraph(ws, runId, 'testConvergingNextNode', meta)

    assert.deepEqual(queuedNodes, ['c'])
  })

  test('inline graph should execute converging next node only once', async () => {
    const ws = new InMemoryWorkflowService()
    let cCalls = 0

    const mockRpcService = {
      rpcWithWire: async (rpcName: string) => {
        if (rpcName === 'doA' || rpcName === 'doB') {
          return { ok: true }
        }
        if (rpcName === 'doC') {
          cCalls += 1
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testInlineConvergingSingleExecution'] = {
      name: 'testInlineConvergingSingleExecution',
      pikkuFuncId: 'testInlineConvergingSingleExecution',
      source: 'graph',
      entryNodeIds: ['a', 'b'],
      graphHash: 'inline-converging-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', next: 'c' },
        b: { nodeId: 'b', rpcName: 'doB', next: 'c' },
        c: { nodeId: 'c', rpcName: 'doC' },
      },
    }

    await runWorkflowGraph(
      ws,
      'testInlineConvergingSingleExecution',
      {},
      mockRpcService,
      true
    )

    assert.equal(cCalls, 1)

    delete metaState['testInlineConvergingSingleExecution']
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

  test('executeGraphStep should throw after queueing onError nodes', async () => {
    const ws = new InMemoryWorkflowService()

    ws.setServices(
      {
        queueService: {
          add: async () => {},
        },
      } as any,
      (() => ({})) as any,
      {} as any
    )

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testQueuedOnErrorThrow'] = {
      name: 'testQueuedOnErrorThrow',
      pikkuFuncId: 'testQueuedOnErrorThrow',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'queued-on-error-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', onError: 'onErr' },
        onErr: { nodeId: 'onErr', rpcName: 'handleErr' },
      },
    }

    const runId = await ws.createRun(
      'testQueuedOnErrorThrow',
      {},
      false,
      'queued-on-error-hash'
    )
    const step = await ws.insertStepState(runId, 'a', 'doA', {})

    const rpcService = {
      rpcWithWire: async () => {
        throw new Error('boom')
      },
    }

    await assert.rejects(
      () =>
        executeGraphStep(
          ws,
          rpcService,
          runId,
          step.stepId,
          'a',
          'doA',
          {},
          'testQueuedOnErrorThrow'
        ),
      /boom/
    )

    const errorStep = await ws.getStepState(runId, 'onErr')
    assert.notEqual(
      errorStep.stepId,
      '',
      'onError node should be queued as a step'
    )

    delete metaState['testQueuedOnErrorThrow']
  })

  test('executeWorkflowStep should mark graph step failed and suspend run on RPCNotFoundError', async () => {
    const ws = new InMemoryWorkflowService()

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testQueuedRpcMissing'] = {
      name: 'testQueuedRpcMissing',
      pikkuFuncId: 'testQueuedRpcMissing',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'queued-rpc-missing-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'missingRpc' },
      },
    }

    const runId = await ws.createRun(
      'testQueuedRpcMissing',
      {},
      false,
      'queued-rpc-missing-hash'
    )
    await ws.insertStepState(runId, 'a', 'missingRpc', {})

    const rpcService = {
      rpcWithWire: async () => {
        throw new RPCNotFoundError('missingRpc')
      },
    }

    await ws.executeWorkflowStep(runId, 'a', 'missingRpc', {}, rpcService)

    const step = await ws.getStepState(runId, 'a')
    const run = await ws.getRun(runId)

    assert.equal(step.status, 'failed')
    assert.equal(step.error?.message, 'RPC function not found: missingRpc')
    assert.equal(run?.status, 'suspended')
    assert.equal(run?.error?.code, 'RPC_NOT_FOUND')

    delete metaState['testQueuedRpcMissing']
  })

  test('inline graph missing RPC should mark step failed and suspend run', async () => {
    const ws = new InMemoryWorkflowService()

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testInlineRpcMissing'] = {
      name: 'testInlineRpcMissing',
      pikkuFuncId: 'testInlineRpcMissing',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'inline-rpc-missing-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'missingInlineRpc' },
      },
    }

    const rpcService = {
      rpcWithWire: async () => {
        throw new RPCNotFoundError('missingInlineRpc')
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'testInlineRpcMissing',
      {},
      rpcService,
      true
    )

    const step = await ws.getStepState(runId, 'a')
    const run = await ws.getRun(runId)

    assert.equal(step.status, 'failed')
    assert.equal(
      step.error?.message,
      'RPC function not found: missingInlineRpc'
    )
    assert.equal(run?.status, 'suspended')
    assert.equal(run?.error?.code, 'RPC_NOT_FOUND')

    delete metaState['testInlineRpcMissing']
  })
})
