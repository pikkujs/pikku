import { pikkuFunc } from '#pikku'

export const scopeRemoveScopeFromUser = pikkuFunc<
  { userId: string; scope: string },
  { success: boolean }
>({
  title: 'Revoke Scope',
  description:
    'Revokes a directly-granted scope from a user. Takes effect on their next request, with no re-login — unless mapSession sets scopes itself, which is authoritative, and then this revoke never applies.',
  expose: true,
  scopes: ['pikku:console:scopes:manage'],
  func: async ({ scopeService }, { userId, scope }) => {
    await scopeService.removeScopeFromUser(userId, scope)
    return { success: true }
  },
})
