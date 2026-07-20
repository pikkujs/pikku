import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { createWorkflowFlow } from './create-workflow-flow.js'

/**
 * The serialized graph the inspector emits, as the console receives it. Typed
 * loosely on purpose: WorkflowsMeta describes the meta envelope, while the
 * renderer reads the `nodes` map the inspector writes into it.
 */
function graphOf(nodes: Record<string, unknown>, entryNodeIds: string[]): any {
  return {
    name: 'testWorkflow',
    type: 'graph',
    nodes,
    entryNodeIds,
  }
}

describe('createWorkflowFlow — compensation edges', () => {
  test('an onError route is drawn to its handler', () => {
    const { nodes, edges } = createWorkflowFlow(
      graphOf(
        {
          Charge: {
            nodeId: 'Charge',
            rpcName: 'chargeCard',
            stepName: 'Charge',
            onError: 'Charge_onError',
            next: 'Ship',
          },
          Charge_onError: {
            nodeId: 'Charge_onError',
            rpcName: 'refundOrder',
            stepName: 'Charge (on error)',
          },
          Ship: { nodeId: 'Ship', rpcName: 'shipOrder', stepName: 'Ship' },
        },
        ['Charge']
      )
    )

    const rendered = nodes.map((n) => n.id)
    assert.ok(
      rendered.includes('Charge_onError'),
      `the handler must be drawn, got: ${JSON.stringify(rendered)}`
    )

    const errorEdge = edges.find(
      (e) => e.source === 'Charge' && e.target === 'Charge_onError'
    )
    assert.ok(
      errorEdge,
      `an edge must connect the step to its handler, got: ${JSON.stringify(
        edges.map((e) => `${e.source}->${e.target}`)
      )}`
    )
    assert.equal(errorEdge.label, 'on error')
  })

  test('the compensation edge is styled apart from the happy path', () => {
    const { edges } = createWorkflowFlow(
      graphOf(
        {
          Charge: {
            nodeId: 'Charge',
            rpcName: 'chargeCard',
            stepName: 'Charge',
            onError: 'Charge_onError',
            next: 'Ship',
          },
          Charge_onError: {
            nodeId: 'Charge_onError',
            rpcName: 'refundOrder',
            stepName: 'Charge (on error)',
          },
          Ship: { nodeId: 'Ship', rpcName: 'shipOrder', stepName: 'Ship' },
        },
        ['Charge']
      )
    )

    const errorEdge = edges.find((e) => e.target === 'Charge_onError')!
    const happyEdge = edges.find((e) => e.target === 'Ship')!

    assert.equal(
      (errorEdge.style as any)?.strokeDasharray,
      '4 4',
      'a failure route should read as an aside, not another sequential step'
    )
    assert.notEqual(
      (errorEdge.style as any)?.stroke,
      (happyEdge.style as any)?.stroke,
      'the two routes must be visually distinguishable'
    )
  })

  test('a step without onError gets no compensation edge', () => {
    const { edges } = createWorkflowFlow(
      graphOf(
        {
          Charge: {
            nodeId: 'Charge',
            rpcName: 'chargeCard',
            stepName: 'Charge',
            next: 'Ship',
          },
          Ship: { nodeId: 'Ship', rpcName: 'shipOrder', stepName: 'Ship' },
        },
        ['Charge']
      )
    )

    assert.equal(
      edges.filter((e) => e.label === 'on error').length,
      0,
      'no handler configured means nothing to draw'
    )
  })
})

describe('createWorkflowFlow — basics', () => {
  test('an empty graph renders nothing rather than throwing', () => {
    const { nodes, edges } = createWorkflowFlow(graphOf({}, []))
    assert.equal(nodes.length, 0)
    assert.equal(edges.length, 0)
  })

  test('sequential steps are chained by their next edges', () => {
    const { nodes, edges } = createWorkflowFlow(
      graphOf(
        {
          A: { nodeId: 'A', rpcName: 'first', stepName: 'A', next: 'B' },
          B: { nodeId: 'B', rpcName: 'second', stepName: 'B' },
        },
        ['A']
      )
    )

    assert.equal(nodes.length, 2)
    assert.ok(
      edges.some((e) => e.source === 'A' && e.target === 'B'),
      `A should flow into B, got: ${JSON.stringify(
        edges.map((e) => `${e.source}->${e.target}`)
      )}`
    )
  })
})
