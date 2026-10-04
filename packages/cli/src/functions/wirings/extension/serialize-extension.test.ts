import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  deriveExtensionScopes,
  serializeExtensionMeta,
  serializeExtensionScreens,
} from './serialize-extension.js'

const manifest = {
  title: 'Invoices',
  icon: 'receipt',
  file: '/pkg/src/extension.ts',
  screens: [
    {
      path: '/',
      title: 'Overview',
      nav: true,
      scopes: ['invoices:read'],
      component: './screens/overview',
    },
    { path: '/report', title: 'Report', app: './dist' },
  ],
}

describe('serializeExtensionScreens', () => {
  test('imports each component lazily, relative to the generated file', () => {
    const out = serializeExtensionScreens(
      manifest as any,
      '/pkg/.pikku/extension/pikku-extension-screens.gen.ts'
    )
    assert.match(
      out,
      /component: \(\) => import\("\.\.\/\.\.\/src\/screens\/overview"\)/
    )
    assert.match(out, /scopes: \["invoices:read"\]/)
    assert.match(out, /app: "\.\/dist"/)
    assert.match(out, /as const/)
  })
})

describe('serializeExtensionMeta', () => {
  test('does not publish the absolute path of the author', () => {
    const meta = JSON.parse(
      serializeExtensionMeta(manifest as any, '/pkg', ['a'])
    )
    assert.equal(meta.file, 'src/extension.ts')
    assert.equal(meta.screens.length, 2)
  })
})

describe('deriveExtensionScopes', () => {
  test('is the union of what the functions require, without declaring anything', () => {
    assert.deepEqual(
      deriveExtensionScopes({
        list: { scopes: ['invoices:read'] },
        save: { scopes: ['invoices:write', 'invoices:read'] },
        open: {},
      }),
      ['invoices:read', 'invoices:write']
    )
  })

  test('a package whose functions need no scope has an empty role', () => {
    assert.deepEqual(deriveExtensionScopes({ open: {} }), [])
  })
})

describe('the published meta', () => {
  test('carries the derived role', () => {
    const meta = JSON.parse(
      serializeExtensionMeta(manifest as any, '/pkg', ['invoices:read'])
    )
    assert.deepEqual(meta.scopes, ['invoices:read'])
  })
})
