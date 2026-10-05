import type { WorkspaceFile } from '@pikku/code-edit/files'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const readProjectFile = pikkuFunc<{ path: string }, WorkspaceFile>({
  title: 'Read Project File',
  description:
    'Reads one file from the project workspace as text; large files are cut short and binary files come back empty.',
  expose: true,
  scopes: ['pikku:console:files:read'],
  func: async ({ workspaceFilesService }, { path }) => {
    if (!workspaceFilesService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await workspaceFilesService.read(path)
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
