import { strict as assert } from 'node:assert'
import { describe, test, before, after, beforeEach } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ts from 'typescript'
import { addWireAddon } from './add-wire-addon.js'
import { loadAddonFunctionsMeta } from '../utils/load-addon-functions-meta.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState } from '../types.js'

let criticals: Array<{ code: ErrorCode; message: string }> = []
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: (code: ErrorCode, message: string) => {
    criticals.push({ code, message })
  },
} as unknown as InspectorLogger

const parse = (source: string) => {
  const state = {
    rpc: {
      wireAddonDeclarations: new Map(),
      usedAddons: new Set(),
      wireAddonFiles: new Set(),
    },
  } as unknown as InspectorState
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node) => {
    addWireAddon(node, state, logger)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return state
}

const registered = {
  contributors: {
    inbox: { dev: { module: 'src/inbox.ts', export: 'inboxDev' } },
    queue: {
      dev: { module: 'src/queue-dev.ts', export: 'queueDev' },
      deploy: { module: 'src/queue.ts', export: 'queueDeploy' },
    },
  },
}

const writePackage = (rootDir: string, name: string, meta?: object) => {
  const dir = join(rootDir, 'node_modules', name)
  mkdirSync(join(dir, '.pikku', 'function'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
  writeFileSync(
    join(dir, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
    '{}'
  )
  if (meta) {
    mkdirSync(join(dir, '.pikku', 'contributors'), { recursive: true })
    writeFileSync(
      join(dir, '.pikku', 'contributors', 'pikku-contributors-meta.gen.json'),
      JSON.stringify(meta)
    )
  }
}

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

beforeEach(() => {
  criticals = []
})

describe('wireAddon({ contributors })', () => {
  test('is parsed into the declaration', () => {
    const state = parse(
      `wireAddon({ name: 'ops', package: '@acme/ops', contributors: ['inbox', 'queue'] })`
    )
    assert.deepEqual(state.rpc.wireAddonDeclarations.get('ops')!.contributors, [
      'inbox',
      'queue',
    ])
    assert.deepEqual(criticals, [])
  })

  test('is unset when the wiring opts in to nothing', () => {
    const state = parse(`wireAddon({ name: 'ops', package: '@acme/ops' })`)
    assert.equal(
      state.rpc.wireAddonDeclarations.get('ops')!.contributors,
      undefined
    )
  })

  test('a non-literal list is a critical error', () => {
    parse(
      `declare const names: string[]\nwireAddon({ name: 'ops', package: '@acme/ops', contributors: names })`
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.ADDON_CONTRIBUTORS_NOT_STATIC)
    assert.match(criticals[0]!.message, /array of string literals, got: names/)
  })
})

describe('opted-in contributors resolve against the addon', () => {
  let rootDir: string
  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-opt-in-'))
    writeFileSync(join(rootDir, 'package.json'), '{"name":"consumer"}')
    writePackage(rootDir, '@acme/ops', registered)
    writePackage(rootDir, '@acme/plain')
  })
  after(() => rmSync(rootDir, { recursive: true, force: true }))

  test('records only the opted-in names with their variants', async () => {
    const state = makeState(
      rootDir,
      new Map([['ops', { package: '@acme/ops', contributors: ['queue'] }]])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.deepEqual(criticals, [])
    assert.deepEqual(state.optedInContributors, {
      ops: {
        packageName: '@acme/ops',
        contributors: { queue: registered.contributors.queue },
      },
    })
  })

  test('an unknown name is an error naming the addon, the name and what exists', async () => {
    const state = makeState(
      rootDir,
      new Map([
        ['ops', { package: '@acme/ops', contributors: ['inbox', 'mailer'] }],
      ])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.ADDON_CONTRIBUTOR_UNKNOWN)
    assert.match(
      criticals[0]!.message,
      /wireAddon\('ops'\) opts in to contributor 'mailer', but @acme\/ops registers no such contributor. It registers: inbox, queue\./
    )
    assert.deepEqual(
      Object.keys(state.optedInContributors!.ops!.contributors),
      ['inbox']
    )
  })

  test('an addon that registers none reports every name', async () => {
    const state = makeState(
      rootDir,
      new Map([['plain', { package: '@acme/plain', contributors: ['inbox'] }]])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.equal(criticals.length, 1)
    assert.match(
      criticals[0]!.message,
      /wireAddon\('plain'\).*'inbox'.*@acme\/plain registers no such contributor. It registers none/
    )
    assert.equal(state.optedInContributors, undefined)
  })

  test('an addon wired without contributors records nothing', async () => {
    const state = makeState(
      rootDir,
      new Map([['ops', { package: '@acme/ops' }]])
    )
    await loadAddonFunctionsMeta(logger, state)
    assert.deepEqual(criticals, [])
    assert.equal(state.optedInContributors, undefined)
  })
})
