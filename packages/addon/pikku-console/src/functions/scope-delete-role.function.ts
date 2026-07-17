import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const scopeDeleteRole = pikkuFunc<
  { name: string },
  { success: boolean }
>({
  title: 'Delete Role',
  description: 'Deletes a role, revoking it from every user who holds it.',
  expose: true,
  scopes: ['pikku:scopes:manage'],
  func: async ({ scopeService }, { name }) => {
    if (!scopeService) {
      throw new MissingServiceError('ScopeService is not configured')
    }
    await scopeService.deleteRole(name)
    return { success: true }
  },
})
