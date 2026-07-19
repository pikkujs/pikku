import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const scopeRemoveScopeFromUser = pikkuFunc<
  { userId: string; scope: string },
  { success: boolean }
>({
  title: 'Revoke Scope',
  description:
    'Revokes a directly-granted scope from a user. Takes effect on their next request — no re-login.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { userId, scope }) => {
    if (!scopeService) {
      throw new MissingServiceError('ScopeService is not configured')
    }
    await scopeService.removeScopeFromUser(userId, scope)
    return { success: true }
  },
})
