import { pikkuFunc } from '#pikku/function'

export const credentialSet = pikkuFunc<
  { name: string; value: unknown; userId?: string },
  { success: boolean }
>({
  title: 'Set Credential',
  description: 'Stores a credential value, optionally scoped to a user.',
  expose: true,
  scopes: ['pikku:console:credentials:manage'],
  func: async ({ credentialService }, { name, value, userId }) => {
    await credentialService.set(name, value, userId)
    return { success: true }
  },
})
