import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const credentialUsers = pikkuSessionlessFunc<
  { name: string },
  { userIds: string[] }
>({
  title: 'Credential Users',
  description: 'Lists all user IDs that have a specific credential configured.',
  expose: true,
  func: async ({ credentialService }, { name }) => {
    if (!credentialService) {
      throw new MissingServiceError('CredentialService is not configured')
    }
    const userIds = await credentialService.getUsersWithCredential(name)
    return { userIds }
  },
})
