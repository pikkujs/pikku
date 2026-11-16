import { pikkuFunc } from '#pikku/addon/function'

export const credentialGet = pikkuFunc<
  { name: string; userId?: string },
  { value: unknown }
>({
  title: 'Get Credential',
  description: 'Retrieves a credential value, optionally scoped to a user.',
  tags: ['admin:credentials'],
  expose: true,
  scopes: ['admin:credentials:read'],
  func: async ({ credentialService }, { name, userId }) => {
    const value = await credentialService.get(name, userId)
    return { value }
  },
})
