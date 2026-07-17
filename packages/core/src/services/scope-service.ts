import type { FlatScope } from '../wirings/scope/scope.types.js'

/** A role: a named, admin-composed bag of scopes. */
export interface Role {
  name: string
  description?: string
  scopes: string[]
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

  /** Every scope a user holds, unioned across their roles. */
  resolveScopes(userId: string): Promise<string[]>

  /**
   * The scope vocabulary in the store: everything a role can be composed from.
   *
   * `declared: false` marks a scope that is still present but no longer
   * declared in code — inert (no function can require it) and awaiting
   * `pikku scopes prune`.
   */
  listScopes(): Promise<Array<FlatScope & { declared: boolean }>>

  createRole(role: Role): Promise<void>
  deleteRole(name: string): Promise<void>
  setRoleScopes(name: string, scopes: string[]): Promise<void>
  listRoles(): Promise<Role[]>

  addUserToRole(userId: string, role: string, grantedBy?: string): Promise<void>
  removeUserFromRole(userId: string, role: string): Promise<void>
  listUserRoles(userId: string): Promise<string[]>

  /**
   * Scopes present in the store that are no longer declared in code, with the
   * roles that would lose them. Powers `pikku scopes audit`.
   */
  findStaleScopes(): Promise<Array<{ scope: string; roles: string[] }>>

  /** Removes undeclared scopes, cascading them out of roles. */
  pruneScopes(): Promise<string[]>
}
