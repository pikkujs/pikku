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
/**
 * Whether a scope row's checkbox is locked. An undeclared (stale) scope can't be
 * newly granted — the FK into pikku_scopes rejects it — but one that is already
 * held must stay removable, otherwise a stale grant could never be revoked from
 * the UI and would strand access.
 */
export const isScopeRowDisabled = (
  row: Pick<DeclaredScope, 'declared'>,
  held: boolean,
  treeDisabled: boolean
): boolean => treeDisabled || (!row.declared && !held)

const isAncestorOf = (ancestor: string, id: string): boolean =>
  id.startsWith(`${ancestor}:`)

/**
 * Whether a row is selected — either granted directly or covered by an ancestor
 * that is granted. Holding a parent scope grants everything nested beneath it
 * (see `verifyScopes`), so a child under a selected parent reads as selected.
 */
export const isScopeSelected = (selected: string[], id: string): boolean =>
  selected.some((s) => s === id || isAncestorOf(s, id))

/**
 * Whether a row is covered by a *strict* ancestor grant, so its checkbox is
 * locked — you manage it through the parent that grants it, not on its own.
 */
export const isScopeLockedByAncestor = (
  selected: string[],
  id: string
): boolean => selected.some((s) => s !== id && isAncestorOf(s, id))

/**
 * Toggles a row, returning the next selection. Granting a scope drops any
 * descendant it now subsumes (they become redundant); ungranting removes just
 * it. A row covered by an ancestor is returned unchanged — it can only be
 * toggled through that ancestor.
 */
export const toggleScope = (selected: string[], id: string): string[] => {
  if (isScopeLockedByAncestor(selected, id)) return selected
  if (selected.includes(id)) return selected.filter((s) => s !== id)
  return [...selected.filter((s) => !isAncestorOf(id, s)), id]
}

/** The scopes to grant and revoke to move a selection from `prev` to `next`. */
export const diffScopeSelection = (
  prev: string[],
  next: string[]
): { added: string[]; removed: string[] } => {
  const prevSet = new Set(prev)
  const nextSet = new Set(next)
  return {
    added: next.filter((s) => !prevSet.has(s)),
    removed: prev.filter((s) => !nextSet.has(s)),
  }
}

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
