import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const writeProjectFile = pikkuFunc<
  { path: string; content: string },
  { path: string; size: number }
>({
  title: 'Write Project File',
  description:
    'Saves text to one file in the project workspace, creating it if needed; secrets and ignored folders are refused.',
  expose: true,
  scopes: ['pikku:console:files:write'],
  func: async ({ workspaceFilesService }, { path, content }) => {
    if (!workspaceFilesService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await workspaceFilesService.write(path, content)
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
