import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  flattenSystemRoleDefinitions,
  validateAndBuildSystemRoleDefinitionsMeta,
} from './validate-role-definitions.js'
import type { SystemRoleDefinitions } from './role.types.js'

const defs = (...d: SystemRoleDefinitions): SystemRoleDefinitions => d

describe('system role validation', () => {
  test('keys definitions by name', () => {
    const meta = validateAndBuildSystemRoleDefinitionsMeta(
      defs(
        { name: 'buyer', scopes: ['orders:create'], description: 'Buys' },
        { name: 'admin', scopes: ['admin'] }
      )
    )
    assert.deepEqual(Object.keys(meta), ['buyer', 'admin'])
    assert.equal(meta.buyer?.description, 'Buys')
  })

  test('a name containing the scope separator is refused', () => {
    assert.throws(
      () =>
        validateAndBuildSystemRoleDefinitionsMeta(
          defs({ name: 'admin:billing', scopes: [] })
        ),
      /contains the ':' separator/
    )
  })

  test('an empty name is refused', () => {
    assert.throws(
      () =>
        validateAndBuildSystemRoleDefinitionsMeta(
          defs({ name: '', scopes: [] })
        ),
      /empty name/
    )
  })

  // An addon and its host both declaring `admin` is legitimate; the second is
  // redundant rather than conflicting, so long as it says the same thing.
  test('an identical redeclaration is allowed', () => {
    const meta = validateAndBuildSystemRoleDefinitionsMeta(
      defs(
        { name: 'admin', scopes: ['admin'], sourceFile: 'a.ts' },
        { name: 'admin', scopes: ['admin'], sourceFile: 'b.ts' }
      )
    )
    assert.equal(Object.keys(meta).length, 1)
    assert.equal(meta.admin?.sourceFile, 'a.ts')
  })

  test('scope order does not make two declarations different', () => {
    assert.doesNotThrow(() =>
      validateAndBuildSystemRoleDefinitionsMeta(
        defs(
          { name: 'buyer', scopes: ['a', 'b'], sourceFile: 'a.ts' },
          { name: 'buyer', scopes: ['b', 'a'], sourceFile: 'b.ts' }
        )
      )
    )
  })

  test('a conflicting redeclaration names both files', () => {
    assert.throws(
      () =>
        validateAndBuildSystemRoleDefinitionsMeta(
          defs(
            { name: 'buyer', scopes: ['a'], sourceFile: 'a.ts' },
            { name: 'buyer', scopes: ['a', 'b'], sourceFile: 'b.ts' }
          )
        ),
      /a\.ts[\s\S]*b\.ts/
    )
  })
})

describe('flattening', () => {
  test('deduplicates by name, keeping the first', () => {
    const flat = flattenSystemRoleDefinitions(
      defs(
        { name: 'admin', scopes: ['admin'], description: 'first' },
        { name: 'admin', scopes: ['admin'], description: 'second' },
        { name: 'buyer', scopes: [] }
      )
    )
    assert.deepEqual(
      flat.map((r) => r.name),
      ['admin', 'buyer']
    )
    assert.equal(flat[0]?.description, 'first')
  })

  test('copies the scope array rather than aliasing the declaration', () => {
    const definition = { name: 'buyer', scopes: ['a'] }
    const flat = flattenSystemRoleDefinitions(defs(definition))
    flat[0]!.scopes.push('b')
    assert.deepEqual(definition.scopes, ['a'])
  })
})
