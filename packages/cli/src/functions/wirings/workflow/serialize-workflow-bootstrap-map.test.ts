import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { serializeWorkflowBootstrapMap } from './serialize-workflow-bootstrap-map.js'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-workflow-bootstrap-map.gen.d.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const graphWithNode = (nodeId: string): SerializedWorkflowGraphs =>
  ({
    aScenario: { nodes: { [nodeId]: {} } },
  }) as unknown as SerializedWorkflowGraphs

describe('serializeWorkflowBootstrapMap', () => {
  test('emits a parseable map for an ordinary node name', () => {
    const output = serializeWorkflowBootstrapMap(
      {} as WorkflowsMeta,
      graphWithNode('the guest reads a credential')
    )
    assert.deepEqual(parseErrors(output), [])
  })

  /**
   * A scenario step name is free-form prose written by a human, so an
   * apostrophe in it is ordinary. Interpolated into a single-quoted key it
   * terminates the string and the whole `.d.ts` stops parsing.
   */
  test('emits a parseable map for a node name containing an apostrophe', () => {
    const output = serializeWorkflowBootstrapMap(
      {} as WorkflowsMeta,
      graphWithNode("the guest reads someone else's credential")
    )
    assert.deepEqual(parseErrors(output), [])
  })

  test('emits a parseable map for a node name containing a backslash', () => {
    const output = serializeWorkflowBootstrapMap(
      {} as WorkflowsMeta,
      graphWithNode('a name with a \\ in it')
    )
    assert.deepEqual(parseErrors(output), [])
  })
})
