import { pikkuFunc } from '#pikku/addon/function'

export const scopeDeleteRole = pikkuFunc<
  { name: string },
  { success: boolean }
>({
  title: 'Delete Role',
  description: 'Deletes a role, revoking it from every user who holds it.',
  tags: ['admin:scopes'],
  expose: true,
  scopes: ['admin:scopes:manage'],
  func: async ({ scopeService }, { name }) => {
    await scopeService.deleteRole(name)
    return { success: true }
  },
})
