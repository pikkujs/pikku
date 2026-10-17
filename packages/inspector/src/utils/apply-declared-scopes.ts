import type { ScopeNodeMeta } from '@pikku/core/scope'
import type { InspectorState } from '../types.js'

/**
 * Folds `declareScopes` ids into `state.scopes.definitions`. An id the
 * definitions already hold (an addon's tree, a `defineScope`) is left alone;
 * a missing one is added as a bare node under its root, creating the root when
 * nothing declared it.
 */
export const applyDeclaredScopes = (
  state: Pick<InspectorState, 'scopes'>
): void => {
  for (const [id, sourceFile] of state.scopes.declared ?? []) {
    const [rootName, ...rest] = id.split(':')
    let root = state.scopes.definitions.find((d) => d.name === rootName)
    if (!root) {
      root = { name: rootName!, sourceFile }
      state.scopes.definitions.push(root)
    }
    let level: { scopes?: Record<string, ScopeNodeMeta> } = root
    for (const segment of rest) {
      level.scopes ??= {}
      level = level.scopes[segment] ??= {}
    }
  }
}
