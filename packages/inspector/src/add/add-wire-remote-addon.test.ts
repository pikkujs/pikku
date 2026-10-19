import assert from 'node:assert/strict'
import { describe, test, beforeEach } from 'node:test'
import * as ts from 'typescript'
import { addWireRemoteAddon } from './add-wire-remote-addon.js'
import { ErrorCode } from '../error-codes.js'

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
  const file = ts.createSourceFile(
    'wiring.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  const visit = (node: ts.Node) => {
    addWireRemoteAddon(node, state, logger)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return state.rpc.wireAddonDeclarations
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

describe('addWireRemoteAddon', () => {
  test('a versioned package records the bare name and the range', () => {
    const declarations = inspect(`
      wireRemoteAddon({
        name: 'cloudapi',
        package: '@pikkustudio/addon-cloud-api@^1.4.0',
        serverUrl: 'https://api.example.com',
      })
    `)
    const decl = declarations.get('cloudapi')
    assert.equal(decl.package, '@pikkustudio/addon-cloud-api')
    assert.equal(decl.range, '^1.4.0')
    assert.equal(decl.remote, true)
    assert.deepEqual(criticals, [])
  })

  test('an unversioned package records no range', () => {
    const declarations = inspect(`
      wireRemoteAddon({ name: 'registry', package: '@pikkustudio/addon-registry', serverUrl: '' })
    `)
    const decl = declarations.get('registry')
    assert.equal(decl.package, '@pikkustudio/addon-registry')
    assert.equal('range' in decl, false)
  })

  test('a template literal without substitutions is still a literal', () => {
    const declarations = inspect(
      'wireRemoteAddon({ name: "mail", package: `mail@1.0.0`, serverUrl: "" })'
    )
    assert.equal(declarations.get('mail').range, '1.0.0')
  })

  test('refuses a package that is not a literal', () => {
    const declarations = inspect(`
      const PKG = '@pikkustudio/addon-cloud-api@^1.4.0'
      wireRemoteAddon({ name: 'cloudapi', package: PKG, serverUrl: '' })
    `)
    assert.equal(declarations.size, 0)
    assert.equal(criticals.length, 1)
    assert.match(
      criticals[0]!,
      new RegExp(
        `^${ErrorCode.REMOTE_ADDON_PACKAGE_NOT_STATIC}: .*not a string literal`
      )
    )
  })

  test('refuses a trailing @ with no range', () => {
    inspect(
      `wireRemoteAddon({ name: 'x', package: '@scope/x@', serverUrl: '' })`
    )
    assert.equal(criticals.length, 1)
    assert.match(
      criticals[0]!,
      new RegExp(`^${ErrorCode.REMOTE_ADDON_PACKAGE_INVALID}`)
    )
  })
})
