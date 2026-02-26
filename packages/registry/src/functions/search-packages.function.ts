import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import type { PackageRegistryEntry } from '../types.js'

export const searchPackages = pikkuSessionlessFunc<
  { query: string },
  PackageRegistryEntry[]
>({
  expose: true,
  auth: false,
  func: async ({ registryService }, { query }) => {
    return await registryService.searchPackages(query)
  },
})
