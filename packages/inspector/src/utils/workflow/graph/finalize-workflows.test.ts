import { test } from 'node:test'
import assert from 'node:assert'
import { computeGraphHash } from './finalize-workflows.js'
import type {
  SerializedWorkflowGraph,
  FunctionNode,
} from './workflow-graph.types.js'

function graph(
  overrides: Partial<SerializedWorkflowGraph> = {},
  nodeOverrides: Partial<FunctionNode> = {}
): SerializedWorkflowGraph {
  const node: FunctionNode = {
    nodeId: 'a',
    rpcName: 'doThing',
    input: { x: { $ref: 'trigger', path: 'x' } },
    next: 'b',
    ...nodeOverrides,
  }
  return {
    name: 'wf',
    pikkuFuncId: 'wf',
    source: 'graph',
    nodes: { a: node, b: { nodeId: 'b', rpcName: 'finish' } },
    entryNodeIds: ['a'],
    ...overrides,
  }
}

test('computeGraphHash: node-level notes do not change the hash', () => {
  const without = computeGraphHash(graph())
  const withNote = computeGraphHash(
    graph({}, { notes: 'imported from n8n node "Do Thing"' })
  )
  assert.strictEqual(withNote, without)
})

test('computeGraphHash: graph-level notes do not change the hash', () => {
  const without = computeGraphHash(graph())
  const withNotes = computeGraphHash(
    graph({ notes: ['sticky note one', 'sticky note two'] })
  )
  assert.strictEqual(withNotes, without)
})

test('computeGraphHash: a topology change DOES change the hash', () => {
  const base = computeGraphHash(graph())
  const changed = computeGraphHash(graph({}, { next: 'c' }))
  assert.notStrictEqual(changed, base)
})
