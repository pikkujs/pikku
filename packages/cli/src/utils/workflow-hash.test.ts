import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { computeStepHashes, computeGraphHash } from './workflow-hash.js'
import type { SerializedWorkflowGraph } from '@pikku/inspector'
import type { FunctionsMeta } from '@pikku/core'

function makeGraph(
  nodes: SerializedWorkflowGraph['nodes']
): SerializedWorkflowGraph {
  return {
    name: 'testWorkflow',
    pikkuFuncId: 'testWorkflow',
    source: 'graph',
    nodes,
    entryNodeIds: [Object.keys(nodes)[0]],
  }
}

describe('computeStepHashes', () => {
  test('adds stepHash to function nodes only', () => {
    const graph = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc', next: 'step2' },
      step2: { nodeId: 'step2', flow: 'sleep' as const, next: undefined },
    })

    const functionsMeta: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'abc123',
      },
    }

    computeStepHashes(graph, functionsMeta)

    assert.ok((graph.nodes['step1'] as any).stepHash)
    assert.strictEqual((graph.nodes['step2'] as any).stepHash, undefined)
  })

  test('stepHash changes when contractHash changes', () => {
    const graph1 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })
    const graph2 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })

    const meta1: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'v1-contract-hash',
      },
    }
    const meta2: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'v2-contract-hash',
      },
    }

    computeStepHashes(graph1, meta1)
    computeStepHashes(graph2, meta2)

    assert.notStrictEqual(
      (graph1.nodes['step1'] as any).stepHash,
      (graph2.nodes['step1'] as any).stepHash
    )
  })

  test('stepHash is stable for identical contractHash', () => {
    const graph1 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })
    const graph2 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })

    const meta: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'stable-hash',
      },
    }

    computeStepHashes(graph1, meta)
    computeStepHashes(graph2, meta)

    assert.strictEqual(
      (graph1.nodes['step1'] as any).stepHash,
      (graph2.nodes['step1'] as any).stepHash
    )
  })
})

describe('stepHash affects graphHash', () => {
  test('graphHash changes when stepHash changes', () => {
    const graph1 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })
    const graph2 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })

    const metaV1: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'v1-hash',
      },
    }
    const metaV2: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'v2-hash',
      },
    }

    computeStepHashes(graph1, metaV1)
    computeStepHashes(graph2, metaV2)

    const hash1 = computeGraphHash(graph1)
    const hash2 = computeGraphHash(graph2)

    assert.notStrictEqual(hash1, hash2)
  })

  test('graphHash is stable when schemas are unchanged', () => {
    const graph1 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc', next: 'step2' },
      step2: { nodeId: 'step2', rpcName: 'otherRpc' },
    })
    const graph2 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc', next: 'step2' },
      step2: { nodeId: 'step2', rpcName: 'otherRpc' },
    })

    const meta: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: 'MyInput',
        outputSchemaName: 'MyOutput',
        contractHash: 'stable',
      },
      otherRpc: {
        pikkuFuncId: 'otherRpc',
        inputSchemaName: 'OtherInput',
        outputSchemaName: null,
        contractHash: 'other-stable',
      },
    }

    computeStepHashes(graph1, meta)
    computeStepHashes(graph2, meta)

    assert.strictEqual(computeGraphHash(graph1), computeGraphHash(graph2))
  })

  test('metadata fields do not affect graphHash', () => {
    const graph1 = makeGraph({
      step1: { nodeId: 'step1', rpcName: 'myRpc' },
    })
    const graph2: SerializedWorkflowGraph = {
      ...makeGraph({
        step1: { nodeId: 'step1', rpcName: 'myRpc' },
      }),
      name: 'differentName',
      description: 'some description',
      tags: ['tag1'],
    }

    const meta: FunctionsMeta = {
      myRpc: {
        pikkuFuncId: 'myRpc',
        inputSchemaName: null,
        outputSchemaName: null,
      },
    }

    computeStepHashes(graph1, meta)
    computeStepHashes(graph2, meta)

    assert.strictEqual(computeGraphHash(graph1), computeGraphHash(graph2))
  })
})
