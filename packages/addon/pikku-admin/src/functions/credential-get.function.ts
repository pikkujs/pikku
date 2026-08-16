import { pikkuFunc } from '#pikku/function'

export const credentialGet = pikkuFunc<
  { name: string; userId?: string },
  { value: unknown }
>({
  title: 'Get Credential',
  description: 'Retrieves a credential value, optionally scoped to a user.',
  expose: true,
  scopes: ['admin:credentials:read'],
  func: async ({ credentialService }, { name, userId }) => {
    const value = await credentialService.get(name, userId)
    return { value }
  },
})
