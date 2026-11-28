import type { ScopeDefinitions } from '@pikku/core/scope'
import { COLLECTION_SCOPE_ROOT } from './serialize-collection-scopes.js'

/**
 * `collections` belongs to the CLI, which writes it from `db/collections.ts`. A second
 * declaration is refused even when it matches, because whoever wrote it would
 * decide what a `collections` grant covers.
 */
export const assertCollectionScopeRoot = (
  definitions: ScopeDefinitions,
  generatedFile: string
): void => {
  const other = definitions.find(
    (scope) =>
      scope.name === COLLECTION_SCOPE_ROOT && scope.sourceFile !== generatedFile
  )
  if (other) {
    throw new Error(
      `'${COLLECTION_SCOPE_ROOT}' is reserved: \`pikku all\` writes that scope tree from db/collections.ts, and ${other.sourceFile ?? 'a defineScope call'} declares it too. Rename that scope root.`
    )
  }
}
