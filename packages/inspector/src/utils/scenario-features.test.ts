import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { validateScenarioFeatures } from './post-process.js'
import type { InspectorState, InspectorFeature } from '../types.js'
import { ErrorCode, type CodedDiagnostic } from '../error-codes.js'

const feature = (
  exportedName: string,
  scenarios: string[],
  unresolvedEntries = 0
): InspectorFeature =>
  ({
    path: `/project/test/${exportedName}.ts`,
    exportedName,
    entries: scenarios.map((scenario) => ({ scenario })),
    unresolvedEntries,
    hasBefore: false,
    hasAfter: false,
  }) as InspectorFeature

const stateWith = (
  scenarios: string[],
  features: InspectorFeature[]
): InspectorState =>
  ({
    workflows: {
      meta: Object.fromEntries(
        scenarios.map((name) => [name, { scenario: true }])
      ),
      files: new Map(),
      featureFiles: new Map(features.map((f) => [f.exportedName, f])),
    },
  }) as unknown as InspectorState

const collect = () => {
  const seen: CodedDiagnostic[] = []
  return {
    seen,
    logger: { diagnostic: (d: CodedDiagnostic) => seen.push(d) } as never,
  }
}

describe('validateScenarioFeatures', () => {
  test('a scenario no feature lists is reported', () => {
    const { seen, logger } = collect()
    validateScenarioFeatures(
      logger,
      stateWith(['ownedScenario', 'strayScenario'], [
        feature('libraryFeature', ['ownedScenario']),
      ])
    )
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.code, ErrorCode.SCENARIO_HAS_NO_FEATURE)
    assert.equal(seen[0]!.severity, 'error')
    assert.match(seen[0]!.message, /strayScenario/)
  })

  test('a fully owned suite says nothing', () => {
    const { seen, logger } = collect()
    validateScenarioFeatures(
      logger,
      stateWith(['a', 'b'], [feature('f', ['a', 'b'])])
    )
    assert.deepEqual(seen, [])
  })

  test('a workflow that is not a scenario is not expected to have one', () => {
    const { seen, logger } = collect()
    const state = stateWith([], [])
    ;(state.workflows.meta as Record<string, unknown>)['someWorkflow'] = {}
    validateScenarioFeatures(logger, state)
    assert.deepEqual(seen, [])
  })

  // One feature nobody can read blinds the whole project, so the suppression
  // has to be louder than the thing it suppresses.
  test('an unreadable feature suppresses the check and says which one', () => {
    const { seen, logger } = collect()
    validateScenarioFeatures(
      logger,
      stateWith(['stray'], [feature('spreadFeature', [], 3)])
    )
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.severity, 'warn')
    assert.match(seen[0]!.message, /spreadFeature/)
    assert.doesNotMatch(seen[0]!.message, /stray/)
  })
})
