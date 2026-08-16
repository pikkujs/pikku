import { pikkuFunc } from '#pikku/function'

export const credentialDelete = pikkuFunc<
  { name: string; userId?: string },
  { success: boolean }
>({
  title: 'Delete Credential',
  description: 'Deletes a credential, optionally scoped to a user.',
  expose: true,
  scopes: ['pikku:console:credentials:manage'],
  func: async ({ credentialService }, { name, userId }) => {
    await credentialService.delete(name, userId)
    return { success: true }
  },
})
