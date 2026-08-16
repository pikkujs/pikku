import { pikkuFunc } from '#pikku/function'

export const credentialUsers = pikkuFunc<
  { name: string },
  { userIds: string[] }
>({
  title: 'Credential Users',
  description: 'Lists all user IDs that have a specific credential configured.',
  expose: true,
  scopes: ['pikku:console:credentials:read'],
  func: async ({ credentialService }, { name }) => {
    const userIds = await credentialService.getUsersWithCredential(name)
    return { userIds }
  },
})
