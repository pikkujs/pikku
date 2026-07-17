export type DeclaredScope = {
  id: string
  description?: string
  declared: boolean
}

export type ScopeTreeRow = DeclaredScope & {
  /** Nesting depth, i.e. the number of `:` separators in the id. */
  depth: number
  /** The last colon-delimited segment — what a row shows as its label. */
  segment: string
  /** True when another declared scope nests beneath this one. */
  hasChildren: boolean
}

/**
 * Turns the flat declared-scope list into rows carrying the depth, leaf segment
 * and has-children flag the tree view renders from. Input order is preserved
 * (the backend already sorts by id, so parents precede their descendants).
 */
export const toScopeTreeRows = (scopes: DeclaredScope[]): ScopeTreeRow[] =>
  scopes.map((scope) => {
    const segments = scope.id.split(':')
    const prefix = `${scope.id}:`
    return {
      ...scope,
      depth: segments.length - 1,
      segment: segments[segments.length - 1]!,
      hasChildren: scopes.some((other) => other.id.startsWith(prefix)),
    }
  })
