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

    test('each surface binding is typed independently', () => {
      const result = emit()
      assert.match(result, /export type PikkuFunctionScenarioStep</)
      // A binding gets its own surface on the wire and nobody else's, so a
      // browser binding sees `wire.browser` and a cli binding does not.
      assert.match(
        result,
        /Surface extends 'default' \? 'scenarioStep' : 'scenarioStep' \| Surface/
      )
      for (const surface of ['browser', 'cli', 'default']) {
        assert.match(
          result,
          new RegExp(`${surface}\\?: PikkuFunctionScenarioStep<`),
          `expected a '${surface}' binding on the step config`
        )
      }
    })

    test('a step declaring no binding is rejected at registration', () => {
      const result = emit()
      assert.match(result, /declares no surface bindings/)
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
