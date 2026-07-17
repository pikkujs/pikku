import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const scopeSetRoleScopes = pikkuFunc<
  { name: string; scopes: string[] },
  { success: boolean }
>({
  title: 'Set Role Scopes',
  description:
    'Replaces the scopes a role grants. Users holding it see the change on their next request.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { name, scopes }) => {
    if (!scopeService) {
      throw new MissingServiceError('ScopeService is not configured')
    }
    await scopeService.setRoleScopes(name, scopes)
    return { success: true }
  },
})
