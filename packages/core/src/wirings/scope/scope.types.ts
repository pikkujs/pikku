/**
 * A node within a scope tree. Every node is itself a grantable scope — given
 * `admin` containing `invoices` containing `create`, all three of `admin`,
 * `admin:invoices` and `admin:invoices:create` are valid scope ids.
 */
export type CoreScopeNode = {
  /** Longer-form description, surfaced in the console when granting. */
  description?: string
  /** Nested scopes, keyed by their segment. */
  scopes?: Record<string, CoreScopeNode>
}

/**
 * A root of a scope tree. A root is just a node that may also carry a display
 * name — it is named by its key, exactly like every node beneath it.
 */
export type CoreScopeRoot = CoreScopeNode & {
  /** Short human-readable name, e.g. "Administration". */
  displayName?: string
}

/**
 * Scope trees to declare, keyed by their root segment. A key must not contain
 * `:` or be `*`.
 */
export type CoreScopes = Record<string, CoreScopeRoot>

export type ScopeNodeMeta = {
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

/** A single scope, flattened out of the declared tree. */
export type FlatScope = {
  /** Colon-delimited id, e.g. `admin:invoices:create`. */
  id: string
  description?: string
}
