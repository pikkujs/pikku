import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeScopesTypes } from './serialize-scopes-types.js'
import type { ScopeDefinitions } from '@pikku/core/scope'

describe('serializeScopesTypes', () => {
  test('emits a union of a flat scope', () => {
    const definitions: ScopeDefinitions = [{ name: 'admin' }]

    const output = serializeScopesTypes({ definitions })

    assert.match(output, /export type ScopeId =\s*\|\s*'admin'/)
  })

  test('emits every node of a nested tree', () => {
    const definitions: ScopeDefinitions = [
      {
        name: 'admin',
        scopes: { invoices: { scopes: { create: {} } } },
      },
    ]

    const output = serializeScopesTypes({ definitions })

    assert.ok(output.includes("'admin'"), 'expected the root scope')
    assert.ok(
      output.includes("'admin:invoices'"),
      'expected the intermediate scope'
    )
    assert.ok(
      output.includes("'admin:invoices:create'"),
      'expected the leaf scope'
    )
  })

  test('emits wildcard forms for every node with children', () => {
    const definitions: ScopeDefinitions = [
      { name: 'admin', scopes: { invoices: { scopes: { create: {} } } } },
    ]

    const output = serializeScopesTypes({ definitions })

    assert.ok(output.includes("'admin:*'"), 'expected a wildcard for the root')
    assert.ok(
      output.includes("'admin:invoices:*'"),
      'expected a wildcard for the intermediate node'
    )
  })

  test('does not emit a wildcard for a leaf', () => {
    const definitions: ScopeDefinitions = [{ name: 'admin' }]

    const output = serializeScopesTypes({ definitions })

    assert.ok(
      !output.includes("'admin:*'"),
      'a leaf has no descendants, so its wildcard is meaningless'
    )
  })

  test('emits metadata including descriptions', () => {
    const definitions: ScopeDefinitions = [
      {
        name: 'admin',
        displayName: 'Administration',
        description: 'Administrative access',
      },
    ]

    const output = serializeScopesTypes({ definitions })

    assert.match(output, /SCOPES_META/)
    assert.ok(output.includes('Administrative access'))
    assert.ok(output.includes('Administration'))
  })

  test('emits a never union when nothing is declared', () => {
    const output = serializeScopesTypes({ definitions: [] })

    assert.match(output, /export type ScopeId = never/)
  })

  test('sorts scopes so output is stable across runs', () => {
    const a = serializeScopesTypes({
      definitions: [{ name: 'billing' }, { name: 'admin' }],
    })
    const b = serializeScopesTypes({
      definitions: [{ name: 'admin' }, { name: 'billing' }],
    })

    assert.equal(a, b)
  })

  test('escapes nothing unexpected into the union', () => {
    const definitions: ScopeDefinitions = [
      { name: 'admin', scopes: { users: {}, invoices: {} } },
    ]

    const output = serializeScopesTypes({ definitions })
    const union = output
      .slice(output.indexOf('export type ScopeId'))
      .split('\n\n')[0]!

    assert.deepEqual(
      [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(),
      ['admin', 'admin:*', 'admin:invoices', 'admin:users'].sort()
    )
  })
})
