import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyScopeService } from './kysely-scope-service.js'

const SCOPES = [
  { id: 'admin' },
  { id: 'admin:invoices', description: 'Invoice management' },
  { id: 'admin:invoices:create' },
  { id: 'billing' },
  { id: 'billing:read' },
]

let db: Kysely<KyselyPikkuDB>
let service: KyselyScopeService

/**
 * ScopeService FKs into better-auth's `user` table, which better-auth owns and
 * migrates. Stand it up here so the cascade can be exercised.
 */
const createUserTable = async (db: Kysely<any>) => {
  await db.schema
    .createTable('user')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .execute()
}

const addUser = async (id: string) => {
  await (db as Kysely<any>).insertInto('user').values({ id }).execute()
}

beforeEach(async () => {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await createUserTable(db)
  service = new KyselyScopeService(db)
  await service.init()
  await service.syncScopes(SCOPES)
})

describe('KyselyScopeService — syncScopes', () => {
  test('registers the declared scopes', async () => {
    const rows = await db.selectFrom('pikkuScopes').select('name').execute()
    assert.deepEqual(
      rows.map((r) => r.name).sort(),
      SCOPES.map((s) => s.id).sort()
    )
  })

  test('is idempotent', async () => {
    await service.syncScopes(SCOPES)
    const rows = await db.selectFrom('pikkuScopes').select('name').execute()
    assert.equal(rows.length, SCOPES.length)
  })

  test('adds newly declared scopes', async () => {
    await service.syncScopes([...SCOPES, { id: 'reports' }])
    const rows = await db.selectFrom('pikkuScopes').select('name').execute()
    assert.ok(rows.some((r) => r.name === 'reports'))
  })

  // The decision that matters: an undeclared scope is inert, not revoked.
  // Auto-deleting here would mean a rename or a rollback silently destroys
  // grants, and during a rolling deploy the last replica to boot would win.
  test('never deletes a scope that is no longer declared', async () => {
    await service.syncScopes([{ id: 'admin' }])

    const rows = await db.selectFrom('pikkuScopes').select('name').execute()
    assert.ok(
      rows.some((r) => r.name === 'billing:read'),
      'an undeclared scope must survive a sync'
    )
  })

  test('does not revoke a grant when a scope stops being declared', async () => {
    await service.createRole({ name: 'billing', scopes: ['billing:read'] })
    await addUser('u1')
    await service.addUserToRole('u1', 'billing')

    await service.syncScopes([{ id: 'admin' }])

    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('lists the declared vocabulary with descriptions', async () => {
    const scopes = await service.listScopes()

    assert.deepEqual(
      scopes.map((s) => s.id).sort(),
      SCOPES.map((s) => s.id).sort()
    )
    assert.equal(
      scopes.find((s) => s.id === 'admin:invoices')!.description,
      'Invoice management'
    )
    assert.ok(scopes.every((s) => s.declared))
  })

  test('lists an undeclared scope as undeclared rather than hiding it', async () => {
    await service.syncScopes([{ id: 'admin' }])

    const scopes = await service.listScopes()
    const billing = scopes.find((s) => s.id === 'billing:read')

    assert.ok(billing, 'an undeclared scope is still in the vocabulary')
    assert.equal(billing!.declared, false)
  })

  test('updates a description in place', async () => {
    await service.syncScopes([{ id: 'admin', description: 'Changed' }])
    const row = await db
      .selectFrom('pikkuScopes')
      .select('description')
      .where('name', '=', 'admin')
      .executeTakeFirst()
    assert.equal(row!.description, 'Changed')
  })
})

describe('KyselyScopeService — roles', () => {
  test('creates a role with scopes', async () => {
    await service.createRole({
      name: 'invoicing',
      description: 'Invoice staff',
      scopes: ['admin:invoices:create'],
    })

    const roles = await service.listRoles()
    assert.equal(roles.length, 1)
    assert.equal(roles[0]!.name, 'invoicing')
    assert.equal(roles[0]!.description, 'Invoice staff')
    assert.deepEqual(roles[0]!.scopes, ['admin:invoices:create'])
  })

  // The FK's real value: the database itself refuses an undeclared grant, so
  // the console role editor cannot write one.
  test('refuses to grant an undeclared scope', async () => {
    await assert.rejects(
      () => service.createRole({ name: 'bogus', scopes: ['nope:nothere'] }),
      'the FK to pikku_scopes must reject an undeclared scope'
    )
  })

  test("replaces a role's scopes", async () => {
    await service.createRole({ name: 'r', scopes: ['billing:read'] })
    await service.setRoleScopes('r', ['admin:invoices:create'])

    const roles = await service.listRoles()
    assert.deepEqual(roles[0]!.scopes, ['admin:invoices:create'])
  })

  test('deleting a role cascades its scope rows away', async () => {
    await service.createRole({ name: 'r', scopes: ['billing:read'] })
    await service.deleteRole('r')

    const rows = await db.selectFrom('pikkuRoleScopes').selectAll().execute()
    assert.equal(rows.length, 0)
  })
})

describe('KyselyScopeService — user grants', () => {
  beforeEach(async () => {
    await service.createRole({ name: 'billing', scopes: ['billing:read'] })
    await service.createRole({
      name: 'invoicing',
      scopes: ['admin:invoices:create', 'admin:invoices'],
    })
    await addUser('u1')
  })

  test('resolves nothing for a user with no roles', async () => {
    await addUser('u2')
    assert.deepEqual(await service.resolveScopes('u2'), [])
  })

  test('resolves the scopes of a granted role', async () => {
    await service.addUserToRole('u1', 'billing')
    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('unions scopes across several roles', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.addUserToRole('u1', 'invoicing')

    assert.deepEqual((await service.resolveScopes('u1')).sort(), [
      'admin:invoices',
      'admin:invoices:create',
      'billing:read',
    ])
  })

  test('deduplicates a scope shared by two roles', async () => {
    await service.createRole({ name: 'other', scopes: ['billing:read'] })
    await service.addUserToRole('u1', 'billing')
    await service.addUserToRole('u1', 'other')

    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('granting the same role twice is idempotent', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.addUserToRole('u1', 'billing')

    assert.deepEqual(await service.listUserRoles('u1'), ['billing'])
  })

  test('removes a user from a role', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.removeUserFromRole('u1', 'billing')

    assert.deepEqual(await service.resolveScopes('u1'), [])
  })

  test('records who granted the role', async () => {
    await service.addUserToRole('u1', 'billing', 'admin-user')

    const row = await db
      .selectFrom('pikkuUserRole')
      .select('grantedBy')
      .where('userId', '=', 'u1')
      .executeTakeFirst()
    assert.equal(row!.grantedBy, 'admin-user')
  })

  test('refuses to grant a role that does not exist', async () => {
    await assert.rejects(() => service.addUserToRole('u1', 'ghost'))
  })

  test('deleting a role cascades the user grant away', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.deleteRole('billing')

    assert.deepEqual(await service.listUserRoles('u1'), [])
  })

  test('deleting a user cascades their role grants away', async () => {
    await service.addUserToRole('u1', 'billing')

    await (db as Kysely<any>)
      .deleteFrom('user')
      .where('id', '=', 'u1')
      .execute()

    const rows = await db.selectFrom('pikkuUserRole').selectAll().execute()
    assert.equal(rows.length, 0, 'better-auth owns users; grants must follow')
  })
})

describe('KyselyScopeService — direct user scopes', () => {
  beforeEach(async () => {
    await service.createRole({ name: 'billing', scopes: ['billing:read'] })
    await addUser('u1')
  })

  test('resolves a scope granted directly to a user', async () => {
    await service.addScopeToUser('u1', 'billing:read')
    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('unions direct grants with role-derived scopes', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.addScopeToUser('u1', 'admin:invoices:create')

    assert.deepEqual((await service.resolveScopes('u1')).sort(), [
      'admin:invoices:create',
      'billing:read',
    ])
  })

  test('deduplicates a scope held both directly and via a role', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.addScopeToUser('u1', 'billing:read')

    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('lists only the directly granted scopes, not role-derived ones', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.addScopeToUser('u1', 'admin:invoices:create')

    assert.deepEqual(await service.listUserScopes('u1'), [
      'admin:invoices:create',
    ])
  })

  test('removing a direct grant leaves a role-derived scope intact', async () => {
    await service.addUserToRole('u1', 'billing')
    await service.addScopeToUser('u1', 'admin:invoices:create')
    await service.removeScopeFromUser('u1', 'admin:invoices:create')

    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('granting the same scope twice is idempotent', async () => {
    await service.addScopeToUser('u1', 'billing:read')
    await service.addScopeToUser('u1', 'billing:read')

    assert.deepEqual(await service.listUserScopes('u1'), ['billing:read'])
  })

  // Same FK guarantee as roles: the database refuses a direct grant of a scope
  // that was never declared, so the console cannot write one.
  test('refuses to grant an undeclared scope directly', async () => {
    await assert.rejects(
      () => service.addScopeToUser('u1', 'nope:nothere'),
      'the FK to pikku_scopes must reject an undeclared direct grant'
    )
  })

  test('records who granted the scope', async () => {
    await service.addScopeToUser('u1', 'billing:read', 'admin-user')

    const row = await db
      .selectFrom('pikkuUserScope')
      .select('grantedBy')
      .where('userId', '=', 'u1')
      .executeTakeFirst()
    assert.equal(row!.grantedBy, 'admin-user')
  })

  test('deleting a user cascades their direct scope grants away', async () => {
    await service.addScopeToUser('u1', 'billing:read')

    await (db as Kysely<any>)
      .deleteFrom('user')
      .where('id', '=', 'u1')
      .execute()

    const rows = await db.selectFrom('pikkuUserScope').selectAll().execute()
    assert.equal(rows.length, 0, 'better-auth owns users; grants must follow')
  })

  test('pruning an undeclared scope cascades a direct grant away', async () => {
    await service.addScopeToUser('u1', 'billing:read')
    await service.syncScopes([{ id: 'admin' }])
    await service.pruneScopes()

    assert.deepEqual(await service.resolveScopes('u1'), [])
  })
})

describe('KyselyScopeService — audit and prune', () => {
  beforeEach(async () => {
    await service.createRole({ name: 'billing', scopes: ['billing:read'] })
    await addUser('u1')
    await service.addUserToRole('u1', 'billing')
  })

  test('reports nothing stale when everything is declared', async () => {
    assert.deepEqual(await service.findStaleScopes(), [])
  })

  test('reports a stale scope and the roles holding it', async () => {
    await service.syncScopes([{ id: 'admin' }])

    const stale = await service.findStaleScopes()
    const billing = stale.find((s) => s.scope === 'billing:read')
    assert.ok(billing, 'billing:read is no longer declared')
    assert.deepEqual(billing!.roles, ['billing'])
  })

  test('prune removes stale scopes and reports them', async () => {
    await service.syncScopes([{ id: 'admin' }])

    const pruned = await service.pruneScopes()

    assert.ok(pruned.includes('billing:read'))
    const rows = await db.selectFrom('pikkuScopes').select('name').execute()
    assert.ok(!rows.some((r) => r.name === 'billing:read'))
  })

  test('prune cascades the stale scope out of its roles', async () => {
    await service.syncScopes([{ id: 'admin' }])
    await service.pruneScopes()

    assert.deepEqual(
      await service.resolveScopes('u1'),
      [],
      'pruning is the deliberate revocation path'
    )
  })

  test('prune leaves declared scopes alone', async () => {
    await service.pruneScopes()

    assert.deepEqual(await service.resolveScopes('u1'), ['billing:read'])
  })

  test('prune ignores a scope a concurrent sync redeclared between select and delete', async () => {
    await service.syncScopes([{ id: 'admin' }])

    const racy = new (class extends KyselyScopeService {
      async findStaleScopes() {
        const stale = await super.findStaleScopes()
        await this.syncScopes([{ id: 'admin' }, { id: 'billing:read' }])
        return stale
      }
    })(db)

    await racy.pruneScopes()

    assert.deepEqual(
      await service.resolveScopes('u1'),
      ['billing:read'],
      'a scope redeclared before the delete must keep its grants'
    )
  })
})
