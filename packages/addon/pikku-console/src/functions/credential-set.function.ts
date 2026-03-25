import { pikkuSessionlessFunc } from '#pikku'

export const credentialSet = pikkuSessionlessFunc<
  { name: string; value: unknown; userId?: string },
  { success: boolean }
>({
  title: 'Set Credential',
  description: 'Stores a credential value, optionally scoped to a user.',
  expose: true,
  func: async ({ credentialService }, { name, value, userId }) => {
    if (!credentialService) {
      throw new Error('CredentialService is not configured')
    }
    await credentialService.set(name, value, userId)
    return { success: true }
  },
})
