import type { Role, ScopeService } from '@pikku/core/services'
import type { FlatScope } from '@pikku/core/scope'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'

/**
 * Resolves and administers user scopes against four self-created tables.
 *
 * Requires better-auth: `pikku_user_role.user_id` references its `user` table
 * with ON DELETE CASCADE, so deleting a user takes their grants with it. That
 * table is created by better-auth's own migrations, which `pikku db migrate`
 * hard-fails without, so it exists before `init()` runs.
 *
 * Scopes are declared in code and synced here; roles are data, composed by
 * admins at runtime. `pikku_role_scopes` FKs into `pikku_scopes`, so the
 * database itself refuses to grant a scope that was never declared.
 */
export class KyselyScopeService implements ScopeService {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('pikku_scopes')
      .ifNotExists()
      .addColumn('name', 'text', (col) => col.primaryKey())
      .addColumn('description', 'text')
      .addColumn('declared', 'boolean', (col) => col.defaultTo(true).notNull())
      .execute()

    await this.db.schema
      .createTable('pikku_roles')
      .ifNotExists()
      .addColumn('name', 'text', (col) => col.primaryKey())
      .addColumn('description', 'text')
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createTable('pikku_role_scopes')
      .ifNotExists()
      .addColumn('role', 'text', (col) =>
        col.notNull().references('pikku_roles.name').onDelete('cascade')
      )
      .addColumn('scope', 'text', (col) =>
        col.notNull().references('pikku_scopes.name').onDelete('cascade')
      )
      .addPrimaryKeyConstraint('pikku_role_scopes_pk', ['role', 'scope'])
      .execute()

    await this.db.schema
      .createTable('pikku_user_role')
      .ifNotExists()
      .addColumn('user_id', 'text', (col) =>
        col.notNull().references('user.id').onDelete('cascade')
      )
      .addColumn('role', 'text', (col) =>
        col.notNull().references('pikku_roles.name').onDelete('cascade')
      )
      .addColumn('granted_by', 'text')
      .addColumn('granted_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addPrimaryKeyConstraint('pikku_user_role_pk', ['user_id', 'role'])
      .execute()

    await this.db.schema
      .createIndex('pikku_role_scopes_scope_idx')
      .ifNotExists()
      .on('pikku_role_scopes')
      .column('scope')
      .execute()

    await this.db.schema
      .createIndex('pikku_user_role_role_idx')
      .ifNotExists()
      .on('pikku_user_role')
      .column('role')
      .execute()

    this.initialized = true
  }

  /**
   * Registers the declared scope set.
   *
   * Additive: rows are upserted and anything no longer declared is *marked*
   * (`declared = false`), never deleted. Marking is non-destructive, so a
   * rename, a rollback, or a rolling deploy where an older replica is still
   * serving cannot silently strip a grant. `pruneScopes` is the deliberate
   * removal path.
   */
  async syncScopes(scopes: FlatScope[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      if (scopes.length > 0) {
        await trx
          .insertInto('pikkuScopes')
          .values(
            scopes.map((scope) => ({
              name: scope.id,
              description: scope.description ?? null,
              declared: true,
            }))
          )
          .onConflict((oc) =>
            oc.column('name').doUpdateSet((eb) => ({
              description: eb.ref('excluded.description'),
              declared: true,
            }))
          )
          .execute()
      }

      const markStale = trx.updateTable('pikkuScopes').set({ declared: false })
      await (
        scopes.length > 0
          ? markStale.where(
              'name',
              'not in',
              scopes.map((s) => s.id)
            )
          : markStale
      ).execute()
    })
  }

  async resolveScopes(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pikkuUserRole')
      .innerJoin(
        'pikkuRoleScopes',
        'pikkuRoleScopes.role',
        'pikkuUserRole.role'
      )
      .select('pikkuRoleScopes.scope')
      .where('pikkuUserRole.userId', '=', userId)
      .distinct()
      .execute()

    return rows.map((row) => row.scope)
  }

  async listScopes(): Promise<Array<FlatScope & { declared: boolean }>> {
    const rows = await this.db
      .selectFrom('pikkuScopes')
      .select(['name', 'description', 'declared'])
      .execute()

    return rows.map((row) => ({
      id: row.name,
      description: row.description ?? undefined,
      declared: !!row.declared,
    }))
  }

  async createRole(role: Role): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('pikkuRoles')
        .values({ name: role.name, description: role.description ?? null })
        .execute()

      if (role.scopes.length > 0) {
        await trx
          .insertInto('pikkuRoleScopes')
          .values(role.scopes.map((scope) => ({ role: role.name, scope })))
          .execute()
      }
    })
  }

  async deleteRole(name: string): Promise<void> {
    await this.db.deleteFrom('pikkuRoles').where('name', '=', name).execute()
  }

  async setRoleScopes(name: string, scopes: string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('pikkuRoleScopes').where('role', '=', name).execute()

      if (scopes.length > 0) {
        await trx
          .insertInto('pikkuRoleScopes')
          .values(scopes.map((scope) => ({ role: name, scope })))
          .execute()
      }
    })
  }

  async listRoles(): Promise<Role[]> {
    const roles = await this.db
      .selectFrom('pikkuRoles')
      .select(['name', 'description'])
      .execute()

    const scopeRows = await this.db
      .selectFrom('pikkuRoleScopes')
      .select(['role', 'scope'])
      .execute()

    const byRole = new Map<string, string[]>()
    for (const row of scopeRows) {
      const existing = byRole.get(row.role)
      if (existing) {
        existing.push(row.scope)
      } else {
        byRole.set(row.role, [row.scope])
      }
    }

    return roles.map((role) => ({
      name: role.name,
      description: role.description ?? undefined,
      scopes: byRole.get(role.name) ?? [],
    }))
  }

  async addUserToRole(
    userId: string,
    role: string,
    grantedBy?: string
  ): Promise<void> {
    await this.db
      .insertInto('pikkuUserRole')
      .values({ userId, role, grantedBy: grantedBy ?? null })
      .onConflict((oc) => oc.columns(['userId', 'role']).doNothing())
      .execute()
  }

  async removeUserFromRole(userId: string, role: string): Promise<void> {
    await this.db
      .deleteFrom('pikkuUserRole')
      .where('userId', '=', userId)
      .where('role', '=', role)
      .execute()
  }

  async listUserRoles(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pikkuUserRole')
      .select('role')
      .where('userId', '=', userId)
      .execute()

    return rows.map((row) => row.role)
  }

  /**
   * Scopes marked undeclared by the last sync, with the roles that would lose
   * them. Powers `pikku scopes audit`.
   */
  async findStaleScopes(): Promise<Array<{ scope: string; roles: string[] }>> {
    const stale = await this.db
      .selectFrom('pikkuScopes')
      .leftJoin('pikkuRoleScopes', 'pikkuRoleScopes.scope', 'pikkuScopes.name')
      .select(['pikkuScopes.name as scope', 'pikkuRoleScopes.role as role'])
      .where('pikkuScopes.declared', '=', false)
      .execute()

    const byScope = new Map<string, string[]>()
    for (const row of stale) {
      const roles = byScope.get(row.scope) ?? []
      if (row.role) {
        roles.push(row.role)
      }
      byScope.set(row.scope, roles)
    }

    return [...byScope.entries()].map(([scope, roles]) => ({ scope, roles }))
  }

  /**
   * Removes undeclared scopes, cascading them out of every role that holds
   * them. This revokes access, so it is never run implicitly.
   */
  async pruneScopes(): Promise<string[]> {
    const stale = await this.findStaleScopes()
    if (stale.length === 0) {
      return []
    }

    const names = stale.map((s) => s.scope)
    const deleted = await this.db
      .deleteFrom('pikkuScopes')
      .where('name', 'in', names)
      .where('declared', '=', false)
      .returning('name')
      .execute()

    return deleted.map((r) => r.name)
  }
}
