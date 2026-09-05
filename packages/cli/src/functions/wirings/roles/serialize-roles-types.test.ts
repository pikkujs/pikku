import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeRolesTypes } from './serialize-roles-types.js'
import type { SystemRoleDefinitions } from '@pikku/core/role'

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-roles.gen.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const role = (name: string): SystemRoleDefinitions => [{ name, scopes: [] }]

describe('serializeRolesTypes', () => {
  test('emits a union of the declared roles', () => {
    const output = serializeRolesTypes({ definitions: role('buyer') })

    assert.match(output, /export type SystemRoleName =\s*\|\s*["']buyer["']/)
  })

  test('emits a never union when nothing is declared', () => {
    const output = serializeRolesTypes({ definitions: [] })

    assert.match(output, /export type SystemRoleName = never/)
  })

  test('sorts and dedupes so output is stable across runs', () => {
    const a = serializeRolesTypes({
      definitions: [...role('seller'), ...role('buyer'), ...role('buyer')],
    })
    const b = serializeRolesTypes({
      definitions: [...role('buyer'), ...role('seller')],
    })

    assert.equal(a, b)
  })

  test('emits a parseable file for a role name needing escaping', () => {
    const output = serializeRolesTypes({ definitions: role('buyer\\legacy') })

    assert.deepEqual(parseErrors(output), [])
    assert.ok(
      output.includes(JSON.stringify('buyer\\legacy')),
      'expected the backslash to survive rather than escape the next character'
    )
  })

  test('imports the metadata sidecar so tsc ships it', () => {
    const output = serializeRolesTypes({ definitions: role('buyer') })

    assert.match(
      output,
      /import .* from '\.\/pikku-roles-meta\.gen\.json' with \{ type: 'json' \}/
    )
  })
})
