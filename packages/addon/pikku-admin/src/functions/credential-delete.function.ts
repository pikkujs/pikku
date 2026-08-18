import { pikkuFunc } from '#pikku/addon/function'

export const credentialDelete = pikkuFunc<
  { name: string; userId?: string },
  { success: boolean }
>({
  title: 'Delete Credential',
  description: 'Deletes a credential, optionally scoped to a user.',
  expose: true,
  scopes: ['admin:credentials:manage'],
  func: async ({ credentialService }, { name, userId }) => {
    await credentialService.delete(name, userId)
    return { success: true }
  },
})
