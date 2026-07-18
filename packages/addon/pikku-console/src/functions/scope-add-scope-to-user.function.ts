import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const scopeAddScopeToUser = pikkuFunc<
  { userId: string; scope: string },
  { success: boolean }
>({
  title: 'Grant Scope',
  description:
    'Grants a scope directly to a user, outside of any role. Takes effect on their next request — no re-login.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { userId, scope }, { session }) => {
    if (!scopeService) {
      throw new MissingServiceError('ScopeService is not configured')
    }
    await scopeService.addScopeToUser(userId, scope, session?.userId)
    return { success: true }
  },
})
