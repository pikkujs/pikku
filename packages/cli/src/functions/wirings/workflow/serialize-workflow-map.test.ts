import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import type { TypesMap } from '@pikku/inspector'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'
import type { FunctionsMeta } from '@pikku/core'
import type { Logger } from '@pikku/core/services'
import type { WorkflowsMeta } from '@pikku/core/workflow'

const logger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
} as unknown as Logger

const typesMap = {
  getTypeMeta: () => ({ uniqueName: 'unknown' }),
  customTypes: new Map(),
} as unknown as TypesMap

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-workflow-map.gen.d.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const serializeWithNode = (nodeId: string) =>
  serializeWorkflowMap(
    logger,
    '.pikku',
    {},
    typesMap,
    {
      readsThing: { pikkuFuncName: 'readsThing', inputs: null, outputs: null },
    } as unknown as FunctionsMeta,
    {} as WorkflowsMeta,
    {
      aScenario: { nodes: { [nodeId]: { rpcName: 'readsThing' } } },
    } as unknown as SerializedWorkflowGraphs
  )

describe('serializeWorkflowMap', () => {
  test('emits a parseable map for an ordinary node name', () => {
    assert.deepEqual(
      parseErrors(serializeWithNode('the guest reads a credential')),
      []
    )
  })

  /**
   * A scenario step name is free-form prose written by a human, so an
   * apostrophe in it is ordinary. Interpolated into a single-quoted key it
   * terminates the string and the whole `.d.ts` stops parsing.
   */
  test('emits a parseable map for a node name containing an apostrophe', () => {
    assert.deepEqual(
      parseErrors(
        serializeWithNode("the guest reads someone else's credential")
      ),
      []
    )
  })
})
