import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import {
  flattenScopeDefinitions,
  validateAndBuildScopeDefinitionsMeta,
} from './validate-scope-definitions.js'
import type { ScopeDefinitions } from './scope.types.js'

describe('flattenScopeDefinitions', () => {
  test('a flat scope yields itself', () => {
    const definitions: ScopeDefinitions = [
      { name: 'admin', description: 'Administration' },
    ]

    assert.deepEqual(flattenScopeDefinitions(definitions), [
      { id: 'admin', description: 'Administration' },
    ])
  })

  test('nested scopes yield every intermediate level', () => {
    const definitions: ScopeDefinitions = [
      {
        name: 'admin',
        scopes: {
          invoices: {
            description: 'Invoice management',
            scopes: { create: { description: 'Create invoices' } },
          },
        },
      },
    ]

    assert.deepEqual(flattenScopeDefinitions(definitions), [
      { id: 'admin', description: undefined },
      { id: 'admin:invoices', description: 'Invoice management' },
      { id: 'admin:invoices:create', description: 'Create invoices' },
    ])
  })

  test('siblings are flattened depth-first', () => {
    const definitions: ScopeDefinitions = [
      {
        name: 'billing',
        scopes: { read: {}, write: {} },
      },
    ]

    assert.deepEqual(
      flattenScopeDefinitions(definitions).map((s) => s.id),
      ['billing', 'billing:read', 'billing:write']
    )
  })

  test('several definitions are flattened together', () => {
    const definitions: ScopeDefinitions = [
      { name: 'admin', scopes: { users: {} } },
      { name: 'billing' },
    ]

    assert.deepEqual(
      flattenScopeDefinitions(definitions).map((s) => s.id),
      ['admin', 'admin:users', 'billing']
    )
  })
})

describe('validateAndBuildScopeDefinitionsMeta', () => {
  test('keys definitions by name', () => {
    const meta = validateAndBuildScopeDefinitionsMeta([
      { name: 'admin', description: 'Administration' },
    ])

    assert.equal(meta.admin!.name, 'admin')
    assert.equal(meta.admin!.description, 'Administration')
  })

  test('an identical duplicate is tolerated', () => {
    const meta = validateAndBuildScopeDefinitionsMeta([
      { name: 'admin', scopes: { users: {} } },
      { name: 'admin', scopes: { users: {} } },
    ])

    assert.equal(Object.keys(meta).length, 1)
  })

  test('a conflicting duplicate throws and names both files', () => {
    assert.throws(
      () =>
        validateAndBuildScopeDefinitionsMeta([
          { name: 'admin', scopes: { users: {} }, sourceFile: 'a.ts' },
          { name: 'admin', scopes: { invoices: {} }, sourceFile: 'b.ts' },
        ]),
      (err: Error) => {
        assert.match(err.message, /admin/)
        assert.match(err.message, /a\.ts/)
        assert.match(err.message, /b\.ts/)
        return true
      }
    )
  })

  test('rejects a name containing the separator', () => {
    assert.throws(
      () => validateAndBuildScopeDefinitionsMeta([{ name: 'admin:users' }]),
      /separator/i
    )
  })

  test('rejects a nested key containing the separator', () => {
    assert.throws(
      () =>
        validateAndBuildScopeDefinitionsMeta([
          { name: 'admin', scopes: { 'a:b': {} } },
        ]),
      /separator/i
    )
  })

  test('rejects a wildcard as a declared name', () => {
    assert.throws(
      () => validateAndBuildScopeDefinitionsMeta([{ name: '*' }]),
      /wildcard/i
    )
  })

  test('rejects a wildcard nested inside a scope', () => {
    assert.throws(
      () =>
        validateAndBuildScopeDefinitionsMeta([
          { name: 'admin', scopes: { '*': {} } },
        ]),
      /wildcard/i
    )
  })
})
