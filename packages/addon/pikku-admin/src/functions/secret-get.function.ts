import { pikkuFunc } from '#pikku/addon/function'

export const secretGet = pikkuFunc<
  { secretId: string },
  { exists: boolean; value: unknown }
>({
  title: 'Get Secret',
  description: 'Gets the current value of a secret.',
  expose: true,
  scopes: ['admin:secrets:read'],
  func: async ({ secretAdminService }, { secretId }) => {
    return secretAdminService.read(secretId)
  },
})
