import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadAddonFunctionsMeta } from './load-addon-functions-meta.js'
import type { InspectorState, InspectorLogger } from '../types.js'

const writePackage = (rootDir: string, name: string, manifest?: object) => {
  const dir = join(rootDir, 'node_modules', name)
  mkdirSync(join(dir, '.pikku', 'function'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
  writeFileSync(
    join(dir, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
    '{}'
  )
  if (manifest) {
    mkdirSync(join(dir, '.pikku', 'screens'), { recursive: true })
    writeFileSync(
      join(dir, '.pikku', 'screens', 'pikku-screens-meta.gen.json'),
      JSON.stringify(manifest)
    )
  }
}

let criticals: string[] = []
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: (code: string, message: string) => {
    criticals.push(`${code}: ${message}`)
  },
  diagnostic: () => {},
} as unknown as InspectorLogger

const makeState = (rootDir: string, decls: Map<string, any>) =>
  ({
    rootDir,
    rpc: { wireAddonDeclarations: decls },
    addonFunctions: {},
    secrets: { definitions: [] },
    variables: { definitions: [] },
    credentials: { definitions: [] },
    mcpEndpoints: { toolsMeta: {}, surfaces: {} },
    addonServerlessIncompatible: new Map(),
    addonRequiredParentServices: [],
    exportedContracts: { addonHttp: {}, addonCli: {}, addonChannel: {} },
  }) as unknown as InspectorState

describe('loadAddonFunctionsMeta — ui: true', () => {
  let rootDir: string
  const manifest = {
    title: 'Invoices',
    file: 'x.ts',
    scopes: ['invoices:read', 'invoices:write'],
    screens: [{ path: '/', title: 'Overview', component: './screens/o' }],
  }

  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-screens-meta-'))
    writeFileSync(join(rootDir, 'package.json'), '{"name":"consumer"}')
    writePackage(rootDir, '@acme/addon-invoices', manifest)
    writePackage(rootDir, '@acme/addon-plain')
  })
  after(() => rmSync(rootDir, { recursive: true, force: true }))

  test('loads the screens of a ui addon under its namespace', async () => {
    criticals = []
    const state = makeState(
      rootDir,
      new Map([
        ['invoices', { package: '@acme/addon-invoices', ui: true }],
      ])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.deepEqual(criticals, [])
    assert.deepEqual(state.addonScreens?.invoices, manifest)
  })

  test('the wired role is the derived scopes plus the host scopes on that instance', async () => {
    criticals = []
    const state = makeState(
      rootDir,
      new Map([
        [
          'invoices',
          {
            package: '@acme/addon-invoices',
            ui: true,
            scopes: ['admin', 'invoices:read'],
          },
        ],
      ])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.deepEqual(state.addonScreens?.invoices?.scopes, [
      'admin',
      'invoices:read',
      'invoices:write',
    ])
  })

  test('ui: true on a package with no screens is refused', async () => {
    criticals = []
    const state = makeState(
      rootDir,
      new Map([['plain', { package: '@acme/addon-plain', ui: true }]])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!, /PKU346.*addon-plain.*declares no screens/)
    assert.equal(state.addonScreens?.plain, undefined)
  })

  test('a package that ships screens is ignored unless the wiring sets ui', async () => {
    criticals = []
    const state = makeState(
      rootDir,
      new Map([['invoices', { package: '@acme/addon-invoices' }]])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.deepEqual(criticals, [])
    assert.equal(state.addonScreens?.invoices, undefined)
  })

  test('wireAddon on the same package stays valid', async () => {
    criticals = []
    const state = makeState(
      rootDir,
      new Map([['plain', { package: '@acme/addon-plain' }]])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.deepEqual(criticals, [])
  })
})
