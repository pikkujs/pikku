import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import type { PackageRegistryEntry } from '../types.js'

export const getPackage = pikkuSessionlessFunc<
  { id: string },
  PackageRegistryEntry | null
>({
  auth: false,
  func: async ({ registryService }, { id }) => {
    return await registryService.getPackage(id)
  },
})
