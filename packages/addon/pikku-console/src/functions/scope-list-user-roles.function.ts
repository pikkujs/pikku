import { pikkuFunc } from '#pikku'

export const scopeListUserRoles = pikkuFunc<
  { userId: string },
  { roles: string[]; scopes: string[]; directScopes: string[] }
>({
  title: 'List User Roles',
  description:
    'Lists the roles a user holds, the scopes granted to them directly, and the full set those resolve to.',
  expose: true,
  scopes: ['pikku:scopes:read'],
  func: async ({ scopeService }, { userId }) => {
    if (!scopeService) {
      return { roles: [], scopes: [], directScopes: [] }
    }

    const [roles, scopes, directScopes] = await Promise.all([
      scopeService.listUserRoles(userId),
      scopeService.resolveScopes(userId),
      scopeService.listUserScopes(userId),
    ])

    return {
      roles: roles.sort(),
      scopes: scopes.sort(),
      directScopes: directScopes.sort(),
    }
  },
})
