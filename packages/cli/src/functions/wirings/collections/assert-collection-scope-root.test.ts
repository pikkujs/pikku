import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCollectionScopeRoot } from './assert-collection-scope-root.js'

const GENERATED = '/app/src/scaffold/collections/collection-scopes.gen.ts'

describe('assertCollectionScopeRoot', () => {
  test('accepts the generated tree and other roots', () => {
    assertCollectionScopeRoot(
      [
        { name: 'collections', sourceFile: GENERATED },
        { name: 'collectionExport', sourceFile: '/app/src/scopes.ts' },
      ],
      GENERATED
    )
  })

  test('refuses a collections root anyone else declares, naming the file', () => {
    assert.throws(
      () =>
        assertCollectionScopeRoot(
          [
            { name: 'collections', sourceFile: GENERATED },
            { name: 'collections', sourceFile: '/app/src/scopes.ts' },
          ],
          GENERATED
        ),
      /'collections' is reserved.*\/app\/src\/scopes\.ts/
    )
  })
})
