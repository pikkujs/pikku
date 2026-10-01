import type { GitDiff } from '@pikku/code-edit/git'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { toWorkspaceError } from '../lib/workspace-error.js'

export const getGitDiff = pikkuFunc<
  { path?: string; staged?: boolean; ref?: string },
  GitDiff
>({
  title: 'Get Git Diff',
  description:
    'A unified diff of the working tree, the staged changes or a ref, for the whole workspace or one path.',
  expose: true,
  scopes: ['pikku:console:git:read'],
  func: async ({ gitService }, input) => {
    if (!gitService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await gitService.diff(input)
    } catch (error) {
      throw toWorkspaceError(error)
    }
  },
})
