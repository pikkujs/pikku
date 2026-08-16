import { pikkuFunc } from '#pikku/function'
import type { Role } from '@pikku/core/ecosystem/role'

export const scopeListRoles = pikkuFunc<null, { roles: Role[] }>({
  title: 'List Roles',
  description: 'Lists every role and the scopes it grants.',
  expose: true,
  scopes: ['pikku:console:scopes:read'],
  func: async ({ scopeService }) => {
    if (!scopeService) {
      return { roles: [] }
    }
    return { roles: await scopeService.listRoles() }
  },
})
