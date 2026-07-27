import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { buildScenarioDocs, filterFeatures } from './scenario-doc-model.js'

const scenarioMeta = (
  name: string,
  overrides: Record<string, unknown> = {}
) => ({
  name,
  source: 'scenario',
  actors: ['admin'],
  nodes: {
    step_0: {
      nodeId: 'step_0',
      flow: 'branch',
      branches: [],
      next: 'opens it',
    },
    'opens it': {
      nodeId: 'opens it',
      rpcName: 'opensConsolePage',
      scenarioStepPhase: 'given',
      actor: 'admin',
      next: 'sees it',
    },
    'sees it': {
      nodeId: 'sees it',
      rpcName: 'seesTestId',
      scenarioStepPhase: 'then',
      actor: 'admin',
    },
  },
  entryNodeIds: ['step_0'],
  ...overrides,
})

const feature = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  tags: [],
  entries: [],
  unresolvedEntries: 0,
  hasBefore: false,
  hasAfter: false,
  ...overrides,
})

describe('buildScenarioDocs', () => {
  test('groups scenarios under their feature, in declared order', () => {
    const docs = buildScenarioDocs({
      workflows: {
        b: scenarioMeta('b'),
        a: scenarioMeta('a'),
      },
      features: {
        addonsFeature: feature('addonsFeature', {
          name: 'Addons Page',
          description: 'The gallery',
          entries: [{ scenario: 'b' }, { scenario: 'a' }],
        }),
      },
    })

    assert.equal(docs.features.length, 1)
    assert.equal(docs.features[0]!.name, 'Addons Page')
    assert.deepEqual(
      docs.features[0]!.scenarios.map((entry) => entry.scenario.name),
      ['b', 'a']
    )
    assert.deepEqual(docs.ungrouped, [])
  })

  test('renders each step as a phase-tagged sentence in flow order', () => {
    const docs = buildScenarioDocs({
      workflows: { a: scenarioMeta('a') },
      features: {
        f: feature('f', { entries: [{ scenario: 'a' }] }),
      },
    })

    assert.deepEqual(docs.features[0]!.scenarios[0]!.scenario.steps, [
      {
        id: 'opens it',
        phase: 'given',
        sentence: 'opens it',
        depth: 0,
        actor: 'admin',
      },
      {
        id: 'sees it',
        phase: 'then',
        sentence: 'sees it',
        depth: 0,
        actor: 'admin',
      },
    ])
  })

  test('drops the structural branch and trailing return nodes', () => {
    const docs = buildScenarioDocs({
      workflows: {
        a: scenarioMeta('a', {
          nodes: {
            step_0: {
              nodeId: 'step_0',
              flow: 'branch',
              branches: [],
              next: 'does it',
            },
            'does it': {
              nodeId: 'does it',
              rpcName: 'doesIt',
              scenarioStepPhase: 'when',
              next: 'step_9',
            },
            step_9: { nodeId: 'step_9', flow: 'return' },
          },
        }),
      },
      features: { f: feature('f', { entries: [{ scenario: 'a' }] }) },
    })

    assert.deepEqual(
      docs.features[0]!.scenarios[0]!.scenario.steps.map((s) => s.id),
      ['does it']
    )
  })

  test('falls back to the rpc name for an unnamed positional step', () => {
    const docs = buildScenarioDocs({
      workflows: {
        a: scenarioMeta('a', {
          nodes: {
            step_1: { nodeId: 'step_1', rpcName: 'signsIn' },
          },
          entryNodeIds: ['step_1'],
        }),
      },
      features: { f: feature('f', { entries: [{ scenario: 'a' }] }) },
    })

    assert.equal(
      docs.features[0]!.scenarios[0]!.scenario.steps[0]!.sentence,
      'signsIn'
    )
  })

  test('defaults a step with no declared phase to a plain step', () => {
    const docs = buildScenarioDocs({
      workflows: {
        a: scenarioMeta('a', {
          nodes: { 'just does it': { nodeId: 'just does it', rpcName: 'x' } },
          entryNodeIds: ['just does it'],
        }),
      },
      features: { f: feature('f', { entries: [{ scenario: 'a' }] }) },
    })

    assert.equal(
      docs.features[0]!.scenarios[0]!.scenario.steps[0]!.phase,
      'step'
    )
  })

  test('puts a scenario in no feature into the ungrouped bucket', () => {
    const docs = buildScenarioDocs({
      workflows: { lonely: scenarioMeta('lonely'), a: scenarioMeta('a') },
      features: { f: feature('f', { entries: [{ scenario: 'a' }] }) },
    })

    assert.deepEqual(
      docs.ungrouped.map((s) => s.name),
      ['lonely']
    )
  })

  test('excludes the fixtures the scenario suite uses to test itself', () => {
    const docs = buildScenarioDocs({
      workflows: {
        fixture: scenarioMeta('fixture', { tags: ['test-fixture'] }),
      },
      features: {},
    })

    assert.deepEqual(docs.ungrouped, [])
  })

  test('excludes plain workflows that are not scenarios', () => {
    const docs = buildScenarioDocs({
      workflows: { plain: { name: 'plain', source: 'workflow', nodes: {} } },
      features: {},
    })

    assert.deepEqual(docs.ungrouped, [])
  })

  test('carries the skip reason through so it can be read', () => {
    const docs = buildScenarioDocs({
      workflows: {
        a: scenarioMeta('a', { skip: 'needs a live Stripe key' }),
      },
      features: { f: feature('f', { entries: [{ scenario: 'a' }] }) },
    })

    assert.equal(
      docs.features[0]!.scenarios[0]!.scenario.skip,
      'needs a live Stripe key'
    )
  })

  test('keeps an Examples row alongside the scenario it parameterises', () => {
    const docs = buildScenarioDocs({
      workflows: { a: scenarioMeta('a') },
      features: {
        f: feature('f', {
          entries: [
            { scenario: 'a', data: { name: 'stripe' } },
            { scenario: 'a', data: { name: 'google' } },
          ],
        }),
      },
    })

    assert.deepEqual(
      docs.features[0]!.scenarios.map((entry) => entry.data),
      [{ name: 'stripe' }, { name: 'google' }]
    )
  })

  test("a scenario's effective tags union its own with its feature's", () => {
    const docs = buildScenarioDocs({
      workflows: { a: scenarioMeta('a', { tags: ['scenario', 'console'] }) },
      features: {
        f: feature('f', { tags: ['addons'], entries: [{ scenario: 'a' }] }),
      },
    })

    assert.deepEqual(docs.features[0]!.scenarios[0]!.scenario.tags, [
      'addons',
      'console',
      'scenario',
    ])
  })

  test('collects every distinct tag for the filter, sorted', () => {
    const docs = buildScenarioDocs({
      workflows: {
        a: scenarioMeta('a', { tags: ['console'] }),
        b: scenarioMeta('b', { tags: ['agent-protocol'] }),
      },
      features: {
        f: feature('f', { tags: ['addons'], entries: [{ scenario: 'a' }] }),
      },
    })

    assert.deepEqual(docs.tags, ['addons', 'agent-protocol', 'console'])
  })

  test('reports a feature whose listing is partial', () => {
    const docs = buildScenarioDocs({
      workflows: { a: scenarioMeta('a') },
      features: {
        f: feature('f', {
          entries: [{ scenario: 'a' }],
          unresolvedEntries: 2,
          hasBefore: true,
        }),
      },
    })

    assert.equal(docs.features[0]!.unresolvedEntries, 2)
    assert.equal(docs.features[0]!.hasBefore, true)
  })

  test('skips a feature entry whose scenario has no meta', () => {
    const docs = buildScenarioDocs({
      workflows: { a: scenarioMeta('a') },
      features: {
        f: feature('f', {
          entries: [{ scenario: 'a' }, { scenario: 'deletedScenario' }],
        }),
      },
    })

    assert.deepEqual(
      docs.features[0]!.scenarios.map((entry) => entry.scenario.name),
      ['a']
    )
  })

  test('an empty project yields empty everything', () => {
    const docs = buildScenarioDocs({ workflows: {}, features: {} })

    assert.deepEqual(docs, { features: [], ungrouped: [], tags: [] })
  })
})

describe('filterFeatures', () => {
  const docs = () =>
    buildScenarioDocs({
      workflows: {
        a: scenarioMeta('a', { title: 'Admin signs in', tags: ['console'] }),
        b: scenarioMeta('b', {
          title: 'Agent answers',
          tags: ['agent-protocol'],
        }),
      },
      features: {
        f: feature('f', {
          name: 'Auth',
          entries: [{ scenario: 'a' }, { scenario: 'b' }],
        }),
      },
    }).features

  test('returns everything when nothing is filtered', () => {
    assert.equal(filterFeatures(docs(), {})[0]!.scenarios.length, 2)
  })

  test('keeps only scenarios carrying a selected tag', () => {
    const filtered = filterFeatures(docs(), { tags: ['console'] })
    assert.deepEqual(
      filtered[0]!.scenarios.map((e) => e.scenario.name),
      ['a']
    )
  })

  test('matches any selected tag rather than all of them', () => {
    const filtered = filterFeatures(docs(), {
      tags: ['console', 'agent-protocol'],
    })
    assert.equal(filtered[0]!.scenarios.length, 2)
  })

  test('drops a feature once nothing in it matches', () => {
    assert.deepEqual(filterFeatures(docs(), { tags: ['nope'] }), [])
  })

  test('matches a scenario by title', () => {
    const filtered = filterFeatures(docs(), { query: 'agent answers' })
    assert.deepEqual(
      filtered[0]!.scenarios.map((e) => e.scenario.name),
      ['b']
    )
  })

  test('matches a scenario by the prose of one of its steps', () => {
    const filtered = filterFeatures(docs(), { query: 'sees it' })
    assert.equal(filtered[0]!.scenarios.length, 2)
  })

  test('a feature matched by name keeps all of its scenarios', () => {
    const filtered = filterFeatures(docs(), { query: 'auth' })
    assert.equal(filtered[0]!.scenarios.length, 2)
  })

  test('combines query and tags as an intersection', () => {
    const filtered = filterFeatures(docs(), {
      query: 'admin',
      tags: ['agent-protocol'],
    })
    assert.deepEqual(filtered, [])
  })
})

describe('buildScenarioDocs — loops', () => {
  const withFanout = () =>
    buildScenarioDocs({
      workflows: {
        a: {
          name: 'a',
          source: 'scenario',
          entryNodeIds: ['step_0'],
          nodes: {
            step_0: {
              nodeId: 'step_0',
              flow: 'branch',
              branches: [],
              next: 'filters',
            },
            filters: {
              nodeId: 'filters',
              rpcName: 'selectsSegment',
              scenarioStepPhase: 'when',
              next: 'step_3',
            },
            step_3: {
              nodeId: 'step_3',
              flow: 'fanout',
              sourceVar: 'installed',
              itemVar: 'packageName',
              childEntry: 'sees ${packageName}',
              next: 'step_4',
            },
            'sees ${packageName}': {
              nodeId: 'sees ${packageName}',
              rpcName: 'seesAddonCard',
              scenarioStepPhase: 'then',
              actor: 'admin',
            },
            step_4: { nodeId: 'step_4', flow: 'return' },
          },
        },
      },
      features: { f: feature('f', { entries: [{ scenario: 'a' }] }) },
    }).features[0]!.scenarios[0]!.scenario.steps

  test('reads a fanout as a repeat header rather than a bare node id', () => {
    const repeat = withFanout()[1]!
    assert.deepEqual(repeat.repeat, {
      itemVar: 'packageName',
      sourceVar: 'installed',
    })
    assert.equal(repeat.id, 'step_3')
  })

  test('nests the repeated step beneath the repeat', () => {
    const steps = withFanout()
    assert.deepEqual(
      steps.map((s) => [s.sentence, s.depth]),
      [
        ['filters', 0],
        ['', 0],
        ['sees {packageName}', 1],
      ]
    )
  })

  test('rewrites a template placeholder into readable prose', () => {
    assert.equal(withFanout()[2]!.sentence, 'sees {packageName}')
  })

  test('keeps the repeated step in flow order, not stranded at the end', () => {
    assert.equal(withFanout().at(-1)!.sentence, 'sees {packageName}')
  })
})
