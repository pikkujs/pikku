import assert from 'node:assert/strict'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import { KyselyScopeService } from '@pikku/kysely'
import { createKysely } from '../db/local-db.js'
import { scopesPrune } from './scopes-prune.js'
import { scopesAudit } from './scopes-audit.js'

/**
 * Drives the real command functions against a real sqlite database, so the
 * `--yes` gate is proven by what actually lands on disk rather than by a stub.
 */
let root: string
let logs: string[]

const logger = {
  info: (msg: string) => logs.push(msg),
  warn: (msg: string) => logs.push(msg),
  error: (msg: string) => logs.push(msg),
  debug: () => {},
} as any

/** Scopes the code declares after the rename: `billing:read` is gone. */
const DECLARED_META = {
  admin: { name: 'admin', scopes: { invoices: {} } },
}

const config = () => ({
  rootDir: root,
  outDir: join(root, '.pikku'),
  runtimeDir: join(root, '.pikku-runtime'),
  srcDirectories: ['src'],
  scopesMetaJsonFile: join(root, '.pikku', 'scopes', 'meta.gen.json'),
})

const openDb = async () =>
  createKysely<KyselyPikkuDB>({
    dialect: 'sqlite',
    dbFile: join(root, '.pikku-runtime', 'dev.db'),
    camelCase: true,
    coercionFile: join(root, 'nope.js'),
  } as any)

const scopeNames = async (db: Kysely<KyselyPikkuDB>) =>
  (await db.selectFrom('pikkuScopes').select('name').execute())
    .map((r) => r.name)
    .sort()

const run = async (fn: any, data: any = {}) =>
  fn.func({ logger, config: config() } as any, data, {} as any)

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pikku-scopes-cmd-'))
  logs = []

  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, '.pikku', 'scopes'), { recursive: true })
  writeFileSync(
    join(root, 'src', 'config.ts'),
    `export const createConfig = async () => ({ sqliteDb: '.pikku-runtime/dev.db' })`,
    'utf8'
  )
  writeFileSync(
    join(root, '.pikku', 'scopes', 'meta.gen.json'),
    JSON.stringify(DECLARED_META),
    'utf8'
  )

  // Seed the database as a previous deploy left it: `billing:read` was declared
  // then, is granted to a role, and is no longer declared now.
  const db = await openDb()
  const service = new KyselyScopeService(db)
  await service.init()
  await service.syncScopes([
    { id: 'admin' },
    { id: 'admin:invoices' },
    { id: 'billing' },
    { id: 'billing:read' },
  ])
  await service.createRole({ name: 'billing', scopes: ['billing:read'] })
  await db.destroy()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pikku scopes prune', () => {
  // The gate that matters: pruning revokes access, so the default must be a
  // dry run. Deleting by default would make a mistyped command destructive.
  test('without --yes it reports but deletes nothing', async () => {
    await run(scopesPrune, { yes: false })

    const db = await openDb()
    assert.ok(
      (await scopeNames(db)).includes('billing:read'),
      'a dry run must not delete'
    )
    await db.destroy()

    assert.match(logs.join('\n'), /--yes/)
  })

  test('names the roles that would lose a scope before deleting', async () => {
    await run(scopesPrune, { yes: false })

    const output = logs.join('\n')
    assert.match(output, /billing:read/)
    assert.match(output, /held by 1 role\(s\): billing/)
  })

  test('with --yes it removes the undeclared scopes', async () => {
    await run(scopesPrune, { yes: true })

    const db = await openDb()
    assert.deepEqual(await scopeNames(db), ['admin', 'admin:invoices'])
    await db.destroy()
  })

  test('with --yes it cascades the scope out of its roles', async () => {
    await run(scopesPrune, { yes: true })

    const db = await openDb()
    const rows = await db.selectFrom('pikkuRoleScopes').selectAll().execute()
    assert.equal(rows.length, 0)
    await db.destroy()
  })

  test('never touches a scope that is still declared', async () => {
    await run(scopesPrune, { yes: true })

    const db = await openDb()
    assert.ok((await scopeNames(db)).includes('admin:invoices'))
    await db.destroy()
  })

  test('counts distinct roles, not stale scopes, in the blast radius', async () => {
    const db = await openDb()
    const service = new KyselyScopeService(db)
    await service.setRoleScopes('billing', ['billing', 'billing:read'])
    await db.destroy()

    await run(scopesPrune, { yes: true })

    assert.match(logs.join('\n'), /Revoked from 1 role\(s\)/)
  })

  test('reports nothing to do when the code and database agree', async () => {
    await run(scopesPrune, { yes: true })
    logs = []

    await run(scopesPrune, { yes: true })

    assert.match(logs.join('\n'), /nothing to prune/)
  })
})

describe('pikku scopes audit', () => {
  test('reports an undeclared scope and the role holding it', async () => {
    await run(scopesAudit)

    const output = logs.join('\n')
    assert.match(output, /billing:read/)
    assert.match(output, /held by 1 role\(s\): billing/)
  })

  // An audit is a read: it must never be the thing that revokes access.
  test('deletes nothing', async () => {
    await run(scopesAudit)

    const db = await openDb()
    assert.ok((await scopeNames(db)).includes('billing:read'))
    await db.destroy()
  })

  test('is quiet when every scope is still declared', async () => {
    await run(scopesPrune, { yes: true })
    logs = []

    await run(scopesAudit)

    assert.match(
      logs.join('\n'),
      /every scope in the database is still declared/
    )
  })
})
