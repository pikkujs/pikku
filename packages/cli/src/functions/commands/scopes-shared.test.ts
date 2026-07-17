import assert from 'node:assert/strict'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDeclaredScopes } from './scopes-shared.js'

let dir: string
let errors: string[]

const logger = {
  error: (msg: string) => errors.push(msg),
  info: () => {},
  warn: () => {},
}

const write = (meta: unknown) => {
  const file = join(dir, 'pikku-scopes-meta.gen.json')
  writeFileSync(file, JSON.stringify(meta), 'utf8')
  return file
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pikku-scopes-'))
  errors = []
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadDeclaredScopes', () => {
  test('flattens a declared tree into every grantable id', async () => {
    const file = write({
      admin: {
        name: 'admin',
        scopes: {
          invoices: {
            description: 'Invoice management',
            scopes: { create: {} },
          },
        },
      },
      billing: { name: 'billing' },
    })

    const scopes = await loadDeclaredScopes(file, logger)

    assert.deepEqual(scopes!.map((s) => s.id).sort(), [
      'admin',
      'admin:invoices',
      'admin:invoices:create',
      'billing',
    ])
  })

  test('carries descriptions through for the sync', async () => {
    const file = write({
      admin: {
        name: 'admin',
        scopes: { invoices: { description: 'Invoices' } },
      },
    })

    const scopes = await loadDeclaredScopes(file, logger)

    assert.equal(
      scopes!.find((s) => s.id === 'admin:invoices')!.description,
      'Invoices'
    )
  })

  test('reads an empty declaration set', async () => {
    const scopes = await loadDeclaredScopes(write({}), logger)
    assert.deepEqual(scopes, [])
  })

  // Load failures must be distinguishable from "nothing declared": pruning
  // against a mistakenly-empty set would delete every scope in the database.
  test('returns null and explains when the file is missing', async () => {
    const scopes = await loadDeclaredScopes(join(dir, 'nope.json'), logger)

    assert.equal(scopes, null)
    assert.match(errors.join('\n'), /pikku all/)
  })

  test('returns null when the file is not valid JSON', async () => {
    const file = join(dir, 'bad.json')
    writeFileSync(file, '{ not json', 'utf8')

    assert.equal(await loadDeclaredScopes(file, logger), null)
    assert.equal(errors.length, 1)
  })

  test('returns null when the JSON parses but is not a definition map', async () => {
    for (const notAMap of [[], 'admin', 42, null]) {
      errors = []
      assert.equal(await loadDeclaredScopes(write(notAMap), logger), null)
      assert.equal(errors.length, 1)
    }
  })

  test('returns null when a definition is not shaped like a scope', async () => {
    assert.equal(
      await loadDeclaredScopes(write({ admin: 'yes' }), logger),
      null
    )
    assert.equal(errors.length, 1)
  })
})
