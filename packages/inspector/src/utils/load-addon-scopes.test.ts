import assert from 'node:assert/strict'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAddonFunctionsMeta } from './load-addon-functions-meta.js'

const PACKAGE = '@test/addon'

let rootDir: string
let warnings: string[]

const logger = {
  debug: () => {},
  info: () => {},
  warn: (msg: string) => warnings.push(msg),
  error: () => {},
} as any

/**
 * Lays out an installed addon the way the host resolves one: a real package in
 * node_modules whose built `.pikku` carries its generated metadata.
 */
const installAddon = (scopesMeta?: unknown) => {
  const pkgDir = join(rootDir, 'node_modules', '@test', 'addon')
  const pikkuDir = join(pkgDir, '.pikku')

  mkdirSync(join(pikkuDir, 'function'), { recursive: true })
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: PACKAGE, version: '1.0.0' }),
    'utf8'
  )
  writeFileSync(
    join(pikkuDir, 'function', 'pikku-functions-meta.gen.json'),
    JSON.stringify({ someFunc: { pikkuFuncId: 'someFunc' } }),
    'utf8'
  )

  if (scopesMeta !== undefined) {
    mkdirSync(join(pikkuDir, 'scopes'), { recursive: true })
    writeFileSync(
      join(pikkuDir, 'scopes', 'pikku-scopes-meta.gen.json'),
      JSON.stringify(scopesMeta),
      'utf8'
    )
  }
}

const makeState = (definitions: any[] = []) =>
  ({
    rootDir,
    addonFunctions: {},
    addonServerlessIncompatible: new Map(),
    addonRequiredParentServices: [],
    mcpEndpoints: { toolsMeta: {} },
    exportedContracts: { addonHttp: {}, addonCli: {}, addonChannel: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
    scopes: { definitions, files: new Set() },
    schemas: {},
    rpc: {
      wireAddonDeclarations: new Map([['test', { package: PACKAGE }]]),
    },
  }) as any

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-scopes-'))
  warnings = []
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'host' }),
    'utf8'
  )
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('loadAddonFunctionsMeta — addon scopes', () => {
  // Without this, an addon's own scopes never reach the host's ScopeId union or
  // its declared set, so the pikku_scopes FK would reject granting one.
  test("merges an addon's declared scopes into the host state", async () => {
    installAddon({
      pikku: {
        name: 'pikku',
        displayName: 'Pikku',
        scopes: { scopes: { scopes: { manage: {} } } },
      },
    })
    const state = makeState()

    await loadAddonFunctionsMeta(logger, state)

    assert.deepEqual(
      state.scopes.definitions.map((d: any) => d.name),
      ['pikku']
    )
    assert.deepEqual(state.scopes.definitions[0].scopes, {
      scopes: { scopes: { manage: {} } },
    })
  })

  test("keeps the host's own scopes alongside the addon's", async () => {
    installAddon({ pikku: { name: 'pikku' } })
    const state = makeState([{ name: 'admin' }])

    await loadAddonFunctionsMeta(logger, state)

    assert.deepEqual(state.scopes.definitions.map((d: any) => d.name).sort(), [
      'admin',
      'pikku',
    ])
  })

  // A host that already declares the name owns it — mirrors how addon secrets
  // and variables resolve the same collision.
  test('does not let an addon redeclare a scope the host already owns', async () => {
    installAddon({ admin: { name: 'admin', description: 'from the addon' } })
    const state = makeState([{ name: 'admin', description: 'from the host' }])

    await loadAddonFunctionsMeta(logger, state)

    assert.equal(state.scopes.definitions.length, 1)
    assert.equal(state.scopes.definitions[0].description, 'from the host')
  })

  test('is a no-op for an addon that declares no scopes', async () => {
    installAddon()
    const state = makeState()

    await loadAddonFunctionsMeta(logger, state)

    assert.deepEqual(state.scopes.definitions, [])
    assert.deepEqual(warnings, [])
  })
})
