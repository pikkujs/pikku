import assert from 'node:assert/strict'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import {
  KyselyScopeService,
  applyPikkuSchemas,
  scopeSchema,
} from '@pikku/kysely'
import { createKysely } from '../db/local-db.js'
import { rolesPrune } from './roles-prune.js'
import { rolesAudit } from './roles-audit.js'

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

const SCOPES_META = {
  admin: { name: 'admin', scopes: {} },
  reports: { name: 'reports', scopes: { read: {} } },
}

/** Roles the code declares after the rename: `legacy-auditor` is gone. */
const DECLARED_META = {
  'platform-admin': {
    name: 'platform-admin',
    description: 'Every capability that acts on the application as a whole',
    scopes: ['admin'],
  },
}

const config = () => ({
  rootDir: root,
  outDir: join(root, '.pikku'),
  runtimeDir: join(root, '.pikku-runtime'),
  srcDirectories: ['src'],
  scopesMetaJsonFile: join(root, '.pikku', 'scopes', 'scopes.gen.json'),
  rolesMetaJsonFile: join(root, '.pikku', 'scopes', 'roles.gen.json'),
})

const openDb = async () =>
  createKysely<KyselyPikkuDB>({
    dialect: 'sqlite',
    dbFile: join(root, '.pikku-runtime', 'dev.db'),
    camelCase: true,
    coercionFile: join(root, 'nope.js'),
  } as any)

const roleNames = async (db: Kysely<KyselyPikkuDB>) =>
  (await db.selectFrom('pikkuRoles').select('name').execute())
    .map((r) => r.name)
    .sort()

const run = async (fn: any, data: any = {}) =>
  fn.func({ logger, config: config() } as any, data, {} as any)

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pikku-roles-cmd-'))
  logs = []

  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, '.pikku', 'scopes'), { recursive: true })
  writeFileSync(
    join(root, 'src', 'config.ts'),
    `export const createConfig = async () => ({ sqliteDb: '.pikku-runtime/dev.db' })`,
    'utf8'
  )
  writeFileSync(
    join(root, '.pikku', 'scopes', 'scopes.gen.json'),
    JSON.stringify(SCOPES_META),
    'utf8'
  )
  writeFileSync(
    join(root, '.pikku', 'scopes', 'roles.gen.json'),
    JSON.stringify(DECLARED_META),
    'utf8'
  )

  // Seed the database as a previous deploy left it: `legacy-auditor` was
  // declared then, is held by somebody, and is no longer declared now.
  const db = await openDb()
  // Better Auth owns and creates the `user` table before the scope service ever
  // runs; a user grant FKs into it.
  await (db as Kysely<any>).schema
    .createTable('user')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .execute()
  await (db as Kysely<any>)
    .insertInto('user')
    .values({ id: 'auditor-1' })
    .execute()

  await applyPikkuSchemas(db, [scopeSchema])
  const service = new KyselyScopeService(db)
  await service.init()
  await service.syncScopes([
    { id: 'admin' },
    { id: 'reports' },
    { id: 'reports:read' },
  ])
  await service.syncSystemRoles([
    { name: 'platform-admin', scopes: ['admin'] },
    { name: 'legacy-auditor', scopes: ['reports:read'] },
  ])
  await service.addUserToRole('auditor-1', 'legacy-auditor')
  // A role the console composed. It was never declared, so it is not stale —
  // it is simply not this command's business.
  await service.createRole({ name: 'support', scopes: ['reports:read'] })
  await db.destroy()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pikku roles prune', () => {
  // The gate that matters: pruning revokes access, so the default must be a
  // dry run. Deleting by default would make a mistyped command destructive.
  test('without --yes it reports but deletes nothing', async () => {
    await run(rolesPrune, { yes: false })

    const db = await openDb()
    assert.ok(
      (await roleNames(db)).includes('legacy-auditor'),
      'a dry run must not delete'
    )
    await db.destroy()

    assert.match(logs.join('\n'), /--yes/)
  })

  test('names the people who would lose a role before deleting', async () => {
    await run(rolesPrune, { yes: false })

    const output = logs.join('\n')
    assert.match(output, /legacy-auditor/)
    assert.match(output, /held by 1 user\(s\)/)
    assert.match(output, /revoke 1 role\(s\) from 1 user grant\(s\)/)
  })

  test('with --yes it removes the undeclared system roles', async () => {
    await run(rolesPrune, { yes: true })

    const db = await openDb()
    assert.ok(!(await roleNames(db)).includes('legacy-auditor'))
    await db.destroy()
  })

  test('with --yes it cascades the role out of its user grants', async () => {
    await run(rolesPrune, { yes: true })

    const db = await openDb()
    const rows = await db
      .selectFrom('pikkuUserRole')
      .selectAll()
      .where('role', '=', 'legacy-auditor')
      .execute()
    assert.equal(rows.length, 0)
    await db.destroy()
  })

  test('never touches a role that is still declared', async () => {
    await run(rolesPrune, { yes: true })

    const db = await openDb()
    assert.ok((await roleNames(db)).includes('platform-admin'))
    await db.destroy()
  })

  // A console-composed role was never declared, so "no longer declared" is not
  // a thing that can be said about it. Pruning one would delete somebody's own
  // work on the strength of a file they do not control.
  test('never touches a role the console composed', async () => {
    await run(rolesPrune, { yes: true })

    const db = await openDb()
    assert.ok((await roleNames(db)).includes('support'))
    await db.destroy()
  })

  test('reports nothing to do when the code and database agree', async () => {
    await run(rolesPrune, { yes: true })
    logs = []

    await run(rolesPrune, { yes: true })

    assert.match(logs.join('\n'), /nothing to prune/)
  })
})

describe('pikku roles audit', () => {
  test('reports an undeclared role and how many people hold it', async () => {
    await run(rolesAudit)

    const output = logs.join('\n')
    assert.match(output, /legacy-auditor/)
    assert.match(output, /held by 1 user\(s\)/)
    assert.match(output, /pikku roles prune --yes/)
  })

  // An audit is a read: it must never be the thing that revokes access.
  test('deletes nothing', async () => {
    await run(rolesAudit)

    const db = await openDb()
    assert.ok((await roleNames(db)).includes('legacy-auditor'))
    await db.destroy()
  })

  test('is quiet when every role is still declared', async () => {
    await run(rolesPrune, { yes: true })
    logs = []

    await run(rolesAudit)

    assert.match(
      logs.join('\n'),
      /every system role in the database is still declared/
    )
  })
})
