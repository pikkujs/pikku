import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

export const getPackageIcon = pikkuSessionlessFunc<
  { id: string },
  string | null
>({
  expose: true,
  auth: false,
  func: async ({ registryService }, { id }) => {
    return await registryService.getPackageIcon(id)
  },
})
