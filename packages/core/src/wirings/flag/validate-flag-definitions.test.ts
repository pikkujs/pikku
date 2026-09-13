import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import {
  compiledFallbackSnapshot,
  flattenFeatureFlagDefinitions,
  validateAndBuildFeatureFlagDefinitionsMeta,
} from './validate-flag-definitions.js'

describe('validateAndBuildFeatureFlagDefinitionsMeta', () => {
  test('keys definitions by name', () => {
    const meta = validateAndBuildFeatureFlagDefinitionsMeta([
      { name: 'sandboxes', anyOf: ['admin:sandboxes'] },
    ])
    assert.deepEqual(Object.keys(meta), ['sandboxes'])
  })

  test('rejects an empty name', () => {
    assert.throws(() =>
      validateAndBuildFeatureFlagDefinitionsMeta([{ name: '' }])
    )
  })

  test('rejects a name that reads as a scope', () => {
    assert.throws(
      () =>
        validateAndBuildFeatureFlagDefinitionsMeta([
          { name: 'admin:sandboxes' },
        ]),
      /separator/
    )
  })

  test('rejects anyOf: []', () => {
    assert.throws(
      () =>
        validateAndBuildFeatureFlagDefinitionsMeta([
          { name: 'sandboxes', anyOf: [] },
        ]),
      /satisfies/
    )
  })

  test('allows an identical redeclaration, order-insensitively', () => {
    const meta = validateAndBuildFeatureFlagDefinitionsMeta([
      { name: 'sandboxes', anyOf: ['a', 'b'], sourceFile: 'one.ts' },
      { name: 'sandboxes', anyOf: ['b', 'a'], sourceFile: 'two.ts' },
    ])
    assert.equal(meta['sandboxes']?.sourceFile, 'one.ts')
  })

  test('rejects a name every object already carries', () => {
    for (const name of ['__proto__', 'constructor', 'prototype']) {
      assert.throws(
        () => validateAndBuildFeatureFlagDefinitionsMeta([{ name }]),
        /every object already carries/,
        `'${name}' was accepted`
      )
    }
  })

  test('rejects a redeclaration that describes the flag differently', () => {
    assert.throws(
      () =>
        validateAndBuildFeatureFlagDefinitionsMeta([
          {
            name: 'sandboxes',
            description: 'Ephemeral previews',
            sourceFile: 'one.ts',
          },
          {
            name: 'sandboxes',
            description: 'Something else',
            sourceFile: 'two.ts',
          },
        ]),
      /different descriptions[\s\S]*one\.ts[\s\S]*two\.ts/
    )
  })

  test('rejects a conflicting redeclaration, naming both files', () => {
    assert.throws(
      () =>
        validateAndBuildFeatureFlagDefinitionsMeta([
          { name: 'sandboxes', anyOf: ['a'], sourceFile: 'one.ts' },
          { name: 'sandboxes', anyOf: ['b'], sourceFile: 'two.ts' },
        ]),
      /one\.ts[\s\S]*two\.ts/
    )
  })
})

describe('flattenFeatureFlagDefinitions', () => {
  test('deduplicates by name', () => {
    const flags = flattenFeatureFlagDefinitions([
      { name: 'sandboxes' },
      { name: 'sandboxes' },
    ])
    assert.equal(flags.length, 1)
  })
})

describe('compiledFallbackSnapshot', () => {
  test('is every declared flag on, with nothing else set', () => {
    assert.deepEqual(compiledFallbackSnapshot([{ name: 'sandboxes' }]), {
      sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
    })
  })
})
