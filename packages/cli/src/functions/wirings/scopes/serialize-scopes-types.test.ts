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

  // Descriptions ride in the metadata sidecar (see 'shipping the declared set'
  // below), so SCOPES_META carries them through rather than restating them.
  // Display names have no sidecar of their own and stay inlined.
  test('emits metadata carrying display names and descriptions', () => {
    const definitions: ScopeDefinitions = [
      {
        name: 'admin',
        displayName: 'Administration',
        description: 'Administrative access',
      },
    ]

    const output = serializeScopesTypes({ definitions })

    assert.match(output, /SCOPES_META/)
    assert.ok(output.includes('Administration'), 'expected the display name')
    assert.match(
      output,
      /description: scope\.description/,
      'expected SCOPES_META to carry the description through from the sidecar'
    )
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

describe('serializeScopesTypes — shipping the declared set', () => {
  // The generated file must *import* its metadata sidecar rather than inlining
  // it. tsc only copies a .json into dist when something imports it, and an
  // addon publishes only dist — so without this import an addon's scopes never
  // reach a host that installs it, and the pikku_scopes FK refuses to grant
  // them.
  test('imports the metadata sidecar so tsc ships it', () => {
    const output = serializeScopesTypes({ definitions: [{ name: 'admin' }] })

    assert.match(
      output,
      /import .* from '\.\/pikku-scopes-meta\.gen\.json' with \{ type: 'json' \}/
    )
  })

  test('derives the declared set from the sidecar rather than duplicating it', () => {
    const output = serializeScopesTypes({ definitions: [{ name: 'admin' }] })

    assert.match(output, /flattenScopeDefinitions/)
  })

  test('still emits the union as a literal type', () => {
    const output = serializeScopesTypes({ definitions: [{ name: 'admin' }] })

    assert.match(output, /export type ScopeId =\s*\|\s*'admin'/)
  })
})
