import { pikkuFunc } from '#pikku/function'

export const scopeRemoveUserFromRole = pikkuFunc<
  { userId: string; role: string },
  { success: boolean }
>({
  title: 'Revoke Role',
  description:
    'Revokes a role from a user. Takes effect on their next request, with no re-login — unless mapSession sets scopes itself, which is authoritative, and then this revoke never applies.',
  expose: true,
  scopes: ['admin:scopes:manage'],
  func: async ({ scopeService }, { userId, role }) => {
    await scopeService.removeUserFromRole(userId, role)
    return { success: true }
  },
})
