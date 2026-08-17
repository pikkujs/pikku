import { pikkuFunc } from '#pikku/function'

export const scopeAddUserToRole = pikkuFunc<
  { userId: string; role: string },
  { success: boolean }
>({
  title: 'Grant Role',
  description:
    'Grants a role to a user. Takes effect on their next request, with no re-login — unless mapSession sets scopes itself, which is authoritative, and then this grant never applies.',
  expose: true,
  scopes: ['admin:scopes:manage'],
  func: async ({ scopeService }, { userId, role }, { session }) => {
    await scopeService.addUserToRole(userId, role, session?.userId)
    return { success: true }
  },
})
