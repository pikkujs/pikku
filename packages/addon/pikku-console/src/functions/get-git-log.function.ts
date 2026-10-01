import type { GitCommit } from '@pikku/code-edit/git'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const getGitLog = pikkuFunc<
  { limit?: number; path?: string; ref?: string },
  { commits: GitCommit[] }
>({
  title: 'Get Git Log',
  description:
    'Lists the newest commits, optionally only those touching one path.',
  expose: true,
  scopes: ['pikku:console:git:read'],
  func: async ({ gitService }, input) => {
    if (!gitService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return { commits: await gitService.log(input) }
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
