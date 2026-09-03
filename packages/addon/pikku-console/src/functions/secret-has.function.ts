import { pikkuFunc } from '#pikku/addon/function'

export const secretHas = pikkuFunc<{ secretId: string }, { exists: boolean }>({
  title: 'Has Secret',
  description: 'Checks whether a secret exists without reading its value.',
  expose: true,
  scopes: ['pikku:console:secrets:read'],
  func: async ({ secretAdminService }, { secretId }) => {
    const exists = await secretAdminService.has(secretId)
    return { exists }
  },
})
