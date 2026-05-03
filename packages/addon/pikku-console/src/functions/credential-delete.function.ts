import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const credentialDelete = pikkuSessionlessFunc<
  { name: string; userId?: string },
  { success: boolean }
>({
  title: 'Delete Credential',
  description: 'Deletes a credential, optionally scoped to a user.',
  expose: true,
  func: async ({ credentialService }, { name, userId }) => {
    if (!credentialService) {
      throw new MissingServiceError('CredentialService is not configured')
    }
    await credentialService.delete(name, userId)
    return { success: true }
  },
})
