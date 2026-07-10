import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'

describe('serializeWorkflowTypes', () => {
  const emit = () =>
    serializeWorkflowTypes(
      './pikku-function-types.gen.js',
      './pikku-rpc-map.gen.js',
      './pikku-workflow-map.gen.js',
      './pikku-agent-map.gen.js'
    )

  test('imports the agent map so agent names are known to the graph', () => {
    const result = emit()
    assert.match(
      result,
      /import type \{ AgentMap as FlattenedAgentMap \} from '\.\/pikku-agent-map\.gen\.js'/
    )
  })

  test('pikkuWorkflowGraph node funcs admit RPC, workflow and agent names', () => {
    const result = emit()
    assert.match(result, /keyof FlattenedRPCMap & string/)
    assert.match(result, /keyof FlattenedWorkflowMap & string/)
    assert.match(result, /keyof FlattenedAgentMap & string/)
  })

  test('ref() resolves output keys for an agent-name node', () => {
    const result = emit()
    assert.match(
      result,
      /keyof FlattenedAgentMap\[FuncMap\[N\]\]\['output'\] & string/
    )
  })
})
