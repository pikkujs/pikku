import { pikkuFunc } from '#pikku'

export const secretHas = pikkuFunc<{ secretId: string }, { exists: boolean }>({
  title: 'Has Secret',
  description: 'Checks whether a secret exists without reading its value.',
  expose: true,
  func: async ({ secretAdminService }, { secretId }) => {
    const exists = await secretAdminService.has(secretId)
    return { exists }
  },
})
