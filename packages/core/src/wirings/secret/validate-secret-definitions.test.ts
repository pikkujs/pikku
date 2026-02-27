import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateAndBuildSecretDefinitionsMeta } from './validate-secret-definitions.js'

describe('validateAndBuildSecretDefinitionsMeta', () => {
  test('should build meta from single definition', () => {
    const definitions = [
      {
        name: 'stripe',
        displayName: 'Stripe',
        description: 'API key',
        secretId: 'STRIPE_KEY',
        sourceFile: 'a.ts',
      },
    ]
    const result = validateAndBuildSecretDefinitionsMeta(
      definitions as any,
      new Map()
    )
    assert.ok(result['stripe'])
    assert.strictEqual(result['stripe'].secretId, 'STRIPE_KEY')
    assert.strictEqual(result['stripe'].displayName, 'Stripe')
  })

  test('should allow duplicate secretId with same schema', () => {
    const schemaLookup = new Map([
      ['schema1', { variableName: 'Schema', sourceFile: 'types.ts' }],
    ])
    const definitions = [
      {
        name: 'cred1',
        displayName: 'Cred 1',
        description: 'd',
        secretId: 'SHARED',
        schema: 'schema1',
        sourceFile: 'a.ts',
      },
      {
        name: 'cred2',
        displayName: 'Cred 2',
        description: 'd',
        secretId: 'SHARED',
        schema: 'schema1',
        sourceFile: 'b.ts',
      },
    ]
    const result = validateAndBuildSecretDefinitionsMeta(
      definitions as any,
      schemaLookup
    )
    assert.ok(result['cred1'])
    assert.ok(result['cred2'])
  })

  test('should throw when duplicate secretId has different schemas', () => {
    const schemaLookup = new Map([
      ['schema1', { variableName: 'SchemaA', sourceFile: 'types.ts' }],
      ['schema2', { variableName: 'SchemaB', sourceFile: 'types2.ts' }],
    ])
    const definitions = [
      {
        name: 'cred1',
        displayName: 'Cred 1',
        description: 'd',
        secretId: 'SHARED',
        schema: 'schema1',
        sourceFile: 'a.ts',
      },
      {
        name: 'cred2',
        displayName: 'Cred 2',
        description: 'd',
        secretId: 'SHARED',
        schema: 'schema2',
        sourceFile: 'b.ts',
      },
    ]
    assert.throws(
      () =>
        validateAndBuildSecretDefinitionsMeta(definitions as any, schemaLookup),
      (err: any) => err.message.includes('different schemas')
    )
  })

  test('should throw when duplicate secretId has different oauth2 configs', () => {
    const definitions = [
      {
        name: 'cred1',
        displayName: 'C1',
        description: 'd',
        secretId: 'OAUTH',
        oauth2: { provider: 'google' },
        sourceFile: 'a.ts',
      },
      {
        name: 'cred2',
        displayName: 'C2',
        description: 'd',
        secretId: 'OAUTH',
        oauth2: { provider: 'github' },
        sourceFile: 'b.ts',
      },
    ]
    assert.throws(
      () =>
        validateAndBuildSecretDefinitionsMeta(definitions as any, new Map()),
      (err: any) => err.message.includes('different configurations')
    )
  })

  test('should handle empty definitions', () => {
    const result = validateAndBuildSecretDefinitionsMeta([], new Map())
    assert.deepStrictEqual(result, {})
  })

  test('should not duplicate names in meta', () => {
    const definitions = [
      {
        name: 'same',
        displayName: 'Same',
        description: 'd',
        secretId: 'KEY1',
        sourceFile: 'a.ts',
      },
      {
        name: 'same',
        displayName: 'Same',
        description: 'd',
        secretId: 'KEY2',
        sourceFile: 'b.ts',
      },
    ]
    const result = validateAndBuildSecretDefinitionsMeta(
      definitions as any,
      new Map()
    )
    assert.ok(result['same'])
    assert.strictEqual(result['same'].secretId, 'KEY1')
  })
})
