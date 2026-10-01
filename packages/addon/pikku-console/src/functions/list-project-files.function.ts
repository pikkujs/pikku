import type { WorkspaceEntry } from '@pikku/code-edit/files'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const listProjectFiles = pikkuFunc<
  { path?: string },
  { entries: WorkspaceEntry[] }
>({
  title: 'List Project Files',
  description:
    'Lists one directory of the project workspace, directories first; a directory that does not exist yet is empty.',
  expose: true,
  scopes: ['pikku:console:files:read'],
  func: async ({ workspaceFilesService }, { path }) => {
    if (!workspaceFilesService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return { entries: await workspaceFilesService.list(path ?? '') }
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
