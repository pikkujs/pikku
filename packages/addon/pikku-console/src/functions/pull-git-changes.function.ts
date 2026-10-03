import type { GitPullResult } from '@pikku/code-edit/git'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const pullGitChanges = pikkuFunc<null, GitPullResult>({
  title: 'Pull Changes',
  description:
    'Fetches and fast-forwards the current branch to its upstream; it never merges or overwrites local edits.',
  expose: true,
  scopes: ['pikku:console:git:sync'],
  func: async ({ gitService }) => {
    if (!gitService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await gitService.pull()
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
