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

  describe('scenario steps', () => {
    test('emits the pikkuScenarioStep factory', () => {
      const result = emit()
      assert.match(result, /export function pikkuScenarioStep/)
    })

    test('a browser step gets a non-optional browser wire', () => {
      const result = emit()
      assert.match(result, /export type PikkuFunctionScenarioStep</)
      assert.match(
        result,
        /B extends true \? 'scenarioStep' \| 'browser' : 'scenarioStep'/
      )
    })

    test('TypedScenario narrows step/given/when/then over the step map', () => {
      const result = emit()
      for (const phase of ['step', 'given', 'when', 'then']) {
        assert.match(
          result,
          new RegExp(`${phase}<K extends keyof FlattenedScenarioStepMap>`),
          `expected TypedScenario to declare a typed '${phase}' overload`
        )
      }
    })
  })
})
