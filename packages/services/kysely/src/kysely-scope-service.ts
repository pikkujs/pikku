import type { Role, ScopeService } from '@pikku/core/services'
import type { FlatScope } from '@pikku/core/scope'
import type { SystemRole } from '@pikku/core/role'
import {
  SystemRoleImmutableError,
  SystemRoleShadowedError,
} from '@pikku/core/errors'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { ensurePikkuSchema } from './schema/index.js'
import { scopeSchema } from './schema/scope.schema.js'

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
    if (this.initialized) return
    await ensurePikkuSchema(this.db, scopeSchema)
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
    const roleScopes = this.db
      .selectFrom('pikkuUserRole')
      .innerJoin(
        'pikkuRoleScopes',
        'pikkuRoleScopes.role',
        'pikkuUserRole.role'
      )
      .select('pikkuRoleScopes.scope')
      .where('pikkuUserRole.userId', '=', userId)

    const directScopes = this.db
      .selectFrom('pikkuUserScope')
      .select('pikkuUserScope.scope')
      .where('pikkuUserScope.userId', '=', userId)

    const rows = await roleScopes.union(directScopes).execute()

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

  /**
   * Registers the roles declared with `defineSystemRole`.
   *
   * Additive on the same terms as `syncScopes` — a role whose declaration has
   * gone is marked `declared = false` rather than deleted, so a rollback or a
   * rolling deploy cannot strip everyone's grant. Its *scope set* is replaced
   * outright, because that is the declaration's entire content: editing
   * `defineSystemRole` is how you change what a role means, and the deploy is
   * when it takes effect.
   */
  async syncSystemRoles(roles: SystemRole[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (const role of roles) {
        await trx
          .insertInto('pikkuRoles')
          .values({
            name: role.name,
            description: role.description ?? null,
            system: true,
            declared: true,
          })
          .onConflict((oc) =>
            oc.column('name').doUpdateSet((eb) => ({
              description: eb.ref('excluded.description'),
              system: true,
              declared: true,
            }))
          )
          .execute()

        await trx
          .deleteFrom('pikkuRoleScopes')
          .where('role', '=', role.name)
          .execute()
        if (role.scopes.length > 0) {
          await trx
            .insertInto('pikkuRoleScopes')
            .values(role.scopes.map((scope) => ({ role: role.name, scope })))
            .execute()
        }
      }

      // Only system rows are in scope here: an admin's own role is not
      // undeclared, it was never declared, and marking it would take it out of
      // the console for a reason nobody could act on.
      const markStale = trx
        .updateTable('pikkuRoles')
        .set({ declared: false })
        .where('system', '=', true)
      await (
        roles.length > 0
          ? markStale.where(
              'name',
              'not in',
              roles.map((role) => role.name)
            )
          : markStale
      ).execute()
    })
  }

  async createRole(role: Role): Promise<void> {
    if (await this.isSystemRole(role.name)) {
      throw new SystemRoleShadowedError(role.name)
    }
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('pikkuRoles')
        .values({
          name: role.name,
          description: role.description ?? null,
          system: false,
          declared: true,
        })
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
    if (await this.isSystemRole(name)) {
      throw new SystemRoleImmutableError(name, 'delete')
    }
    await this.db.deleteFrom('pikkuRoles').where('name', '=', name).execute()
  }

  async setRoleScopes(name: string, scopes: string[]): Promise<void> {
    if (await this.isSystemRole(name)) {
      throw new SystemRoleImmutableError(name, 're-scope')
    }
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

  /**
   * Whether the store holds this name as a system role.
   *
   * Asked of the store rather than of the generated `SYSTEM_ROLES`, because the
   * store is where a shadow would actually collide — and because a role whose
   * declaration was deleted is still immutable until someone prunes it.
   */
  private async isSystemRole(name: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('pikkuRoles')
      .select('system')
      .where('name', '=', name)
      .executeTakeFirst()
    return !!row?.system
  }

  async listRoles(): Promise<Role[]> {
    const roles = await this.db
      .selectFrom('pikkuRoles')
      .select(['name', 'description', 'system', 'declared'])
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
      system: !!role.system,
      declared: !!role.declared,
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

  async addScopeToUser(
    userId: string,
    scope: string,
    grantedBy?: string
  ): Promise<void> {
    await this.db
      .insertInto('pikkuUserScope')
      .values({ userId, scope, grantedBy: grantedBy ?? null })
      .onConflict((oc) => oc.columns(['userId', 'scope']).doNothing())
      .execute()
  }

  async removeScopeFromUser(userId: string, scope: string): Promise<void> {
    await this.db
      .deleteFrom('pikkuUserScope')
      .where('userId', '=', userId)
      .where('scope', '=', scope)
      .execute()
  }

  async listUserScopes(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pikkuUserScope')
      .select('scope')
      .where('userId', '=', userId)
      .execute()

    return rows.map((row) => row.scope)
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

  /**
   * System roles the last sync found no declaration for, with how many people
   * still hold each. Powers `pikku roles audit`.
   *
   * The count is the whole point: "this role is gone from the code" and "this
   * role is gone from the code and 40 people are standing on it" call for
   * different decisions, and the number is what makes pruning a choice rather
   * than a formality.
   */
  async findStaleSystemRoles(): Promise<Array<{ role: string; users: number }>> {
    const stale = await this.db
      .selectFrom('pikkuRoles')
      .leftJoin('pikkuUserRole', 'pikkuUserRole.role', 'pikkuRoles.name')
      .select(['pikkuRoles.name as role', 'pikkuUserRole.userId as userId'])
      .where('pikkuRoles.system', '=', true)
      .where('pikkuRoles.declared', '=', false)
      .execute()

    const byRole = new Map<string, number>()
    for (const row of stale) {
      byRole.set(row.role, (byRole.get(row.role) ?? 0) + (row.userId ? 1 : 0))
    }

    return [...byRole.entries()].map(([role, users]) => ({ role, users }))
  }

  /**
   * Removes undeclared system roles, cascading them out of every user grant
   * that holds them. This revokes access, so it is never run implicitly.
   */
  async pruneSystemRoles(): Promise<string[]> {
    const stale = await this.findStaleSystemRoles()
    if (stale.length === 0) {
      return []
    }

    const deleted = await this.db
      .deleteFrom('pikkuRoles')
      .where(
        'name',
        'in',
        stale.map((s) => s.role)
      )
      .where('system', '=', true)
      .where('declared', '=', false)
      .returning('name')
      .execute()

    return deleted.map((r) => r.name)
  }
}
