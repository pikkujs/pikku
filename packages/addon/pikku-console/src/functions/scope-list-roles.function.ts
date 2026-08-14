import { pikkuFunc } from '#pikku'
import type { Role } from '@pikku/core/ecosystem/services'

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
