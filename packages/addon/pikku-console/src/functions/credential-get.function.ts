import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const credentialGet = pikkuSessionlessFunc<
  { name: string; userId?: string },
  { value: unknown }
>({
  title: 'Get Credential',
  description: 'Retrieves a credential value, optionally scoped to a user.',
  expose: true,
  func: async ({ credentialService }, { name, userId }) => {
    if (!credentialService) {
      throw new MissingServiceError('CredentialService is not configured')
    }
    const value = await credentialService.get(name, userId)
    return { value }
  },
})
