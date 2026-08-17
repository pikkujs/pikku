import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../../services/in-memory-workflow-service.js'
import { runWorkflowGraph } from './graph-runner.js'
import { pikkuState } from '../../../pikku-state.js'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('graph forEach fanout', () => {
  test('parallel forEach runs one instance per element and threads $item', async () => {
    const ws = new InMemoryWorkflowService()
    const seen: any[] = []

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listRows') {
          return { rows: [{ n: 1 }, { n: 2 }, { n: 3 }] }
        }
        if (rpcName === 'handleRow') {
          seen.push(data)
          return { doubled: data.value * 2 }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutParallel'] = {
      name: 'fanoutParallel',
      pikkuFuncId: 'fanoutParallel',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-parallel-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list', path: 'rows' },
          input: { value: { $ref: '$item', path: 'n' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutParallel',
      {},
      mockRpcService,
      true
    )

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'completed')

    const instances = await ws.getStepInstances(runId)
    const names = instances.map((i) => i.stepName).sort()
    assert.deepEqual(names, ['handle[0]', 'handle[1]', 'handle[2]', 'list'])

    assert.deepEqual(
      seen.map((d) => d.value).sort(),
      [1, 2, 3],
      `each element should be threaded through $item, got ${JSON.stringify(seen)}`
    )

    delete metaState['fanoutParallel']
  })

  test('$item with no path binds the whole element', async () => {
    const ws = new InMemoryWorkflowService()
    const seen: any[] = []

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listWhole') return ['a', 'b']
        if (rpcName === 'takeWhole') {
          seen.push(data)
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutWholeItem'] = {
      name: 'fanoutWholeItem',
      pikkuFuncId: 'fanoutWholeItem',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-whole-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'listWhole', next: 'take' },
        take: {
          nodeId: 'take',
          rpcName: 'takeWhole',
          forEach: { $ref: 'list' },
          input: { letter: { $ref: '$item' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutWholeItem',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(
      seen.map((d) => d.letter).sort(),
      ['a', 'b'],
      `$item() with no path should bind the element itself, got ${JSON.stringify(seen)}`
    )

    delete metaState['fanoutWholeItem']
  })

  test('a fanned node aggregates its per-item results in source order', async () => {
    const ws = new InMemoryWorkflowService()
    let downstreamInput: any

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listOrdered') return [10, 20, 30]
        if (rpcName === 'slowSquare') {
          // The first element resolves last, so an unordered aggregation
          // would visibly reorder the results.
          await delay(data.value === 10 ? 30 : data.value === 20 ? 15 : 1)
          return { squared: data.value * data.value }
        }
        if (rpcName === 'collect') {
          downstreamInput = data
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutOrdered'] = {
      name: 'fanoutOrdered',
      pikkuFuncId: 'fanoutOrdered',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-ordered-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'listOrdered', next: 'square' },
        square: {
          nodeId: 'square',
          rpcName: 'slowSquare',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
          next: 'collect',
        },
        collect: {
          nodeId: 'collect',
          rpcName: 'collect',
          input: { results: { $ref: 'square' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutOrdered',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(downstreamInput, {
      results: [{ squared: 100 }, { squared: 400 }, { squared: 900 }],
    })

    delete metaState['fanoutOrdered']
  })

  test('a downstream node waits for every item of the fanned node', async () => {
    const ws = new InMemoryWorkflowService()
    let collectCalls = 0
    let inFlight = 0
    let sawCollectWhileItemsInFlight = false

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listWait') return [1, 2, 3]
        if (rpcName === 'slowItem') {
          inFlight++
          await delay(data.value * 10)
          inFlight--
          return data.value
        }
        if (rpcName === 'afterAll') {
          collectCalls++
          if (inFlight > 0) sawCollectWhileItemsInFlight = true
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutJoin'] = {
      name: 'fanoutJoin',
      pikkuFuncId: 'fanoutJoin',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-join-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'listWait', next: 'each' },
        each: {
          nodeId: 'each',
          rpcName: 'slowItem',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
          next: 'after',
        },
        after: { nodeId: 'after', rpcName: 'afterAll' },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutJoin',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.equal(collectCalls, 1, 'downstream node should run exactly once')
    assert.equal(
      sawCollectWhileItemsInFlight,
      false,
      'downstream node must not run while fanned items are still in flight'
    )

    delete metaState['fanoutJoin']
  })

  test("mode: 'sequential' runs one item at a time in order", async () => {
    const ws = new InMemoryWorkflowService()
    const events: string[] = []
    let concurrent = 0
    let maxConcurrent = 0

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listSeq') return ['a', 'b', 'c']
        if (rpcName === 'seqStep') {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          events.push(`start:${data.value}`)
          await delay(5)
          events.push(`end:${data.value}`)
          concurrent--
          return data.value.toUpperCase()
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutSequential'] = {
      name: 'fanoutSequential',
      pikkuFuncId: 'fanoutSequential',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-seq-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'listSeq', next: 'step' },
        step: {
          nodeId: 'step',
          rpcName: 'seqStep',
          forEach: { $ref: 'list' },
          mode: 'sequential',
          input: { value: { $ref: '$item' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutSequential',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.equal(maxConcurrent, 1, 'sequential mode must never overlap items')
    assert.deepEqual(events, [
      'start:a',
      'end:a',
      'start:b',
      'end:b',
      'start:c',
      'end:c',
    ])

    delete metaState['fanoutSequential']
  })

  test('a non-array forEach source fails the run loudly', async () => {
    const ws = new InMemoryWorkflowService()

    const mockRpcService = {
      rpcWithWire: async (rpcName: string) => {
        if (rpcName === 'notAList') return { rows: { nope: true } }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutNotArray'] = {
      name: 'fanoutNotArray',
      pikkuFuncId: 'fanoutNotArray',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-not-array-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'notAList', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list', path: 'rows' },
          input: { value: { $ref: '$item' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutNotArray',
      {},
      mockRpcService,
      true
    )

    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'failed')
    assert.match(
      run?.error?.message ?? '',
      /forEach source 'list\.rows'.*array/,
      `expected a loud non-array error, got ${run?.error?.message}`
    )

    delete metaState['fanoutNotArray']
  })

  test('a fanned node chains into a second forEach', async () => {
    const ws = new InMemoryWorkflowService()
    const leaves: any[] = []

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listGroups') return [{ id: 'g1' }, { id: 'g2' }]
        if (rpcName === 'expandGroup') {
          return { items: [`${data.id}-x`, `${data.id}-y`] }
        }
        if (rpcName === 'flattenGroups') {
          return data.groups.flatMap((g: any) => g.items)
        }
        if (rpcName === 'useLeaf') {
          leaves.push(data.leaf)
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutChained'] = {
      name: 'fanoutChained',
      pikkuFuncId: 'fanoutChained',
      source: 'graph',
      entryNodeIds: ['groups'],
      graphHash: 'fanout-chained-hash',
      nodes: {
        groups: { nodeId: 'groups', rpcName: 'listGroups', next: 'expand' },
        expand: {
          nodeId: 'expand',
          rpcName: 'expandGroup',
          forEach: { $ref: 'groups' },
          input: { id: { $ref: '$item', path: 'id' } },
          next: 'flatten',
        },
        flatten: {
          nodeId: 'flatten',
          rpcName: 'flattenGroups',
          input: { groups: { $ref: 'expand' } },
          next: 'leaf',
        },
        leaf: {
          nodeId: 'leaf',
          rpcName: 'useLeaf',
          forEach: { $ref: 'flatten' },
          input: { leaf: { $ref: '$item' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutChained',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(leaves.sort(), ['g1-x', 'g1-y', 'g2-x', 'g2-y'])

    const names = (await ws.getStepInstances(runId))
      .map((i) => i.stepName)
      .sort()
    assert.deepEqual(names, [
      'expand[0]',
      'expand[1]',
      'flatten',
      'groups',
      'leaf[0]',
      'leaf[1]',
      'leaf[2]',
      'leaf[3]',
    ])

    delete metaState['fanoutChained']
  })

  test('an empty forEach source completes the node with no item instances', async () => {
    const ws = new InMemoryWorkflowService()
    let downstreamInput: any

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'listEmpty') return []
        if (rpcName === 'neverRuns') throw new Error('should not run')
        if (rpcName === 'collectEmpty') {
          downstreamInput = data
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutEmpty'] = {
      name: 'fanoutEmpty',
      pikkuFuncId: 'fanoutEmpty',
      source: 'graph',
      entryNodeIds: ['list'],
      graphHash: 'fanout-empty-hash',
      nodes: {
        list: { nodeId: 'list', rpcName: 'listEmpty', next: 'each' },
        each: {
          nodeId: 'each',
          rpcName: 'neverRuns',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
          next: 'collect',
        },
        collect: {
          nodeId: 'collect',
          rpcName: 'collectEmpty',
          input: { results: { $ref: 'each' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutEmpty',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(downstreamInput, { results: [] })

    delete metaState['fanoutEmpty']
  })

  test('forEach over the trigger input fans out from an entry node', async () => {
    const ws = new InMemoryWorkflowService()
    const seen: any[] = []

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'handleTriggerRow') {
          seen.push(data.value)
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutTrigger'] = {
      name: 'fanoutTrigger',
      pikkuFuncId: 'fanoutTrigger',
      source: 'graph',
      entryNodeIds: ['handle'],
      graphHash: 'fanout-trigger-hash',
      nodes: {
        handle: {
          nodeId: 'handle',
          rpcName: 'handleTriggerRow',
          forEach: { $ref: 'trigger', path: 'rows' },
          input: { value: { $ref: '$item' } },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'fanoutTrigger',
      { rows: ['p', 'q'] },
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(seen.sort(), ['p', 'q'])

    delete metaState['fanoutTrigger']
  })

  test('an unknown forEach source is rejected before the run starts', async () => {
    const ws = new InMemoryWorkflowService()
    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['fanoutUnknownSource'] = {
      name: 'fanoutUnknownSource',
      pikkuFuncId: 'fanoutUnknownSource',
      source: 'graph',
      entryNodeIds: ['a'],
      graphHash: 'fanout-unknown-hash',
      nodes: {
        a: { nodeId: 'a', rpcName: 'doA', next: 'b' },
        b: {
          nodeId: 'b',
          rpcName: 'doB',
          forEach: { $ref: 'missingNode' },
          input: { value: { $ref: '$item' } },
        },
      },
    }

    await assert.rejects(
      () =>
        runWorkflowGraph(
          ws,
          'fanoutUnknownSource',
          {},
          { rpcWithWire: async () => ({}) },
          true
        ),
      /unknown node 'missingNode' in forEach/
    )

    delete metaState['fanoutUnknownSource']
  })

  test('an existing single-param input node is untouched by the forEach change', async () => {
    const ws = new InMemoryWorkflowService()
    const seen: any[] = []

    const mockRpcService = {
      rpcWithWire: async (rpcName: string, data: any) => {
        if (rpcName === 'plainFirst') return { name: 'ada', rows: [1, 2] }
        if (rpcName === 'plainSecond') {
          seen.push(data)
          return { ok: true }
        }
        return {}
      },
    }

    const metaState = pikkuState(null, 'workflows', 'meta')
    metaState['plainGraph'] = {
      name: 'plainGraph',
      pikkuFuncId: 'plainGraph',
      source: 'graph',
      entryNodeIds: ['first'],
      graphHash: 'plain-hash',
      nodes: {
        first: { nodeId: 'first', rpcName: 'plainFirst', next: 'second' },
        second: {
          nodeId: 'second',
          rpcName: 'plainSecond',
          input: {
            who: { $ref: 'first', path: 'name' },
            all: { $ref: 'first', path: 'rows' },
          },
        },
      },
    }

    const { runId } = await runWorkflowGraph(
      ws,
      'plainGraph',
      {},
      mockRpcService,
      true
    )

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(seen, [{ who: 'ada', all: [1, 2] }])

    const names = (await ws.getStepInstances(runId))
      .map((i) => i.stepName)
      .sort()
    assert.deepEqual(
      names,
      ['first', 'second'],
      'a graph without forEach must still produce plain, un-indexed step names'
    )

    delete metaState['plainGraph']
  })
})
