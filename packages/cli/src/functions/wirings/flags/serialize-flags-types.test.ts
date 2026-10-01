import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeFlagsManifest,
  serializeFlagsTypes,
} from './serialize-flags-types.js'

const definitions = [
  { name: 'sandboxes', description: 'The sandbox workspace' },
] as Parameters<typeof serializeFlagsTypes>[0]['definitions']

describe('serializeFlagsTypes', () => {
  test('emits the union and nothing a leaf barrel should re-export as a value', () => {
    const source = serializeFlagsTypes({ definitions })
    assert.match(source, /export type FeatureFlagName =\n {2}\| "sandboxes"/)
    assert.doesNotMatch(source, /export const/)
  })
})

describe('serializeFlagsManifest', () => {
  const source = serializeFlagsManifest()

  test('names the manifest in camelCase', () => {
    assert.match(source, /export const declaredFeatureFlags:/)
    assert.match(source, /export const featureFlagsMeta =/)
    assert.match(source, /export const featureFlagsFallback =/)
    assert.doesNotMatch(source, /FEATURE_FLAGS/)
  })

  test('takes its union from the types file beside it', () => {
    assert.match(
      source,
      /import type \{ FeatureFlagName \} from '\.\/pikku-flags\.gen\.js'/
    )
  })

  test('reads the declarations off the metadata sidecar', () => {
    assert.match(source, /from '\.\/pikku-flags-meta\.gen\.json'/)
  })
})
