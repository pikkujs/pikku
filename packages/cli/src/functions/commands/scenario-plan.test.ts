import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { buildScenarioPlan } from './scenario-plan.js'
import type { ScenarioPlanInput } from './scenario-plan.js'

const scenarioConfig = (tags: string[] = []) =>
  ({ tags, func: async () => ({}) }) as any

/**
 * Mirrors what the runner sees: scenarios registered under their export name,
 * features holding the very config objects those registrations hold.
 */
const fixture = () => {
  const lazyLoad = scenarioConfig(['credential'])
  const roundTrip = scenarioConfig(['credential'])
  const standalone = scenarioConfig(['smoke'])

  const registrations = new Map<string, any>([
    ['lazyLoadScenario', { name: 'lazyLoadScenario', func: lazyLoad }],
    ['roundTripScenario', { name: 'roundTripScenario', func: roundTrip }],
    ['smokeScenario', { name: 'smokeScenario', func: standalone }],
  ])

  const before = async () => {}
  const after = async () => {}

  const features = new Map<string, any>([
    [
      'credentialFeature',
      {
        name: 'Credential API',
        tags: ['nightly'],
        before,
        after,
        scenarios: [
          lazyLoad,
          ...['stripe', 'google'].map((name) => ({
            scenario: roundTrip,
            data: { name },
          })),
        ],
      },
    ],
  ])

  const scenarios = [
    { name: 'lazyLoadScenario', tags: ['credential'] },
    { name: 'roundTripScenario', tags: ['credential'] },
    { name: 'smokeScenario', tags: ['smoke'] },
  ]

  return { registrations, features, scenarios, before, after }
}

const plan = (overrides: Partial<ScenarioPlanInput> = {}) => {
  const { registrations, features, scenarios } = fixture()
  return buildScenarioPlan({
    scenarios,
    features,
    registrations,
    ...overrides,
  })
}

describe('buildScenarioPlan', () => {
  test('a feature is one group, its scenarios in declaration order', () => {
    const { groups } = plan()
    assert.equal(groups.length, 2)
    assert.equal(groups[0]!.featureId, 'credentialFeature')
    assert.equal(groups[0]!.featureName, 'Credential API')
    assert.deepEqual(
      groups[0]!.entries.map((e) => [e.scenarioName, e.data]),
      [
        ['lazyLoadScenario', undefined],
        ['roundTripScenario', { name: 'stripe' }],
        ['roundTripScenario', { name: 'google' }],
      ]
    )
  })

  test('a scenario in no feature is its own group with no hooks', () => {
    const { groups } = plan()
    const standalone = groups[1]!
    assert.equal(standalone.featureId, undefined)
    assert.equal(standalone.before, undefined)
    assert.equal(standalone.after, undefined)
    assert.deepEqual(
      standalone.entries.map((e) => e.scenarioName),
      ['smokeScenario']
    )
  })

  test('a feature carries its hooks so they run once around the group', () => {
    const { before, after, ...rest } = fixture()
    const { groups } = buildScenarioPlan({
      scenarios: rest.scenarios,
      features: rest.features,
      registrations: rest.registrations,
    })
    assert.equal(groups[0]!.before, before)
    assert.equal(groups[0]!.after, after)
  })

  test('a scenario in a feature is not also run standalone', () => {
    const { groups } = plan()
    const runs = groups.flatMap((g) => g.entries.map((e) => e.scenarioName))
    assert.equal(runs.filter((n) => n === 'lazyLoadScenario').length, 1)
  })

  test("--tags matches a feature's tags as well as the scenario's", () => {
    const { groups } = plan({ tags: ['nightly'] })
    assert.deepEqual(
      groups.map((g) => g.featureId),
      ['credentialFeature'],
      'nightly is only on the feature, and must still select through it'
    )
    assert.equal(groups[0]!.entries.length, 3)
  })

  test('--tags narrowing a feature keeps the feature as the run unit', () => {
    const { groups } = plan({ tags: ['smoke'] })
    assert.deepEqual(
      groups.map((g) => g.entries.map((e) => e.scenarioName)),
      [['smokeScenario']]
    )
  })

  test('--features selects whole features and drops standalone scenarios', () => {
    const { groups } = plan({ featureIds: ['credentialFeature'] })
    assert.deepEqual(
      groups.map((g) => g.featureId),
      ['credentialFeature']
    )
  })

  test('--features with an unknown id lists what exists', () => {
    assert.throws(() => plan({ featureIds: ['nope'] }), /credentialFeature/)
  })

  test('--flows on a void-input scenario keeps its feature hooks', () => {
    const { groups } = plan({ flows: ['lazyLoadScenario'] })
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.featureId, 'credentialFeature')
    assert.notEqual(groups[0]!.before, undefined)
    assert.deepEqual(
      groups[0]!.entries.map((e) => e.scenarioName),
      ['lazyLoadScenario']
    )
  })

  test('--flows on a scenario only ever run with feature data names its features', () => {
    assert.throws(
      () => plan({ flows: ['roundTripScenario'] }),
      /--features credentialFeature/
    )
  })

  test('--flows on a scenario in no feature runs it, whatever its input type', () => {
    // Most scenario inputs are all-optional (`{ value?: number }`) and run fine
    // standalone. Only a scenario whose every appearance is parameterised has
    // nothing to run with on its own.
    const { groups } = plan({ flows: ['smokeScenario'] })
    assert.deepEqual(
      groups.map((g) => g.entries.map((e) => e.scenarioName)),
      [['smokeScenario']]
    )
  })

  test('a scenario referenced bare anywhere still runs standalone', () => {
    const { registrations, features, scenarios } = fixture()
    const roundTrip = registrations.get('roundTripScenario')!.func
    features.get('credentialFeature')!.scenarios.push(roundTrip as any)
    const { groups } = buildScenarioPlan({
      scenarios,
      features,
      registrations,
      flows: ['roundTripScenario'],
    })
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.entries.length, 3)
  })

  test('--flows with an unknown name lists what exists', () => {
    assert.throws(
      () => plan({ flows: ['nope'] }),
      /Unknown scenario\(s\): nope/
    )
  })

  test('a feature entry whose scenario is unregistered is reported', () => {
    const { registrations, features, scenarios } = fixture()
    registrations.delete('roundTripScenario')
    const { unresolved } = buildScenarioPlan({
      scenarios,
      features,
      registrations,
    })
    assert.deepEqual(unresolved, [
      { featureId: 'credentialFeature', index: 1 },
      { featureId: 'credentialFeature', index: 2 },
    ])
  })

  test('no features at all leaves every scenario standalone', () => {
    const { registrations, scenarios } = fixture()
    const { groups } = buildScenarioPlan({
      scenarios,
      features: new Map(),
      registrations,
    })
    assert.equal(groups.length, 3)
    assert.ok(groups.every((g) => g.featureId === undefined))
  })
})

/**
 * A scenario carrying `skip` states, in code, why it is not part of a default
 * run — a quarantine that travels with the scenario instead of living in a CI
 * invocation nobody reads. It still appears in the plan, marked, so the runner
 * can report it rather than silently omit it.
 */
describe('buildScenarioPlan skip', () => {
  const skipFixture = () => {
    const { registrations, features } = fixture()
    const scenarios = [
      { name: 'lazyLoadScenario', tags: ['credential'] },
      { name: 'roundTripScenario', tags: ['credential'] },
      {
        name: 'smokeScenario',
        tags: ['smoke'],
        skip: 'needs a fresh server',
      },
    ]
    return { registrations, features, scenarios }
  }

  const skipPlan = (overrides: Partial<ScenarioPlanInput> = {}) => {
    const { registrations, features, scenarios } = skipFixture()
    return buildScenarioPlan({
      scenarios,
      features,
      registrations,
      ...overrides,
    })
  }

  test('a skipped scenario stays in the plan carrying its reason', () => {
    const { groups } = skipPlan()
    const smoke = groups
      .flatMap((group) => group.entries)
      .find((entry) => entry.scenarioName === 'smokeScenario')
    assert.equal(smoke?.skip, 'needs a fresh server')
  })

  test('an unskipped scenario carries no reason', () => {
    const { groups } = skipPlan()
    const lazy = groups
      .flatMap((group) => group.entries)
      .find((entry) => entry.scenarioName === 'lazyLoadScenario')
    assert.equal(lazy?.skip, undefined)
  })

  test('naming a skipped scenario with --flows runs it anyway', () => {
    const { groups } = skipPlan({ flows: ['smokeScenario'] })
    const entries = groups.flatMap((group) => group.entries)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]!.scenarioName, 'smokeScenario')
    assert.equal(entries[0]!.skip, undefined)
  })

  test('selecting its feature does not un-skip it', () => {
    const { registrations, features } = skipFixture()
    const { groups } = buildScenarioPlan({
      scenarios: [
        {
          name: 'lazyLoadScenario',
          tags: ['credential'],
          skip: 'needs a fresh server',
        },
        { name: 'roundTripScenario', tags: ['credential'] },
      ],
      features,
      registrations,
      featureIds: ['credentialFeature'],
    })
    const lazy = groups
      .flatMap((group) => group.entries)
      .find((entry) => entry.scenarioName === 'lazyLoadScenario')
    assert.equal(lazy?.skip, 'needs a fresh server')
  })
})
