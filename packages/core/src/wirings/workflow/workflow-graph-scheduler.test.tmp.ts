import { test, describe, mock } from 'node:test'
import * as assert from 'assert'
import {
  findTriggerNodes,
  resolveNextInstances,
  executeWorkflowGraph,
  MaxIterationsExceededError,
  NoTriggerNodeError,
} from './workflow-graph-scheduler.js'
import type { WorkflowGraph, GraphContext } from './workflow-graph.types.js'

describe('findTriggerNodes', () => {
  test('should find nodes with no incoming edges', () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'trigger',
        input: {},
        next: 'step_1',
      },
      step_1: {
        nodeId: 'action',
        input: {},
        next: 'step_2',
      },
      step_2: {
        nodeId: 'action',
        input: {},
      },
    }

    const triggers = findTriggerNodes(graph)
    assert.deepStrictEqual(triggers, ['trigger_1'])
  })

  test('should find multiple trigger nodes', () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'trigger',
        input: {},
        next: 'merge_1',
      },
      trigger_2: {
        nodeId: 'trigger',
        input: {},
        next: 'merge_1',
      },
      merge_1: {
        nodeId: 'merge',
        input: {},
      },
    }

    const triggers = findTriggerNodes(graph)
    assert.ok(triggers.includes('trigger_1'))
    assert.ok(triggers.includes('trigger_2'))
    assert.strictEqual(triggers.length, 2)
  })

  test('should not include nodes referenced by next array', () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'trigger',
        input: {},
        next: ['step_1', 'step_2'],
      },
      step_1: {
        nodeId: 'action',
        input: {},
      },
      step_2: {
        nodeId: 'action',
        input: {},
      },
    }

    const triggers = findTriggerNodes(graph)
    assert.deepStrictEqual(triggers, ['trigger_1'])
  })

  test('should not include nodes referenced by next Record', () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'trigger',
        input: {},
        next: 'condition_1',
      },
      condition_1: {
        nodeId: 'ifCondition',
        input: {},
        next: {
          true: 'success_1',
          false: 'failure_1',
        },
      },
      success_1: {
        nodeId: 'action',
        input: {},
      },
      failure_1: {
        nodeId: 'action',
        input: {},
      },
    }

    const triggers = findTriggerNodes(graph)
    assert.deepStrictEqual(triggers, ['trigger_1'])
  })
})

describe('resolveNextInstances', () => {
  test('should resolve string next', () => {
    const result = resolveNextInstances('step_1')
    assert.deepStrictEqual(result, ['step_1'])
  })

  test('should resolve array next', () => {
    const result = resolveNextInstances(['step_1', 'step_2'])
    assert.deepStrictEqual(result, ['step_1', 'step_2'])
  })

  test('should resolve Record next with branch', () => {
    const next = { true: 'success_1', false: 'failure_1' }
    const result = resolveNextInstances(next, 'true')
    assert.deepStrictEqual(result, ['success_1'])
  })

  test('should resolve Record next with array value', () => {
    const next = { true: ['log_1', 'notify_1'], false: 'failure_1' }
    const result = resolveNextInstances(next, 'true')
    assert.deepStrictEqual(result, ['log_1', 'notify_1'])
  })

  test('should throw when branch required but not selected', () => {
    const next = { true: 'success_1', false: 'failure_1' }
    assert.throws(() => resolveNextInstances(next), /Branch selection required/)
  })

  test('should throw when branch not found', () => {
    const next = { true: 'success_1', false: 'failure_1' }
    assert.throws(
      () => resolveNextInstances(next, 'maybe'),
      /Branch 'maybe' not found/
    )
  })

  test('should return empty array for undefined next', () => {
    const result = resolveNextInstances(undefined)
    assert.deepStrictEqual(result, [])
  })
})

describe('WorkflowGraphScheduler', () => {
  const createMockRpcService = () => {
    const results = new Map<string, any>()
    const mockFn = mock.fn(async (nodeId: string, data: any, wire?: any) => {
      const result = results.get(nodeId)
      if (typeof result === 'function') {
        return result(data, wire)
      }
      return result ?? { success: true }
    })
    return {
      setResult: (nodeId: string, result: any) => results.set(nodeId, result),
      rpcWithWire: mockFn,
      get calls() {
        return mockFn.mock.calls
      },
    }
  }

  test('should execute simple sequential workflow', async () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'manualTrigger',
        input: {},
        next: 'step_1',
      },
      step_1: {
        nodeId: 'action',
        input: {
          value: { type: 'literal', value: 'hello' },
        },
      },
    }

    const rpcService = createMockRpcService()
    rpcService.setResult('manualTrigger', { data: 'trigger output' })
    rpcService.setResult('action', { result: 'done' })

    const result = await executeWorkflowGraph(
      graph,
      'run-1',
      { input: 'test' },
      rpcService
    )

    assert.strictEqual(result.status, 'completed')
    assert.strictEqual(rpcService.calls.length, 2)
  })

  test('should execute parallel branches', async () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'manualTrigger',
        input: {},
        next: ['branch_1', 'branch_2'],
      },
      branch_1: {
        nodeId: 'action1',
        input: {},
      },
      branch_2: {
        nodeId: 'action2',
        input: {},
      },
    }

    const rpcService = createMockRpcService()
    rpcService.setResult('manualTrigger', {})
    rpcService.setResult('action1', { branch: 1 })
    rpcService.setResult('action2', { branch: 2 })

    const result = await executeWorkflowGraph(graph, 'run-1', {}, rpcService)

    assert.strictEqual(result.status, 'completed')
    assert.strictEqual(rpcService.calls.length, 3)
  })

  test('should handle branching with graph.branch()', async () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'manualTrigger',
        input: {},
        next: 'condition_1',
      },
      condition_1: {
        nodeId: 'ifCondition',
        input: {
          condition: { type: 'literal', value: true },
        },
        next: {
          true: 'success_1',
          false: 'failure_1',
        },
      },
      success_1: {
        nodeId: 'successAction',
        input: {},
      },
      failure_1: {
        nodeId: 'failureAction',
        input: {},
      },
    }

    const rpcService = createMockRpcService()
    rpcService.setResult('manualTrigger', {})
    rpcService.setResult('ifCondition', (data: any, wire: any) => {
      // Simulate ifCondition calling graph.branch()
      wire.graph.branch('true')
      return {}
    })
    rpcService.setResult('successAction', { success: true })

    const result = await executeWorkflowGraph(graph, 'run-1', {}, rpcService)

    assert.strictEqual(result.status, 'completed')
    // Should call successAction
    const calledNodes = rpcService.calls.map((c) => c.arguments[0])
    assert.ok(calledNodes.includes('successAction'))
    // Should NOT call failureAction
    assert.ok(!calledNodes.includes('failureAction'))
  })

  test('should throw NoTriggerNodeError when no trigger', async () => {
    const graph: WorkflowGraph = {
      step_1: {
        nodeId: 'action',
        input: {},
        next: 'step_2',
      },
      step_2: {
        nodeId: 'action',
        input: {},
        next: 'step_1', // cycle - everyone has incoming
      },
    }

    const rpcService = createMockRpcService()

    await assert.rejects(
      () => executeWorkflowGraph(graph, 'run-1', {}, rpcService),
      NoTriggerNodeError
    )
  })

  test('should enforce max iterations', async () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'manualTrigger',
        input: {},
        next: 'loop_1',
      },
      loop_1: {
        nodeId: 'loopAction',
        input: {},
        next: 'loop_1', // infinite loop
        maxIterations: 3,
      },
    }

    const rpcService = createMockRpcService()
    rpcService.setResult('manualTrigger', {})
    rpcService.setResult('loopAction', {})

    await assert.rejects(
      () => executeWorkflowGraph(graph, 'run-1', {}, rpcService),
      MaxIterationsExceededError
    )
  })

  test('should track iteration count in graph context', async () => {
    const iterations: number[] = []

    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'manualTrigger',
        input: {},
        next: 'loop_1',
      },
      loop_1: {
        nodeId: 'loopAction',
        input: {},
        next: {
          continue: 'loop_1',
          done: 'end_1',
        },
        maxIterations: 5,
      },
      end_1: {
        nodeId: 'endAction',
        input: {},
      },
    }

    const rpcService = createMockRpcService()
    rpcService.setResult('manualTrigger', {})
    rpcService.setResult(
      'loopAction',
      (data: any, wire: { graph: GraphContext<string> }) => {
        iterations.push(wire.graph.iteration)
        // Continue for 3 iterations, then stop
        if (wire.graph.iteration < 2) {
          wire.graph.branch('continue')
        } else {
          wire.graph.branch('done')
        }
        return {}
      }
    )
    rpcService.setResult('endAction', {})

    const result = await executeWorkflowGraph(graph, 'run-1', {}, rpcService)

    assert.strictEqual(result.status, 'completed')
    assert.deepStrictEqual(iterations, [0, 1, 2])
  })

  test('should resolve input refs from completed nodes', async () => {
    const graph: WorkflowGraph = {
      trigger_1: {
        nodeId: 'manualTrigger',
        input: {},
        next: 'step_1',
      },
      step_1: {
        nodeId: 'createOrg',
        input: {
          name: { type: 'literal', value: 'Test Org' },
        },
        next: 'step_2',
      },
      step_2: {
        nodeId: 'useOrg',
        input: {
          orgId: { type: 'ref', path: 'step_1.output.orgId' },
        },
      },
    }

    let receivedOrgId: string | undefined

    const rpcService = createMockRpcService()
    rpcService.setResult('manualTrigger', {})
    rpcService.setResult('createOrg', { orgId: 'org-123' })
    rpcService.setResult('useOrg', (data: any) => {
      receivedOrgId = data.orgId
      return { used: true }
    })

    const result = await executeWorkflowGraph(graph, 'run-1', {}, rpcService)

    assert.strictEqual(result.status, 'completed')
    assert.strictEqual(receivedOrgId, 'org-123')
  })
})
