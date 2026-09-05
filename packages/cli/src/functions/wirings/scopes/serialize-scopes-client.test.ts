import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import ts from 'typescript'
import { hasScopes as coreHasScopes } from '@pikku/core/scope'
import type { ScopeDefinitions } from '@pikku/core/scope'
import { serializeScopesClient } from './serialize-scopes-client.js'

const definitions: ScopeDefinitions = [
  { name: 'admin', scopes: { invoices: { scopes: { create: {} } } } },
  { name: 'billing' },
]

const cases: Array<[readonly string[] | undefined, string[] | undefined]> = [
  [undefined, ['admin']],
  [[], undefined],
  [['admin'], undefined],
  [['admin'], []],
  [['admin'], ['admin']],
  [['admin'], ['admin:*']],
  [['admin'], ['*']],
  [['admin'], ['billing']],
  [['admin:invoices'], ['admin']],
  [['admin:invoices'], ['admin:*']],
  [['admin:invoices'], ['admin:invoices:*']],
  [['admin:invoices'], ['admin:invoices:create']],
  [['admin:invoices:create'], ['admin:invoices']],
  [['admin:invoices:create'], ['admin:*']],
  [['admin:invoices:create'], ['billing:*']],
  [['admin:*'], ['admin']],
  [['admin:*'], ['admin:*']],
  [['admin:*'], ['admin:invoices']],
  [['admin', 'billing'], ['admin']],
  [
    ['admin', 'billing'],
    ['admin', 'billing'],
  ],
  [['admin', 'billing'], ['*']],
]

describe('serializeScopesClient', () => {
  let dir: string
  let generated: {
    hasScopes: (
      required: readonly string[] | undefined,
      held: Iterable<string> | undefined
    ) => boolean
  }

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-scopes-client-'))
    const file = join(dir, 'scopes.gen.ts')
    await writeFile(file, serializeScopesClient({ definitions }))
    generated = await import(pathToFileURL(file).href)
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('emits the requirable union', () => {
    const output = serializeScopesClient({ definitions })

    assert.ok(output.includes('"admin"'))
    assert.ok(output.includes('"admin:invoices"'))
    assert.ok(output.includes('"admin:invoices:create"'))
    assert.ok(output.includes('"admin:*"'))
    assert.ok(output.includes('"billing"'))
  })

  test('emits a parseable file for a scope id needing escaping', () => {
    const output = serializeScopesClient({
      definitions: [{ name: 'admin\\legacy' }],
    })
    const file = ts.createSourceFile(
      'pikku-scopes-client.gen.ts',
      output,
      ts.ScriptTarget.Latest,
      true
    )

    assert.deepEqual(
      (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
        .parseDiagnostics,
      []
    )
    assert.ok(
      output.includes(JSON.stringify('admin\\legacy')),
      'expected the backslash to survive rather than escape the next character'
    )
  })

  test('emits a file a browser can bundle, with no imports', () => {
    const output = serializeScopesClient({ definitions })

    assert.doesNotMatch(output, /\bimport\b/)
  })

  test('emits `never` when nothing is declared', () => {
    assert.match(serializeScopesClient({ definitions: [] }), /ScopeId = never/)
  })

  test('agrees with core hasScopes on every case', () => {
    for (const [required, held] of cases) {
      assert.equal(
        generated.hasScopes(required, held),
        coreHasScopes(required, held),
        `disagreed on required=${JSON.stringify(required)} held=${JSON.stringify(held)}`
      )
    }
  })
})
