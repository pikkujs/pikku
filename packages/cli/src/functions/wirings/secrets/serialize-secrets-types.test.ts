import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeSecretsTypes } from './serialize-secrets-types.js'
import type { SecretDefinitions } from '@pikku/core/secret'

const serialize = (definitions: SecretDefinitions) =>
  serializeSecretsTypes({
    definitions,
    schemaLookup: new Map(),
    secretsFile: '/project/.pikku/secrets/pikku-secrets.gen.ts',
    packageMappings: {},
  })

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-secrets.gen.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const oauth2Secret = (displayName: string): SecretDefinitions => [
  {
    name: 'stripe',
    displayName,
    secretId: 'STRIPE_KEY',
    oauth2: {
      tokenSecretId: 'STRIPE_TOKENS',
      authorizationUrl: 'https://example.com/authorize',
      tokenUrl: 'https://example.com/token',
      scopes: [],
    },
  },
]

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

  test('emits a parseable file for an ordinary display name', () => {
    assert.deepEqual(parseErrors(serialize(oauth2Secret('Stripe'))), [])
  })

  /**
   * A display name is prose written by a human — "Stripe's live key", a Windows
   * path — and interpolated raw into a quoted string it terminates the literal
   * and the whole generated file stops parsing.
   */
  test('emits a parseable file for a display name needing escaping', () => {
    assert.deepEqual(
      parseErrors(serialize(oauth2Secret(`Stripe's "live" key \\ prod`))),
      []
    )
  })

  test('still exposes the typed service', () => {
    const output = serialize([])

    assert.match(output, /export class TypedSecretService/)
  })
})

describe('serializeSecretsTypes — optional secrets', () => {
  const schemaLookup = new Map([
    ['SecretSchema_scenarioActor', { variableName: 'ActorSchema', sourceFile: '/project/src/schemas.ts', vendor: 'zod' as const }],
    ['SecretSchema_stripe', { variableName: 'StripeSchema', sourceFile: '/project/src/schemas.ts', vendor: 'zod' as const }],
  ])

  const output = serializeSecretsTypes({
    definitions: [
      {
        name: 'scenarioActor',
        displayName: 'Scenario Actor Secret',
        secretId: 'SCENARIO_ACTOR_SECRET',
        schema: 'SecretSchema_scenarioActor',
        optional: true,
      },
      {
        name: 'stripe',
        displayName: 'Stripe',
        secretId: 'STRIPE_KEY',
        schema: 'SecretSchema_stripe',
      },
    ],
    schemaLookup: schemaLookup as any,
    secretsFile: '/project/.pikku/secrets/pikku-secrets.gen.ts',
    packageMappings: {},
  })

  // The `?` is what puts `undefined` in getSecret's return type — without it the
  // caller is typed as always having a value the deploy is allowed to omit.
  test('declares an optional secret as an optional map property', () => {
    assert.match(output, /'SCENARIO_ACTOR_SECRET'\?: z\.infer<typeof ActorSchema>/)
  })

  test('leaves a required secret as a required map property', () => {
    assert.match(output, /'STRIPE_KEY': z\.infer<typeof StripeSchema>/)
  })

  // TypedSecretService reads this at runtime to decide whether to resolve
  // undefined or let the underlying throw through.
  test('marks the entry optional in the runtime credentials meta', () => {
    assert.match(output, /'SCENARIO_ACTOR_SECRET': \{ name: 'scenarioActor', displayName: "Scenario Actor Secret", optional: true \}/)
    assert.match(output, /'STRIPE_KEY': \{ name: 'stripe', displayName: "Stripe" \}/)
  })

  test('the generated file still parses', () => {
    assert.deepEqual(parseErrors(output), [])
  })
})
