import type { FlatScope } from '../wirings/scope/scope.types.js'
import type { SystemRole } from '../wirings/role/role.types.js'

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

// knowledge: decisions/security/scope-resolution-happens-at-the-session-boundary-and-sync-never-deletes.md
export interface ScopeService {
  syncScopes(scopes: FlatScope[]): Promise<void>

  /** The union of role-derived scopes and scopes granted directly. */
  resolveScopes(userId: string): Promise<string[]>

  /**
   * The whole vocabulary a role can be composed from. `declared: false` marks a
   * scope still in the store but no longer declared in code: inert, since no
   * function can require it, and awaiting `pikku scopes prune`.
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
   * The roles held by each of `userIds`, keyed by user id.
   *
   * Every id asked for comes back as a key, holding an empty array when the
   * user has no roles — so a caller can index the result directly and cannot
   * mistake "this user was not in the answer" for "this user holds nothing".
   *
   * Exists because listing a page of the user directory otherwise costs one
   * query per row. Against a database reached over the network — which is the
   * normal case for a deployed unit — that is a round trip per user, so a page
   * of fifty is fifty of them.
   */
  listRolesForUsers(userIds: string[]): Promise<Record<string, string[]>>

  /** Grants outside of any role; additive with the user's role-derived scopes. */
  addScopeToUser(
    userId: string,
    scope: string,
    grantedBy?: string
  ): Promise<void>
  removeScopeFromUser(userId: string, scope: string): Promise<void>
  /** Only the scopes granted directly, not those inherited from roles. */
  listUserScopes(userId: string): Promise<string[]>

  /** Undeclared scopes with the roles that would lose them; powers `pikku scopes audit`. */
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
