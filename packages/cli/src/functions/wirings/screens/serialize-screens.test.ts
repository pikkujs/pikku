import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  deriveScreensScopes,
  serializeScreensMeta,
  serializeScreens,
  serializeAddonRoles,
  serializeInstalledAddons,
} from './serialize-screens.js'

const manifest = {
  title: 'invoices__title',
  file: '/pkg/src/screens.ts',
  screens: [
    {
      path: '/invoices',
      title: 'invoices_overview__title',
      scope: 'project',
      nav: { area: 'project', icon: 'receipt', order: 30, badge: 'unpaid' },
      needsApp: true,
      scopes: ['invoices:read'],
      component: './screens/overview',
    },
    {
      path: '/report',
      title: 'invoices_report__title',
      scope: 'studio',
      replaces: true,
      layout: 'bare',
      app: './dist',
    },
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

  test('carries every definePlugin field through', () => {
    const out = serializeScreens(
      manifest as any,
      '/pkg/.pikku/screens/pikku-screens.gen.ts'
    )
    assert.match(
      out,
      /path: "\/invoices", title: "invoices_overview__title", scope: "project", nav: \{"area":"project","icon":"receipt","order":30,"badge":"unpaid"\}, needsApp: true, scopes: \["invoices:read"\]/
    )
    assert.match(
      out,
      /path: "\/report", title: "invoices_report__title", scope: "studio", replaces: true, layout: "bare", app: "\.\/dist"/
    )
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

describe('host emit', () => {
  const installed = [
    {
      name: 'invoices',
      package: '@acme/addon-invoices',
      manifest: {
        ...manifest,
        file: 'src/screens.ts',
        scopes: ['invoices:read'],
      },
    },
  ]

  test('imports components through the package screens export', () => {
    assert.match(
      serializeInstalledAddons(installed as any),
      /import\("@acme\/addon-invoices\/screens\/overview"\)/
    )
  })

  test('carries scope, nav, replaces, needsApp and layout to the host', () => {
    const out = serializeInstalledAddons(installed as any)
    assert.match(out, /title: "invoices__title"/)
    assert.match(
      out,
      /scope: "project", nav: \{"area":"project","icon":"receipt","order":30,"badge":"unpaid"\}, needsApp: true/
    )
    assert.match(out, /scope: "studio", replaces: true, layout: "bare"/)
  })

  test('the role map is plain data', () => {
    const out = serializeAddonRoles(installed as any)
    assert.match(out, /"invoices": \[\s*"invoices:read"\s*\]/)
    assert.doesNotMatch(out, /import/)
  })
})
