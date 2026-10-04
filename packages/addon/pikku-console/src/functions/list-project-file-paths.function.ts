import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const listProjectFilePaths = pikkuFunc<
  {},
  { paths: string[]; truncated: boolean }
>({
  title: 'List Project File Paths',
  description:
    'Every file path in the project workspace, for picking a file by name; git-ignored files are left out.',
  expose: true,
  scopes: ['pikku:console:files:read'],
  func: async ({ workspaceFilesService }) => {
    if (!workspaceFilesService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await workspaceFilesService.paths()
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
