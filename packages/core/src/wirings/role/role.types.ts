/**
 * A system role: a named set of scopes that ships with the product.
 *
 * System roles are declared in code, which is what separates them from the
 * roles an admin composes in the console. The distinction is the one AWS draws
 * between managed and customer-managed policies — a system role is part of the
 * application's surface, so the console may show and grant it but must not
 * rename, re-scope or delete it.
 */
export type CoreSystemRole = {
  /** Short human-readable name, e.g. "Buyer". */
  displayName?: string
  /** Longer-form description, surfaced in the console when granting. */
  description?: string
  /**
   * The scopes this role grants. Every id must be declared with
   * `defineScope` — the inspector fails the build otherwise, so a role cannot
   * quietly grant a scope that no function checks.
   */
  scopes: string[]
}

/**
 * System roles to declare, keyed by name. A key must be non-empty and must not
 * contain `:` — that separator belongs to scopes, and a role that looks like a
 * scope id is a role nobody reads correctly.
 */
export type CoreSystemRoles = Record<string, CoreSystemRole>

export type SystemRoleDefinitionMeta = {
  name: string
  displayName?: string
  description?: string
  scopes: string[]
  sourceFile?: string
}

export type SystemRoleDefinitions = SystemRoleDefinitionMeta[]
export type SystemRoleDefinitionsMeta = Record<string, SystemRoleDefinitionMeta>

/** A declared system role, ready to sync into a scope store. */
export type SystemRole = {
  name: string
  displayName?: string
  description?: string
  scopes: string[]
}
