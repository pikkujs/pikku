import type { FlatScope } from '../wirings/scope/scope.types.js'
import type { SystemRole } from '../wirings/role/role.types.js'

/** A role: a named bag of scopes. */
export interface Role {
  name: string
  description?: string
  scopes: string[]
  /**
   * True when the role was declared in code with `defineSystemRole` rather
   * than composed by an admin. System roles may be granted, but not renamed,
   * re-scoped or deleted — see {@link ScopeService.syncSystemRoles}.
   */
  system?: boolean
  /**
   * False when a system role's declaration has been removed from code but its
   * row survives: still held by whoever holds it, no longer offered for new
   * grants, awaiting `pikku roles prune`.
   */
  declared?: boolean
}

/**
 * Resolves and administers the scopes granted to a user.
 *
 * Implementations are called at the **session boundary** — e.g. better-auth's
 * `mapSession` — never by the function runner. The runner reads
 * `session.scopes` and never performs I/O, which keeps it viable on Workers
 * and Lambda. Because the session is rebuilt per request, a scope change takes
 * effect on the next call with nothing cached and nothing to invalidate.
 *
 * `syncScopes` is deliberately additive: scopes are declared in code, so a
 * removed declaration leaves an inert row rather than silently revoking a
 * grant mid-deploy. Removal is an explicit operation (`pikku scopes prune`).
 */
export interface ScopeService {
  /**
   * Registers the declared scope set. Additive — never deletes.
   * Called once during startup with the generated scope list.
   */
  syncScopes(scopes: FlatScope[]): Promise<void>

  /**
   * Every scope a user holds: the union of their role-derived scopes and any
   * scopes granted to them directly.
   */
  resolveScopes(userId: string): Promise<string[]>

  /**
   * The scope vocabulary in the store: everything a role can be composed from.
   *
   * `declared: false` marks a scope that is still present but no longer
   * declared in code — inert (no function can require it) and awaiting
   * `pikku scopes prune`.
   */
  listScopes(): Promise<Array<FlatScope & { declared: boolean }>>

  /**
   * Registers the roles declared with `defineSystemRole`. Additive on the same
   * terms as {@link syncScopes}: a removed declaration leaves the row in place,
   * marked `declared: false`, rather than revoking everyone's grant on deploy.
   *
   * A role's scope set *is* re-synced, because that is the declaration's whole
   * content — editing `defineSystemRole` is how you change what a system role
   * means, and the deploy is when it takes effect.
   *
   * Called once during startup with the generated role list.
   */
  syncSystemRoles(roles: SystemRole[]): Promise<void>

  /**
   * Creates an admin-composed role.
   *
   * Must throw {@link SystemRoleShadowedError} when `role.name` matches a
   * declared system role. Two rows answering to one name make "does this user
   * hold `buyer`?" depend on which the store returns first.
   */
  createRole(role: Role): Promise<void>
  /** Must throw {@link SystemRoleImmutableError} for a system role. */
  deleteRole(name: string): Promise<void>
  /** Must throw {@link SystemRoleImmutableError} for a system role. */
  setRoleScopes(name: string, scopes: string[]): Promise<void>
  listRoles(): Promise<Role[]>

  addUserToRole(userId: string, role: string, grantedBy?: string): Promise<void>
  removeUserFromRole(userId: string, role: string): Promise<void>
  listUserRoles(userId: string): Promise<string[]>

  /**
   * Grants a scope directly to a user, outside of any role. Additive: the
   * resolved set is the union of role-derived and directly-granted scopes.
   */
  addScopeToUser(
    userId: string,
    scope: string,
    grantedBy?: string
  ): Promise<void>
  removeScopeFromUser(userId: string, scope: string): Promise<void>
  /** Only the scopes granted directly, not those inherited from roles. */
  listUserScopes(userId: string): Promise<string[]>

  /**
   * Scopes present in the store that are no longer declared in code, with the
   * roles that would lose them. Powers `pikku scopes audit`.
   */
  findStaleScopes(): Promise<Array<{ scope: string; roles: string[] }>>

  /** Removes undeclared scopes, cascading them out of roles. */
  pruneScopes(): Promise<string[]>

  /**
   * System roles in the store whose declaration has gone, with the number of
   * users still holding each. Powers `pikku roles audit`.
   */
  findStaleSystemRoles(): Promise<Array<{ role: string; users: number }>>

  /** Removes undeclared system roles, cascading them out of user grants. */
  pruneSystemRoles(): Promise<string[]>
}
