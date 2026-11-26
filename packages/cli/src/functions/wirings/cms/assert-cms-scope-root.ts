import type { ScopeDefinitions } from '@pikku/core/scope'
import { CMS_SCOPE_ROOT } from './serialize-cms-scopes.js'

/**
 * `cms` belongs to the CLI, which writes it from `db/cms.ts`. A second
 * declaration is refused even when it matches, because whoever wrote it would
 * decide what a `cms` grant covers.
 */
export const assertCmsScopeRoot = (
  definitions: ScopeDefinitions,
  generatedFile: string
): void => {
  const other = definitions.find(
    (scope) =>
      scope.name === CMS_SCOPE_ROOT && scope.sourceFile !== generatedFile
  )
  if (other) {
    throw new Error(
      `'${CMS_SCOPE_ROOT}' is reserved: \`pikku all\` writes that scope tree from db/cms.ts, and ${other.sourceFile ?? 'a defineScope call'} declares it too. Rename that scope root.`
    )
  }
}
