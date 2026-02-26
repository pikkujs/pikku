import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import type { PackageRegistryEntry } from '../types.js'

export const ingestLocalPackage = pikkuSessionlessFunc<
  { packageDir: string },
  PackageRegistryEntry
>({
  expose: true,
  auth: false,
  func: async ({ registryService }, { packageDir }) => {
    return await registryService.ingestLocal(packageDir)
  },
})
