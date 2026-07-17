import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const scopeRemoveUserFromRole = pikkuFunc<
  { userId: string; role: string },
  { success: boolean }
>({
  title: 'Revoke Role',
  description:
    'Revokes a role from a user. Takes effect on their next request — no re-login.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { userId, role }) => {
    if (!scopeService) {
      throw new MissingServiceError('ScopeService is not configured')
    }
    await scopeService.removeUserFromRole(userId, role)
    return { success: true }
  },
})
