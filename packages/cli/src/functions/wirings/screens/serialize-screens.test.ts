import { runInNewContext } from 'node:vm'
import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  deriveScreensScopes,
  serializeScreensMeta,
  serializeScreens,
  serializeAddonRoles,
  serializeInstalledAddons,
  serializePluginTypes,
  catalogMessageKeys,
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
      agent: 'invoice-helper',
      agentTitle: 'invoices_agent__title',
      agentDescription: 'invoices_agent__description',
      defaultChat: false,
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
      /path: "\/invoices", title: "invoices_overview__title", scope: "project", nav: \{"area":"project","icon":"receipt","order":30,"badge":"unpaid"\}, needsApp: true, scopes: \["invoices:read"\], agent: "invoice-helper", agentTitle: "invoices_agent__title", agentDescription: "invoices_agent__description", defaultChat: false, component: /
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

  test('leaves defaultChat out when the screen did not declare it', () => {
    const out = serializeScreens(
      manifest as any,
      '/pkg/.pikku/screens/pikku-screens.gen.ts'
    )
    assert.equal(out.match(/defaultChat/g)?.length, 1)
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

describe('widgets, things and arranged screens', () => {
  const declared = {
    ...manifest,
    file: 'src/screens.ts',
    widgets: [
      {
        id: 'mini',
        title: 'mini__title',
        description: 'mini__description',
        states: ['tile'],
        actions: [],
        component: './widgets/Mini.js',
      },
    ],
    things: [
      {
        kind: 'invoice',
        label: 'invoice__label',
        source: 'invoiceCard',
        copy: {
          unpaid: { name: 'invoice_unpaid__name', compact: 'c' },
          why_late: { $: 'invoice_why_late' },
        },
        parts: [],
        actions: [
          { id: 'open', run: 'go:/invoices-next', label: 'open__label' },
        ],
      },
    ],
    arrangedScreens: [
      {
        id: 'overview',
        path: '/invoices-next',
        title: 't',
        scope: 'project',
        source: 'console:getAllMeta',
        slots: [{ widget: 'mini', from: 'x', own: true }],
        poll: { fast: 3000, slow: 45000 },
      },
    ],
  }

  test('the published meta keeps them as declared', () => {
    const meta = JSON.parse(serializeScreensMeta(declared as any, '/', []))
    assert.deepEqual(meta.arrangedScreens, declared.arrangedScreens)
    assert.deepEqual(meta.things, declared.things)
  })

  test('the host gets widgets, things and arranged screens as records keyed by id, widgets loaded through the package widgets export', () => {
    const out = serializeInstalledAddons([
      { name: 'invoices', package: '@acme/addon-invoices', manifest: declared },
    ] as any)
    assert.match(
      out,
      /"mini": \{ title: "mini__title", description: "mini__description", states: \["tile"\], actions: \[\], component: \(\) => import\("@acme\/addon-invoices\/widgets\/Mini"\) as never/
    )
    // Evaluate the emit (less its casts and lazy imports) to read the
    // records, brought back to this realm's plain objects.
    const [addon] = JSON.parse(
      JSON.stringify(
        runInNewContext(
          out
            .replace('export const installedAddons =', '')
            .replace(/\(\) => import\(("[^"]+")\) as never/g, '$1')
        )
      )
    )
    assert.deepEqual(Object.keys(addon.widgets), ['mini'])
    assert.equal(
      addon.widgets.mini.component,
      '@acme/addon-invoices/widgets/Mini'
    )
    assert.equal(addon.widgets.mini.id, undefined)
    assert.deepEqual(addon.things, {
      invoice: {
        label: 'invoice__label',
        source: 'invoiceCard',
        copy: declared.things[0]!.copy,
        parts: [],
        actions: { open: { run: 'go:/invoices-next', label: 'open__label' } },
      },
    })
    const { id: _, ...overview } = declared.arrangedScreens[0]!
    assert.deepEqual(addon.arrangedScreens, { overview })
  })

  test('an addon without them has none in the host emit', () => {
    const out = serializeInstalledAddons([
      { name: 'invoices', package: '@acme/addon-invoices', manifest },
    ] as any)
    assert.doesNotMatch(out, /widgets:|things:|arrangedScreens:/)
  })
})

describe('#pikku/screens', () => {
  test('types definePlugin against the addon functions and catalog keys', () => {
    const out = serializePluginTypes('../rpc/map.d.js', [
      'a__title',
      'b__title',
    ])
    assert.match(out, /import type \{ RPCMap \} from '\.\.\/rpc\/map\.d\.js'/)
    assert.match(
      out,
      /export type StudioMessageKey =\n {2}\| "a__title"\n {2}\| "b__title"/
    )
    assert.match(out, /DefinePlugin<\s*RPCMap,\s*StudioMessageKey\s*>/)
  })

  test('keys are any string without a catalog', () => {
    assert.match(
      serializePluginTypes('./m.js', undefined),
      /export type StudioMessageKey =\n {2}string/
    )
  })

  test('reads the catalog keys, leaving out $schema, and refuses what is not a catalog', () => {
    assert.deepEqual(
      catalogMessageKeys('{"$schema": "x", "a": "A", "b": "B"}'),
      ['a', 'b']
    )
    assert.equal(catalogMessageKeys('[1]'), undefined)
    assert.equal(catalogMessageKeys('not json'), undefined)
    assert.equal(catalogMessageKeys(undefined), undefined)
  })
})
