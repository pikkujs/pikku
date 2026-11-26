import type { ScopeDefinitions } from '@pikku/core/scope'
import { CRUD_SCOPE_ROOT } from './serialize-crud-scopes.js'

/**
 * `crud` belongs to the CLI, which writes it from `db/crud.ts`. A second
 * declaration is refused even when it matches, because whoever wrote it would
 * decide what a `crud` grant covers.
 */
export const assertCrudScopeRoot = (
  definitions: ScopeDefinitions,
  generatedFile: string
): void => {
  const other = definitions.find(
    (scope) =>
      scope.name === CRUD_SCOPE_ROOT && scope.sourceFile !== generatedFile
  )
  if (other) {
    throw new Error(
      `'${CRUD_SCOPE_ROOT}' is reserved: \`pikku all\` writes that scope tree from db/crud.ts, and ${other.sourceFile ?? 'a defineScope call'} declares it too. Rename that scope root.`
    )
  }
}
