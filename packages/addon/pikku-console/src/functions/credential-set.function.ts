import { pikkuFunc } from '#pikku'

export const credentialSet = pikkuFunc<
  { name: string; value: unknown; userId?: string },
  { success: boolean }
>({
  title: 'Set Credential',
  description: 'Stores a credential value, optionally scoped to a user.',
  expose: true,
  func: async ({ credentialService }, { name, value, userId }) => {
    await credentialService.set(name, value, userId)
    return { success: true }
  },
})
