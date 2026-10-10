import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  KyselyAgentStorageService,
  KyselyFeatureFlagStore,
  KyselyLeaseService,
  KyselyScopeService,
  KyselySecretService,
  KyselySessionStore,
  KyselyTriggerSourceStore,
  applyPikkuSchemas,
  agentSchema,
  flagSchema,
  leaseSchema,
  scopeSchema,
  secretSchema,
  sessionSchema,
  triggerSourceSchema,
  withUserTable,
} from '@pikku/kysely'
import { sql, type Kysely } from 'kysely'
import { createMysqlKysely, withMysqlClient } from './mysql-client.js'
import type { ResolvedMysqlDb } from '../local-db.js'

/**
 * The @pikku/kysely stores were written against postgres and sqlite
 * (`on conflict ... excluded.`, `returning`, `cast(... as bigint)`), none of
 * which MySQL accepts. Each store's upsert, ignore and delete-returning path is
 * run here against a real server. Needs PIKKU_TEST_MYSQL_URL, as mysql-live does.
 */
const SERVER_URL = process.env.PIKKU_TEST_MYSQL_URL

describe('@pikku/kysely stores on mysql', { skip: !SERVER_URL }, () => {
  const admin = { connectionString: SERVER_URL! } as ResolvedMysqlDb
  const database = `pikku_t_${randomBytes(5).toString('hex')}`
  let db: Kysely<any>

  before(async () => {
    await withMysqlClient(admin, (c) =>
      c.exec(`CREATE DATABASE \`${database}\``)
    )
    const url = new URL(SERVER_URL!)
    url.pathname = `/${database}`
    db = await createMysqlKysely<any>({ url: url.toString() })
    // A Rails-style users table: the scope schema keys onto its bigint id.
    await sql`create table users (id bigint not null auto_increment primary key)`.execute(
      db
    )
    await sql`insert into users (id) values (7)`.execute(db)
    await applyPikkuSchemas(db, [
      ...withUserTable([scopeSchema], 'users'),
      agentSchema,
      flagSchema,
      leaseSchema,
      secretSchema,
      sessionSchema,
      triggerSourceSchema,
    ])
  })

  after(async () => {
    await db?.destroy()
    await withMysqlClient(admin, (c) =>
      c.exec(`DROP DATABASE IF EXISTS \`${database}\``)
    )
  })

  test('scope service: sync upserts, grants are idempotent, prune returns names', async () => {
    const scopes = new KyselyScopeService(db)
    await scopes.init()
    await scopes.syncScopes([{ id: 'a', description: 'one' }, { id: 'b' }])
    await scopes.syncScopes([{ id: 'a', description: 'changed' }])
    const listed = await scopes.listScopes()
    assert.equal(listed.find((s) => s.id === 'a')?.description, 'changed')
    assert.equal(listed.find((s) => s.id === 'b')?.declared, false)

    await scopes.syncSystemRoles([
      { name: 'admin', description: 'x', scopes: ['a'] },
    ] as any)
    await scopes.syncSystemRoles([
      { name: 'admin', description: 'y', scopes: ['a'] },
    ] as any)
    await scopes.addUserToRole('7', 'admin')
    await scopes.addUserToRole('7', 'admin')
    await scopes.addScopeToUser('7', 'a')
    await scopes.addScopeToUser('7', 'a')
    assert.deepEqual(await scopes.listUserRoles('7'), ['admin'])
    assert.deepEqual(await scopes.resolveScopes('7'), ['a'])

    assert.deepEqual(await scopes.pruneScopes(), ['b'])
    await scopes.syncSystemRoles([])
    assert.deepEqual(await scopes.pruneSystemRoles(), ['admin'])
  })

  test('feature flags: sync keeps operator state, override upsert, prune', async () => {
    const flags = new KyselyFeatureFlagStore(db)
    await flags.init()
    await flags.syncFlags([{ name: 'f1', description: 'first' } as any])
    await flags.setEnabled('f1', true)
    await flags.syncFlags([
      { name: 'f1', description: 'second', anyOf: ['x'] } as any,
      { name: 'f2' } as any,
    ])
    const rows = await flags.listFlags()
    const f1 = rows.find((r) => r.name === 'f1')!
    assert.equal(f1.description, 'second')
    assert.equal(f1.enabled, true)
    assert.deepEqual(f1.anyOf, ['x'])

    await flags.setOverride('f1', { userId: 'u1' } as any, true, 'me')
    await flags.setOverride('f1', { userId: 'u1' } as any, false, 'you')
    const overrides = await flags.listOverrides('f1')
    assert.equal(overrides.length, 1)
    assert.equal(overrides[0]!.enabled, false)
    assert.equal(overrides[0]!.grantedBy, 'you')

    await flags.syncFlags([{ name: 'f1' } as any])
    assert.deepEqual(await flags.pruneFlags(), ['f2'])
  })

  test('session store upserts', async () => {
    const sessions = new KyselySessionStore(db)
    await sessions.init()
    await sessions.set('u1', { userId: 'one' } as any)
    await sessions.set('u1', { userId: 'two' } as any)
    assert.deepEqual(await sessions.get('u1'), { userId: 'two' })
  })

  test('trigger sources upsert', async () => {
    const store = new KyselyTriggerSourceStore(db)
    await store.init()
    await store.syncTriggerSources([{ name: 't', kind: 'k1' } as any])
    await store.syncTriggerSources([{ name: 't', kind: 'k2' } as any])
    assert.equal((await store.getTriggerSource('t'))?.kind, 'k2')
  })

  test('secrets: salt insert-or-ignore and value upsert', async () => {
    const secrets = new KyselySecretService(db, { key: 'k'.repeat(32) })
    await secrets.init()
    await secrets.setSecret('s', 'one')
    await secrets.setSecret('s', 'two')
    assert.equal((await secrets.getSecret<string>('s')).reveal(), 'two')
  })

  test('lease service acquires and releases on the process clock', async () => {
    const leases = new KyselyLeaseService(db)
    await leases.init()
    const lease = await leases.acquire('k', 'me', 10_000)
    assert.ok(lease)
    assert.ok(!(await leases.acquire('k', 'other', 10_000)))
    await leases.release(lease!)
    assert.ok(await leases.acquire('k', 'other', 10_000))
  })

  test('agent storage: working memory upsert', async () => {
    const agents = new KyselyAgentStorageService(db)
    await agents.init()
    await agents.saveWorkingMemory('r', 'resource', { a: 1 })
    await agents.saveWorkingMemory('r', 'resource', { a: 2 })
    assert.deepEqual(await agents.getWorkingMemory('r', 'resource'), { a: 2 })
  })
})
