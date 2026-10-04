import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  deriveScreensScopes,
  serializeScreensMeta,
  serializeScreens,
} from './serialize-screens.js'

const manifest = {
  title: 'Invoices',
  icon: 'receipt',
  file: '/pkg/src/screens.ts',
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

describe('serializeScreens', () => {
  test('imports each component lazily, relative to the generated file', () => {
    const out = serializeScreens(
      manifest as any,
      '/pkg/.pikku/screens/pikku-screens.gen.ts'
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

describe('serializeScreensMeta', () => {
  test('does not publish the absolute path of the author', () => {
    const meta = JSON.parse(
      serializeScreensMeta(manifest as any, '/pkg', ['a'])
    )
    assert.equal(meta.file, 'src/screens.ts')
    assert.equal(meta.screens.length, 2)
  })
})

describe('deriveScreensScopes', () => {
  test('is the union of what the functions require, without declaring anything', () => {
    assert.deepEqual(
      deriveScreensScopes({
        list: { scopes: ['invoices:read'] },
        save: { scopes: ['invoices:write', 'invoices:read'] },
        open: {},
      }),
      ['invoices:read', 'invoices:write']
    )
  })

  test('a package whose functions need no scope has an empty role', () => {
    assert.deepEqual(deriveScreensScopes({ open: {} }), [])
  })
})

describe('the published meta', () => {
  test('carries the derived role', () => {
    const meta = JSON.parse(
      serializeScreensMeta(manifest as any, '/pkg', ['invoices:read'])
    )
    assert.deepEqual(meta.scopes, ['invoices:read'])
  })
})
