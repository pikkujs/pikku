import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateAndBuildVariableDefinitionsMeta } from './validate-variable-definitions.js'

describe('validateAndBuildVariableDefinitionsMeta', () => {
  test('should build meta from single definition', () => {
    const definitions = [
      {
        name: 'dbUrl',
        displayName: 'Database URL',
        description: 'Connection string',
        variableId: 'DB_URL',
        sourceFile: 'a.ts',
      },
    ]
    const result = validateAndBuildVariableDefinitionsMeta(
      definitions as any,
      new Map()
    )
    assert.ok(result['dbUrl'])
    assert.strictEqual(result['dbUrl'].variableId, 'DB_URL')
  })

  test('should allow duplicate variableId with same schema', () => {
    const schemaLookup = new Map([
      ['schema1', { variableName: 'Schema', sourceFile: 'types.ts' }],
    ])
    const definitions = [
      {
        name: 'var1',
        displayName: 'Var 1',
        description: 'd',
        variableId: 'SHARED',
        schema: 'schema1',
        sourceFile: 'a.ts',
      },
      {
        name: 'var2',
        displayName: 'Var 2',
        description: 'd',
        variableId: 'SHARED',
        schema: 'schema1',
        sourceFile: 'b.ts',
      },
    ]
    const result = validateAndBuildVariableDefinitionsMeta(
      definitions as any,
      schemaLookup
    )
    assert.ok(result['var1'])
    assert.ok(result['var2'])
  })

  test('should throw when duplicate variableId has different schemas', () => {
    const schemaLookup = new Map([
      ['schema1', { variableName: 'SchemaA', sourceFile: 'types.ts' }],
      ['schema2', { variableName: 'SchemaB', sourceFile: 'types2.ts' }],
    ])
    const definitions = [
      {
        name: 'var1',
        displayName: 'Var 1',
        description: 'd',
        variableId: 'SHARED',
        schema: 'schema1',
        sourceFile: 'a.ts',
      },
      {
        name: 'var2',
        displayName: 'Var 2',
        description: 'd',
        variableId: 'SHARED',
        schema: 'schema2',
        sourceFile: 'b.ts',
      },
    ]
    assert.throws(
      () =>
        validateAndBuildVariableDefinitionsMeta(
          definitions as any,
          schemaLookup
        ),
      (err: any) => err.message.includes('different schemas')
    )
  })

  test('should handle empty definitions', () => {
    const result = validateAndBuildVariableDefinitionsMeta([], new Map())
    assert.deepStrictEqual(result, {})
  })
})
