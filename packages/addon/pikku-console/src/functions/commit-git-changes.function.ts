import type { GitCommitResult } from '@pikku/code-edit/git'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const commitGitChanges = pikkuFunc<
  { message: string; paths: string[] },
  GitCommitResult
>({
  title: 'Commit Changes',
  description:
    'Commits exactly the named paths with your git identity, leaving anything else staged or changed alone.',
  expose: true,
  scopes: ['pikku:console:git:write'],
  func: async ({ gitService }, input) => {
    if (!gitService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await gitService.commit(input)
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
