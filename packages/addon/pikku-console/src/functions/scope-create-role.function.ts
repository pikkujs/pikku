import { pikkuFunc } from '#pikku'

export const scopeCreateRole = pikkuFunc<
  { name: string; description?: string; scopes: string[] },
  { success: boolean }
>({
  title: 'Create Role',
  description: 'Creates a role granting the given scopes.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { name, description, scopes }) => {
    // An undeclared scope is rejected by the pikku_scopes foreign key, so the
    // database is the one enforcing the vocabulary — not this function.
    await scopeService.createRole({ name, description, scopes })
    return { success: true }
  },
})
