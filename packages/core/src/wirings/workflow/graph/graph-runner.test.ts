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
import { DEFAULT_STEP_RETRIES } from '../pikku-workflow-service.js'

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
      'test-hash',
      { type: 'test' }
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
      'ambiguous-step-remap-hash',
      { type: 'test' }
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
      'ambiguous-branch-remap-hash',
      { type: 'test' }
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

    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async (_queueName: string, data: any) => {
          if (data?.stepName) {
            queuedNodes.push(data.stepName)
          }
        },
      },
    } as any)

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
      'converging-hash',
      { type: 'test' }
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

  test('continueGraph revisits a cyclic node and records the walked path via fromStepName', async () => {
    const ws = new InMemoryWorkflowService()
    const queued: Array<{ stepName: string; fromStepName?: string }> = []

    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async (_queueName: string, data: any) => {
          if (data?.stepName) {
            queued.push({
              stepName: data.stepName,
              fromStepName: data.fromStepName,
            })
          }
        },
      },
    } as any)

    // start → a, where a loops back through b once, then exits to c:
    //   start → a --retry--> b → a --done--> c
    const meta: WorkflowRuntimeMeta = {
      name: 'testCyclicGraph',
      pikkuFuncId: 'testCyclicGraph',
      source: 'graph',
      entryNodeIds: ['start'],
      graphHash: 'cyclic-hash',
      nodes: {
        start: { nodeId: 'start', rpcName: 'doStart', next: 'a' },
        a: { nodeId: 'a', rpcName: 'doA', next: { retry: 'b', done: 'c' } },
        b: { nodeId: 'b', rpcName: 'doB', next: 'a' },
        c: { nodeId: 'c', rpcName: 'doC' },
      },
    }

    const runId = await ws.createRun('testCyclicGraph', {}, false, 'cyclic-hash', {
      type: 'test',
    })

    // Succeed a queued step (taking an optional branch), then advance the graph.
    const advance = async (stepName: string, branch?: string) => {
      const step = await ws.getStepState(runId, stepName)
      await ws.setStepRunning(step.stepId)
      if (branch) await ws.setBranchTaken(step.stepId, branch)
      await ws.setStepResult(step.stepId, { ok: true })
      await continueGraph(ws, runId, 'testCyclicGraph', meta)
    }

    await continueGraph(ws, runId, 'testCyclicGraph', meta) // fire entry
    await advance('start')
    await advance('a', 'retry') // a → b (b reaches a, but first visit ⇒ bare 'b')
    await advance('b') // b → a revisit ⇒ a#1
    await advance('a#1', 'done') // a#1 → c (forward edge, terminal)
    await advance('c')

    // Each step records the predecessor it was reached from; the cyclic
    // revisit is a fresh ordinal instance (a#1) with its own provenance.
    assert.deepEqual(queued, [
      { stepName: 'start', fromStepName: undefined },
      { stepName: 'a', fromStepName: 'start' },
      { stepName: 'b', fromStepName: 'a' },
      { stepName: 'a#1', fromStepName: 'b' },
      { stepName: 'c', fromStepName: 'a#1' },
    ])

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')

    // Reconstruct the walked path purely from the fromStepName chain.
    const instances = await ws.getStepInstances(runId)
    const from = new Map(instances.map((i) => [i.stepName, i.fromStepName]))
    const path: string[] = []
    let cursor: string | undefined = 'c'
    while (cursor) {
      path.unshift(cursor)
      cursor = from.get(cursor) ?? undefined
    }
    assert.deepEqual(path, ['start', 'a', 'b', 'a#1', 'c'])
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
    } catch {
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

    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {},
      },
    } as any)

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
      'queued-on-error-hash',
      { type: 'test' }
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
      'queued-rpc-missing-hash',
      { type: 'test' }
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

  test('graph workflow started with the inline flag should run inline', async () => {
    const ws = new InMemoryWorkflowService()
    let executed = false

    const mockRpcService = {
      rpcWithWire: async () => {
        executed = true
        return { done: true }
      },
    }

    // Set up queue service to verify nothing is queued
    let queued = false
    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {
          queued = true
        },
      },
    } as any)

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['testInlineMetaGraph'] = {
      name: 'testInlineMetaGraph',
      pikkuFuncId: 'testInlineMetaGraph',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'inline-meta-graph-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA' },
      },
    }

    await runWorkflowGraph(ws, 'testInlineMetaGraph', {}, mockRpcService, true)

    assert.equal(executed, true, 'RPC should have been executed inline')
    assert.equal(queued, false, 'nothing should have been queued')

    delete metaState['testInlineMetaGraph']
  })

  test('queueGraphNode forwards node retries to queue attempts and backoff', async () => {
    const ws = new InMemoryWorkflowService()
    const enqueued: Array<{ queueName: string; data: any; options: any }> = []

    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async (queueName: string, data: any, options: any) => {
          enqueued.push({ queueName, data, options })
        },
      },
    } as any)

    const meta: WorkflowRuntimeMeta = {
      name: 'testRetries',
      pikkuFuncId: 'testRetries',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'retries-hash',
      nodes: {
        a: {
          nodeId: 'a',
          rpcName: 'doA',
          retries: 3,
          retryDelay: 250,
        },
        b: {
          nodeId: 'b',
          rpcName: 'doB',
          retries: 2,
          retryDelay: 'exponential',
        },
        c: {
          nodeId: 'c',
          rpcName: 'doC',
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'testRetries',
      {},
      { rpcWithWire: async () => ({}) },
      false,
      undefined,
      undefined,
      meta
    )

    const aJob = enqueued.find((e) => e.data?.stepName === 'a')
    assert.ok(aJob, 'node a should have been enqueued')
    assert.equal(aJob!.options?.attempts, 4, 'retries=3 → attempts=4')
    assert.deepEqual(aJob!.options?.backoff, { type: 'fixed', delay: 250 })

    const stepStateA = await ws.getStepState(runId, 'a')
    assert.equal(
      stepStateA.retries,
      3,
      'insertStepState should record node retries'
    )
    assert.equal(stepStateA.retryDelay, 250)

    enqueued.length = 0
    await runWorkflowGraph(
      ws,
      'testRetries',
      {},
      { rpcWithWire: async () => ({}) },
      false,
      'b',
      undefined,
      meta
    )
    const bJob = enqueued.find((e) => e.data?.stepName === 'b')
    assert.ok(bJob, 'node b should have been enqueued')
    assert.equal(bJob!.options?.attempts, 3, 'retries=2 → attempts=3')
    assert.equal(bJob!.options?.backoff, 'exponential')

    enqueued.length = 0
    await runWorkflowGraph(
      ws,
      'testRetries',
      {},
      { rpcWithWire: async () => ({}) },
      false,
      'c',
      undefined,
      meta
    )
    const cJob = enqueued.find((e) => e.data?.stepName === 'c')
    assert.ok(cJob, 'node c should have been enqueued')
    assert.equal(
      cJob!.options?.attempts,
      DEFAULT_STEP_RETRIES + 1,
      'no retries → workflow default (5) + 1 attempt; queue never decides retries'
    )
    assert.equal(
      cJob!.options?.backoff,
      'exponential',
      'default retries get exponential backoff so they ride out transient outages'
    )
  })
})
