/**
 * Every node is itself a grantable scope: `admin` containing `invoices`
 * containing `create` yields all three of `admin`, `admin:invoices` and
 * `admin:invoices:create`.
 */
export type CoreScopeNode = {
  displayName?: string
  /** Surfaced in the console when granting. */
  description?: string
  /** Nested scopes, keyed by their segment. */
  scopes?: Record<string, CoreScopeNode>
}

/**
 * Scope trees keyed by their root segment — a root is named by its key exactly
 * like every node beneath it. A key must not contain `:` or be `*`; nothing
 * enforces that at runtime, only the build.
 */
export type CoreScopes = Record<string, CoreScopeNode>

export type ScopeNodeMeta = {
  displayName?: string
  description?: string
  scopes?: Record<string, ScopeNodeMeta>
}

export type ScopeDefinitionMeta = {
  name: string
  displayName?: string
  description?: string
  scopes?: Record<string, ScopeNodeMeta>
  sourceFile?: string
}

export type ScopeDefinitions = ScopeDefinitionMeta[]
export type ScopeDefinitionsMeta = Record<string, ScopeDefinitionMeta>

export type FlatScope = {
  /** Colon-delimited id, e.g. `admin:invoices:create`. */
  id: string
  description?: string
}
