import type { TypeDiagnostic } from '@pikku/code-edit/typescript'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const getFileDiagnostics = pikkuFunc<
  { path: string; content?: string },
  { diagnostics: TypeDiagnostic[] }
>({
  title: 'Get File Diagnostics',
  description:
    "Type-checks one project file with its own tsconfig, as tsc would; content, when given, stands in for the file's unsaved text.",
  expose: true,
  scopes: ['pikku:console:files:read'],
  func: async ({ typeScriptService }, { path, content }) => {
    if (!typeScriptService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return { diagnostics: typeScriptService.diagnostics(path, content) }
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
