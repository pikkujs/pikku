import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  deserializeDslWorkflow,
  deserializeGraphWorkflow,
} from './deserialize-dsl-workflow.js'
import type { SerializedWorkflowGraph } from '../graph/workflow-graph.types.js'

function graph(
  nodes: SerializedWorkflowGraph['nodes']
): SerializedWorkflowGraph {
  return {
    name: 'wf',
    pikkuFuncId: 'wf',
    source: 'graph',
    nodes,
    entryNodeIds: ['start'],
  }
}

describe('graph round-trip — a non-string next must not be stringified', () => {
  test('a parallel fan-out keeps every target', () => {
    const code = deserializeGraphWorkflow(
      graph({
        start: { nodeId: 'start', rpcName: 'begin', next: ['left', 'right'] },
        left: { nodeId: 'left', rpcName: 'goLeft' },
        right: { nodeId: 'right', rpcName: 'goRight' },
      })
    )

    assert.ok(
      !code.includes("next: 'left,right'"),
      `an array next must not be joined into a single bogus node id, got:\n${code}`
    )
    assert.ok(
      /next: \['left', 'right'\]/.test(code),
      `both parallel targets must survive, got:\n${code}`
    )
  })

  test('key-based branching keeps its routing table', () => {
    const code = deserializeGraphWorkflow(
      graph({
        start: {
          nodeId: 'start',
          rpcName: 'classify',
          next: { approved: 'ship', rejected: 'refund' },
        },
        ship: { nodeId: 'ship', rpcName: 'ship' },
        refund: { nodeId: 'refund', rpcName: 'refund' },
      })
    )

    assert.ok(
      !code.includes('[object Object]'),
      `a record next must not be stringified, got:\n${code}`
    )
    assert.ok(
      code.includes("approved: 'ship'") && code.includes("rejected: 'refund'"),
      `every branch key must survive, got:\n${code}`
    )
  })
})

describe('DSL round-trip — an unbound array step must not emit a broken binding', () => {
  test('a filter with no outputVar does not declare `const undefined`', () => {
    const code = deserializeDslWorkflow({
      ...graph({
        start: {
          nodeId: 'start',
          flow: 'filter',
          sourceVar: 'data.users',
          itemVar: 'u',
          condition: { type: 'simple', expression: 'u.active' },
        },
      }),
      source: 'dsl',
    })

    assert.ok(
      !code.includes('const undefined'),
      `an unbound filter must not emit a syntactically invalid binding, got:\n${code}`
    )
  })

  test('an unbound some/every does not declare `const undefined`', () => {
    const code = deserializeDslWorkflow({
      ...graph({
        start: {
          nodeId: 'start',
          flow: 'arrayPredicate',
          mode: 'some',
          sourceVar: 'data.users',
          itemVar: 'u',
          condition: { type: 'simple', expression: 'u.active' },
        },
      }),
      source: 'dsl',
    })

    assert.ok(
      !code.includes('const undefined'),
      `an unbound predicate must not emit a syntactically invalid binding, got:\n${code}`
    )
  })
})
