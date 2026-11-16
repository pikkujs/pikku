import { pikkuFunc } from '#pikku/addon/function'

export const secretSet = pikkuFunc<
  { secretId: string; value: unknown },
  { success: boolean }
>({
  title: 'Set Secret',
  description: 'Sets the value of a secret.',
  tags: ['admin:secrets'],
  expose: true,
  scopes: ['admin:secrets:write'],
  func: async ({ secretAdminService }, { secretId, value }) => {
    await secretAdminService.write(secretId, value)
    return { success: true }
  },
})
