import type { GitPushResult } from '@pikku/code-edit/git'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const pushGitChanges = pikkuFunc<null, GitPushResult>({
  title: 'Push Changes',
  description:
    'Pushes the current branch using your own git credentials, setting its upstream when it has none.',
  expose: true,
  scopes: ['pikku:console:git:sync'],
  func: async ({ gitService }) => {
    if (!gitService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await gitService.push()
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
