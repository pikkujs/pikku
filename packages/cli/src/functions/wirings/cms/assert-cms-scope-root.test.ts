import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { assertCmsScopeRoot } from './assert-cms-scope-root.js'

const GENERATED = '/app/src/scaffold/cms/cms-scopes.gen.ts'

describe('assertCmsScopeRoot', () => {
  test('accepts the generated tree and other roots', () => {
    assertCmsScopeRoot(
      [
        { name: 'cms', sourceFile: GENERATED },
        { name: 'cmsExport', sourceFile: '/app/src/scopes.ts' },
      ],
      GENERATED
    )
  })

  test('refuses a cms root anyone else declares, naming the file', () => {
    assert.throws(
      () =>
        assertCmsScopeRoot(
          [
            { name: 'cms', sourceFile: GENERATED },
            { name: 'cms', sourceFile: '/app/src/scopes.ts' },
          ],
          GENERATED
        ),
      /'cms' is reserved.*\/app\/src\/scopes\.ts/
    )
  })
})
