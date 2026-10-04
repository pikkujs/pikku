import assert from 'node:assert/strict'
import { describe, test, beforeEach } from 'node:test'
import * as ts from 'typescript'
import { addDefineScreens } from './add-define-screens.js'
import { addWireAddon } from './add-wire-addon.js'

let state: any
let criticals: string[] = []

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: (code: string, message: string) => {
    criticals.push(`${code}: ${message}`)
  },
} as any

const inspect = (source: string) => {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node) => {
    addDefineScreens(node, state, logger)
    addWireAddon(node, state, logger)
    ts.forEachChild(node, visit)
  }
  visit(file)
}

beforeEach(() => {
  criticals = []
  state = {
    rpc: {
      wireAddonDeclarations: new Map(),
      usedAddons: new Set(),
      wireAddonFiles: new Set(),
    },
  }
})

describe('addDefineScreens', () => {
  test('records the screens of a manifest', () => {
    inspect(`
      defineScreens({
        title: 'Invoices',
        icon: 'receipt',
        screens: [
          { path: '/', title: 'Overview', nav: true, scopes: ['invoices:read'], component: () => import('./screens/overview') },
          { path: '/report', title: 'Report', app: './dist' },
        ],
      })
    `)
    assert.deepEqual(criticals, [])
    assert.equal(state.screensManifest.title, 'Invoices')
    assert.equal(state.screensManifest.icon, 'receipt')
    assert.deepEqual(state.screensManifest.screens, [
      {
        path: '/',
        title: 'Overview',
        nav: true,
        scopes: ['invoices:read'],
        component: './screens/overview',
      },
      { path: '/report', title: 'Report', app: './dist' },
    ])
  })

  test('rejects a component that is not a lazy import literal', () => {
    inspect(`
      defineScreens({
        title: 'X',
        screens: [{ path: '/', title: 'A', component: loadIt }],
      })
    `)
    assert.equal(criticals.length, 2)
    assert.match(criticals[0]!, /PKU345.*import/)
    assert.deepEqual(state.screensManifest.screens, [])
  })

  test('rejects a screen that is both a component and an app', () => {
    inspect(`
      defineScreens({
        title: 'X',
        screens: [{ path: '/', title: 'A', app: './a', component: () => import('./a') }],
      })
    `)
    assert.match(criticals[0]!, /one or the other/)
    assert.deepEqual(state.screensManifest.screens, [])
  })
})

describe('wireAddon ui', () => {
  test('ui: true is recorded on the addon instance', () => {
    inspect(
      `wireAddon({ name: 'invoices', package: '@acme/addon-invoices', ui: true, scopes: ['admin'] })`
    )
    const declaration = state.rpc.wireAddonDeclarations.get('invoices')
    assert.equal(declaration.package, '@acme/addon-invoices')
    assert.equal(declaration.ui, true)
    assert.deepEqual(declaration.scopes, ['admin'])
  })

  test('wireAddon is not flagged', () => {
    inspect(`wireAddon({ name: 'x', package: '@acme/x' })`)
    assert.equal(state.rpc.wireAddonDeclarations.get('x').ui, undefined)
  })
})
