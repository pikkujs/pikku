import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const scopeAddUserToRole = pikkuFunc<
  { userId: string; role: string },
  { success: boolean }
>({
  title: 'Grant Role',
  description:
    'Grants a role to a user. Takes effect on their next request — no re-login.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { userId, role }, { session }) => {
    if (!scopeService) {
      throw new MissingServiceError('ScopeService is not configured')
    }
    await scopeService.addUserToRole(userId, role, session?.userId)
    return { success: true }
  },
})
