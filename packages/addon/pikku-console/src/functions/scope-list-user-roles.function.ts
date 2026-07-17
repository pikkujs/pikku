import { pikkuFunc } from '#pikku'

export const scopeListUserRoles = pikkuFunc<
  { userId: string },
  { roles: string[]; scopes: string[] }
>({
  title: 'List User Roles',
  description:
    'Lists the roles a user holds and the scopes those roles resolve to.',
  expose: true,
  scopes: ['pikku:scopes:read'],
  func: async ({ scopeService }, { userId }) => {
    if (!scopeService) {
      return { roles: [], scopes: [] }
    }

    const [roles, scopes] = await Promise.all([
      scopeService.listUserRoles(userId),
      scopeService.resolveScopes(userId),
    ])

    return { roles: roles.sort(), scopes: scopes.sort() }
  },
})
