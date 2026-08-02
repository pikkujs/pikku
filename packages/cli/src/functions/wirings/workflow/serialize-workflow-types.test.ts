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

    test('the platform and addon kinds are their own declarations', () => {
      const result = emit()
      assert.match(result, /export function pikkuPlatformScenarioStep/)
      assert.match(result, /export function pikkuAddonScenarioStep/)
    })

    // `func` rather than `default:` is structural, not cosmetic: `default` means
    // the fallback when no other surface applies, which implies others could
    // exist. Neither of these has a surface — nobody clicks "Stripe's webhook
    // arrives" — so the config has exactly one witness by construction.
    test('neither takes surface bindings — one `func`, no witnesses to disagree', () => {
      const result = emit()
      assert.match(
        result,
        /PikkuScenarioStepConfigWithSchema<InputSchema, OutputSchema>,\n  'browser' \| 'cli' \| 'default'\n> & \{\n  func:/
      )
      assert.match(
        result,
        /Omit<PikkuScenarioStepConfig<In, Out>, 'browser' \| 'cli' \| 'default'> & \{\n    func:/
      )
    })

    test('an addon step must name the addon whose system acts', () => {
      const result = emit()
      assert.match(
        result,
        /config: PikkuSubjectScenarioStepConfigWithSchema<InputSchema, OutputSchema> & \{ addon: string \}/
      )
    })

    // Deleted with the collapse into personas — a virtual user is a persona run,
    // not its own declaration.
    test('pikkuVirtualUser is gone', () => {
      const result = emit()
      assert.doesNotMatch(result, /pikkuVirtualUser/)
      assert.doesNotMatch(result, /PikkuVirtualUserConfig/)
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
