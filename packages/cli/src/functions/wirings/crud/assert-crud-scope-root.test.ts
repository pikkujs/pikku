import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCrudScopeRoot } from './assert-crud-scope-root.js'

const GENERATED = '/app/src/scaffold/crud/crud-scopes.gen.ts'

describe('assertCrudScopeRoot', () => {
  test('accepts the generated tree and other roots', () => {
    assertCrudScopeRoot(
      [
        { name: 'crud', sourceFile: GENERATED },
        { name: 'crudExport', sourceFile: '/app/src/scopes.ts' },
      ],
      GENERATED
    )
  })

  test('refuses a crud root anyone else declares, naming the file', () => {
    assert.throws(
      () =>
        assertCrudScopeRoot(
          [
            { name: 'crud', sourceFile: GENERATED },
            { name: 'crud', sourceFile: '/app/src/scopes.ts' },
          ],
          GENERATED
        ),
      /'crud' is reserved.*\/app\/src\/scopes\.ts/
    )
  })
})
