import type { GitStatus } from '@pikku/code-edit/git'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const getGitStatus = pikkuFunc<null, GitStatus>({
  title: 'Get Git Status',
  description:
    'Shows the current branch, how far it is ahead of or behind its upstream, and every changed file in the workspace.',
  expose: true,
  scopes: ['pikku:console:git:read'],
  func: async ({ gitService }) => {
    if (!gitService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await gitService.status()
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
