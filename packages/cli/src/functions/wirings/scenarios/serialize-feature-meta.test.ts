import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import type { InspectorFeature } from '@pikku/inspector'
import { buildFeaturesMeta } from './serialize-feature-meta.js'

const feature = (
  overrides: Partial<InspectorFeature> & Pick<InspectorFeature, 'exportedName'>
): InspectorFeature => ({
  path: '/project/src/addons.feature.ts',
  entries: [],
  unresolvedEntries: 0,
  hasBefore: false,
  hasAfter: false,
  ...overrides,
})

describe('buildFeaturesMeta', () => {
  test('carries name, description, tags and entries through', () => {
    const meta = buildFeaturesMeta(
      new Map([
        [
          'addonsFeature',
          feature({
            exportedName: 'addonsFeature',
            name: 'Addons Page',
            description: 'The console addons gallery',
            tags: ['addons', 'console'],
            entries: [
              { scenario: 'installedAddonsScenario' },
              { scenario: 'communityAddonsScenario' },
            ],
          }),
        ],
      ])
    )

    assert.deepEqual(meta, {
      addonsFeature: {
        id: 'addonsFeature',
        name: 'Addons Page',
        description: 'The console addons gallery',
        tags: ['addons', 'console'],
        entries: [
          { scenario: 'installedAddonsScenario' },
          { scenario: 'communityAddonsScenario' },
        ],
        unresolvedEntries: 0,
        hasBefore: false,
        hasAfter: false,
      },
    })
  })

  test('preserves declared entry order rather than sorting it', () => {
    const meta = buildFeaturesMeta(
      new Map([
        [
          'authFeature',
          feature({
            exportedName: 'authFeature',
            name: 'Auth',
            entries: [
              { scenario: 'zSignsOutScenario' },
              { scenario: 'aSignsInScenario' },
            ],
          }),
        ],
      ])
    )

    assert.deepEqual(meta.authFeature!.entries, [
      { scenario: 'zSignsOutScenario' },
      { scenario: 'aSignsInScenario' },
    ])
  })

  test('falls back to the export identifier when no name is declared', () => {
    const meta = buildFeaturesMeta(
      new Map([['authFeature', feature({ exportedName: 'authFeature' })]])
    )

    assert.equal(meta.authFeature!.name, 'authFeature')
    assert.deepEqual(meta.authFeature!.tags, [])
  })

  test('keeps Examples data on an entry', () => {
    const meta = buildFeaturesMeta(
      new Map([
        [
          'credentialFeature',
          feature({
            exportedName: 'credentialFeature',
            name: 'Credentials',
            entries: [
              { scenario: 'roundTripScenario', data: { name: 'stripe' } },
              { scenario: 'roundTripScenario', data: { name: 'google' } },
            ],
          }),
        ],
      ])
    )

    assert.deepEqual(meta.credentialFeature!.entries, [
      { scenario: 'roundTripScenario', data: { name: 'stripe' } },
      { scenario: 'roundTripScenario', data: { name: 'google' } },
    ])
  })

  test('reports a partial listing and the hooks it has', () => {
    const meta = buildFeaturesMeta(
      new Map([
        [
          'loopFeature',
          feature({
            exportedName: 'loopFeature',
            name: 'Loop',
            entries: [{ scenario: 'lazyLoadScenario' }],
            unresolvedEntries: 2,
            hasBefore: true,
          }),
        ],
      ])
    )

    assert.equal(meta.loopFeature!.unresolvedEntries, 2)
    assert.equal(meta.loopFeature!.hasBefore, true)
    assert.equal(meta.loopFeature!.hasAfter, false)
  })

  test('never leaks the absolute source path into meta', () => {
    const meta = buildFeaturesMeta(
      new Map([['authFeature', feature({ exportedName: 'authFeature' })]])
    )

    assert.equal('path' in meta.authFeature!, false)
  })

  test('a project with no features produces an empty record', () => {
    assert.deepEqual(buildFeaturesMeta(new Map()), {})
  })
})
