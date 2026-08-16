import { pikkuFunc } from '#pikku/function'

export const scopeSetRoleScopes = pikkuFunc<
  { name: string; scopes: string[] },
  { success: boolean }
>({
  title: 'Set Role Scopes',
  description:
    'Replaces the scopes a role grants. Users holding it see the change on their next request — unless mapSession sets scopes itself, which is authoritative, and then the change never reaches them.',
  expose: true,
  scopes: ['pikku:console:scopes:manage'],
  func: async ({ scopeService }, { name, scopes }) => {
    await scopeService.setRoleScopes(name, scopes)
    return { success: true }
  },
})
