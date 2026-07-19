import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeSecretsTypes } from './serialize-secrets-types.js'
import type { SecretDefinitions } from '@pikku/core/secret'

const serialize = (definitions: SecretDefinitions) =>
  serializeSecretsTypes({
    definitions,
    schemaLookup: new Map(),
    secretsFile: '/project/.pikku/secrets/pikku-secrets.gen.ts',
    packageMappings: {},
  })

describe('serializeSecretsTypes — shipping the declared set', () => {
  // tsc only copies a .json into the build output when something imports it,
  // and an addon publishes only that output. Without this import the sidecar
  // never shipped, so a host installing the addon could not read its declared
  // secrets — the inspector's addon-secrets loader silently found nothing.
  test('imports the metadata sidecar so tsc ships it', () => {
    const output = serialize([
      {
        name: 'stripe',
        displayName: 'Stripe',
        secretId: 'STRIPE_KEY',
      },
    ])

    assert.match(
      output,
      /import .* from '\.\/pikku-secrets-meta\.gen\.json' with \{ type: 'json' \}/
    )
  })

  test('exports the declared metadata for a host to read', () => {
    const output = serialize([
      { name: 'stripe', displayName: 'Stripe', secretId: 'STRIPE_KEY' },
    ])

    assert.match(output, /export const SECRETS_META/)
  })

  // The import must be there even with nothing declared: an addon that declares
  // no secrets still writes an (empty) sidecar, and the generated file has to
  // compile.
  test('imports the sidecar even when nothing is declared', () => {
    const output = serialize([])

    assert.match(output, /pikku-secrets-meta\.gen\.json/)
  })

  test('still exposes the typed service', () => {
    const output = serialize([])

    assert.match(output, /export class TypedSecretService/)
  })
})
