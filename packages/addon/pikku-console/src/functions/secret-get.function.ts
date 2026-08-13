import { pikkuFunc } from '#pikku'

export const secretGet = pikkuFunc<
  { secretId: string },
  { exists: boolean; value: unknown }
>({
  title: 'Get Secret',
  description: 'Gets the current value of a secret.',
  expose: true,
  func: async ({ secretAdminService }, { secretId }) => {
    return secretAdminService.read(secretId)
  },
})
