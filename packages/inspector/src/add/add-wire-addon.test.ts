import assert from 'node:assert/strict'
import { describe, test, beforeEach } from 'node:test'
import * as ts from 'typescript'
import { addWireAddon } from './add-wire-addon.js'

let state: any

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as any

/** Parses a source snippet and runs addWireAddon over every call expression. */
const inspect = (source: string) => {
  const file = ts.createSourceFile(
    'wiring.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  const visit = (node: ts.Node) => {
    addWireAddon(node, state, logger)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return state.rpc.wireAddonDeclarations
}

beforeEach(() => {
  state = {
    rpc: {
      wireAddonDeclarations: new Map(),
      usedAddons: new Set(),
      wireAddonFiles: new Set(),
    },
  }
})

describe('addWireAddon', () => {
  test('captures the addon gates alongside its plumbing', () => {
    const declarations = inspect(`
      wireAddon({
        name: 'console',
        package: '@pikku/addon-console',
        rpcEndpoint: '/rpc',
        auth: true,
        tags: ['admin', 'internal'],
        scopes: ['admin'],
      })
    `)

    assert.deepEqual(declarations.get('console'), {
      package: '@pikku/addon-console',
      rpcEndpoint: '/rpc',
      mcp: undefined,
      auth: true,
      tags: ['admin', 'internal'],
      scopes: ['admin'],
      secretOverrides: undefined,
      variableOverrides: undefined,
      credentialOverrides: undefined,
      secretGrants: undefined,
      credentialGrants: undefined,
      globalSecrets: undefined,
      globalCredentials: undefined,
    })
  })

  test('captures the secrets and credentials the host lends an addon', () => {
    const declarations = inspect(`
      wireAddon({
        name: 'graph',
        package: '@pikku/addon-graph',
        secretGrants: ['STRIPE_KEY', 'GITHUB_TOKEN'],
        credentialGrants: ['slack'],
      })
    `)

    assert.deepEqual(declarations.get('graph').secretGrants, [
      'STRIPE_KEY',
      'GITHUB_TOKEN',
    ])
    assert.deepEqual(declarations.get('graph').credentialGrants, ['slack'])
  })

  test('drops a grant list that is not statically knowable', () => {
    const declarations = inspect(`
      wireAddon({
        name: 'graph',
        package: '@pikku/addon-graph',
        secretGrants: someRuntimeList,
      })
    `)

    assert.equal(declarations.get('graph').secretGrants, undefined)
  })

  test('captures the reason an addon was exempted from credential scoping', () => {
    const declarations = inspect(`
      wireAddon({
        name: 'console',
        package: '@pikku/addon-console',
        globalCredentials: 'links credentials an operator names at runtime',
      })
    `)

    assert.equal(
      declarations.get('console').globalCredentials,
      'links credentials an operator names at runtime'
    )
  })

  test('captures the reason an addon was exempted from secret scoping', () => {
    const declarations = inspect(`
      wireAddon({
        name: 'console',
        package: '@pikku/addon-console',
        globalSecrets: 'administers secrets an operator names at runtime',
      })
    `)

    assert.equal(
      declarations.get('console').globalSecrets,
      'administers secrets an operator names at runtime'
    )
  })

  test('a globalSecrets reason that is not a literal still reports the grant', () => {
    // Unlike `scopes`, dropping this would under-report: the grant is real at
    // runtime whatever the reason evaluates to. The source text is recorded so
    // the manifest names the addon and points at where the reason comes from.
    const declarations = inspect(`
      wireAddon({ name: 'console', package: '@x/y', globalSecrets: REASON })
    `)

    assert.equal(declarations.get('console').globalSecrets, 'REASON')
  })

  test('leaves the gates undefined when none are declared', () => {
    const declarations = inspect(`
      wireAddon({ name: 'console', package: '@pikku/addon-console' })
    `)

    const declaration = declarations.get('console')
    assert.equal(declaration.auth, undefined)
    assert.equal(declaration.tags, undefined)
    assert.equal(declaration.scopes, undefined)
  })

  test('records auth: false rather than dropping it', () => {
    const declarations = inspect(`
      wireAddon({ name: 'console', package: '@x/y', auth: false })
    `)

    assert.equal(declarations.get('console').auth, false)
  })

  test('drops a scopes array that is not statically knowable', () => {
    // A partial list would read as the complete set of gates, so an array with
    // any non-literal entry is reported as unknown instead.
    const declarations = inspect(`
      wireAddon({ name: 'console', package: '@x/y', scopes: ['admin', ...EXTRA] })
    `)

    assert.equal(declarations.get('console').scopes, undefined)
  })

  test('drops a scopes value that is a reference rather than an array', () => {
    const declarations = inspect(`
      wireAddon({ name: 'console', package: '@x/y', scopes: ADMIN_SCOPES })
    `)

    assert.equal(declarations.get('console').scopes, undefined)
  })

  test('keeps an explicitly empty scopes array distinct from an absent one', () => {
    const declarations = inspect(`
      wireAddon({ name: 'console', package: '@x/y', scopes: [] })
    `)

    assert.deepEqual(declarations.get('console').scopes, [])
  })
})
