import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeScenarioTypes } from './serialize-scenario-types.js'

describe('serializeScenarioTypes', () => {
  const emit = () =>
    serializeScenarioTypes(
      '../function/pikku-function-types.gen.js',
      '../workflow/pikku-workflow-types.gen.js',
      '../workflow/pikku-scenario-step-map.gen.js',
      './pikku-personas.gen.js'
    )

  test('extends the workflow wire rather than redeclaring it', () => {
    const result = emit()
    assert.match(
      result,
      /import type \{ TypedWorkflow \} from '\.\.\/workflow\/pikku-workflow-types\.gen\.js'/
    )
    assert.match(
      result,
      /export type TypedScenario<Out = unknown> = TypedWorkflow &/
    )
  })

  describe('scenario steps', () => {
    test('emits the pikkuScenarioStep factory', () => {
      assert.match(emit(), /export function pikkuScenarioStep/)
    })

    test('each surface binding is typed independently', () => {
      const result = emit()
      assert.match(result, /export type PikkuFunctionScenarioStep</)
      // A binding gets its own surface on the wire and nobody else's, so a
      // browser binding sees `wire.browser` and a cli binding does not.
      assert.match(
        result,
        /\| \(Surface extends 'default' \? never : Surface\)/
      )
      // And a step that runs as somebody gets the actor as a required wire
      // member — which is the whole reason it is a member and not a property of
      // `scenarioStep`, where it could only ever be optional for everyone.
      assert.match(result, /\| \(HasActor extends true \? 'actor' : never\)/)
      for (const surface of ['browser', 'cli', 'default']) {
        assert.match(
          result,
          new RegExp(`${surface}\\?: PikkuFunctionScenarioStep<`),
          `expected a '${surface}' binding on the step config`
        )
      }
    })

    test('a step declaring no binding is rejected at registration', () => {
      assert.match(emit(), /declares no surface bindings/)
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
      // `actor` goes with them: nobody is behind "the platform expired the
      // trial", so there is no persona to declare.
      assert.match(
        result,
        /PikkuScenarioStepConfigWithSchema<InputSchema, OutputSchema>,\n  'browser' \| 'cli' \| 'default' \| 'actor'\n> & \{\n  func:/
      )
      assert.match(
        result,
        /Omit<PikkuScenarioStepConfig<In, Out>, 'browser' \| 'cli' \| 'default' \| 'actor'> & \{\n    func:/
      )
    })

    test('an addon step must name the addon whose system acts', () => {
      assert.match(
        emit(),
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

    test('TypedScenario narrows given/when/then over the step map', () => {
      const result = emit()
      for (const phase of ['given', 'when', 'then']) {
        assert.match(
          result,
          new RegExp(`${phase}<K extends keyof FlattenedScenarioStepMap>`),
          `expected TypedScenario to declare a typed '${phase}' overload`
        )
      }
    })

    // A step that says what it does without saying whether it is setup, action
    // or claim is the one nobody can read back — and it was the phase to reach
    // for when a scenario wanted to dodge the assertion lint.
    test('the phaseless step is gone', () => {
      assert.doesNotMatch(
        emit(),
        /step<K extends keyof FlattenedScenarioStepMap>/
      )
    })
  })

  // The scenario config shares most of its fields with the workflow config. It
  // spells them out rather than importing the workflow's own config type, which
  // is private — exporting it just to be `Omit`ed from would put a name back on
  // the public surface to serve a generator-internal relationship.
  test('carries the shared config fields without importing a private type', () => {
    const result = emit()
    for (const field of [
      'title?: string',
      'tags?: string[]',
      'inline?: boolean',
    ]) {
      assert.ok(
        result.includes(field),
        `expected '${field}' on the scenario config`
      )
    }
    assert.doesNotMatch(result, /PikkuWorkflowConfigWithSchema/)
  })
})
