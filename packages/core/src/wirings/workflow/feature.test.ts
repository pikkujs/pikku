import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveFeatureScenarios } from './feature.js'
import type { CoreFeature, CoreWorkflow } from './workflow.types.js'

const scenario = (tags: string[] = []) =>
  ({ tags, func: async () => ({}) }) as any

const registered = (entries: Array<[string, any]>): Map<string, CoreWorkflow> =>
  new Map(entries.map(([name, func]) => [name, { name, func }]))

describe('resolveFeatureScenarios', () => {
  test('resolves imported identifiers to the names they are registered under', () => {
    const lazyLoad = scenario()
    const roundTrip = scenario()
    const features = new Map<string, CoreFeature>([
      [
        'credentialFeature',
        {
          name: 'Credential API',
          scenarios: [lazyLoad, roundTrip],
        },
      ],
    ])

    const { entries, unresolved } = resolveFeatureScenarios(
      features,
      registered([
        ['credentialLazyLoadScenario', lazyLoad],
        ['credentialRoundTripScenario', roundTrip],
      ])
    )

    assert.deepEqual(unresolved, [])
    assert.deepEqual(
      entries.map((e) => e.scenarioName),
      ['credentialLazyLoadScenario', 'credentialRoundTripScenario']
    )
    assert.equal(entries[0]!.featureName, 'Credential API')
    assert.equal(entries[0]!.featureId, 'credentialFeature')
  })

  test('keeps declaration order, including repeats of the same scenario', () => {
    const roundTrip = scenario()
    const features = new Map<string, CoreFeature>([
      [
        'credentialFeature',
        {
          name: 'Credential API',
          scenarios: ['stripe', 'google', 'hmac-key'].map((name) => ({
            scenario: roundTrip,
            data: { name },
          })),
        },
      ],
    ])

    const { entries } = resolveFeatureScenarios(
      features,
      registered([['credentialRoundTripScenario', roundTrip]])
    )

    assert.equal(entries.length, 3, 'a mapped loop is three separate runs')
    assert.deepEqual(
      entries.map((e) => e.data),
      [{ name: 'stripe' }, { name: 'google' }, { name: 'hmac-key' }]
    )
    assert.ok(
      entries.every((e) => e.scenarioName === 'credentialRoundTripScenario')
    )
  })

  test('a bare reference carries no data', () => {
    const lazyLoad = scenario()
    const { entries } = resolveFeatureScenarios(
      new Map([['f', { name: 'F', scenarios: [lazyLoad] } as CoreFeature]]),
      registered([['lazyLoadScenario', lazyLoad]])
    )
    assert.equal(entries[0]!.data, undefined)
  })

  test("a scenario's effective tags union its own with the feature's", () => {
    const lazyLoad = scenario(['scenario', 'credential'])
    const { entries } = resolveFeatureScenarios(
      new Map([
        [
          'f',
          {
            name: 'F',
            tags: ['nightly', 'credential'],
            scenarios: [lazyLoad],
          } as CoreFeature,
        ],
      ]),
      registered([['lazyLoadScenario', lazyLoad]])
    )
    assert.deepEqual(entries[0]!.tags, ['scenario', 'credential', 'nightly'])
  })

  test('an unregistered scenario is reported, never silently matched by shape', () => {
    const registeredScenario = scenario()
    const lookalike = scenario()
    const { entries, unresolved } = resolveFeatureScenarios(
      new Map([
        [
          'f',
          {
            name: 'F',
            scenarios: [registeredScenario, lookalike],
          } as CoreFeature,
        ],
      ]),
      registered([['realScenario', registeredScenario]])
    )
    assert.deepEqual(
      entries.map((e) => e.scenarioName),
      ['realScenario']
    )
    assert.deepEqual(unresolved, [{ featureId: 'f', index: 1 }])
  })

  test('a feature with no scenarios contributes nothing', () => {
    const { entries, unresolved } = resolveFeatureScenarios(
      new Map([['f', { name: 'F', scenarios: [] } as CoreFeature]]),
      registered([])
    )
    assert.deepEqual(entries, [])
    assert.deepEqual(unresolved, [])
  })
})
