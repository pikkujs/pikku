import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import type { PackageRegistryEntry } from '../types.js'

export const ingestPackage = pikkuSessionlessFunc<
  { packageName: string; version?: string },
  PackageRegistryEntry
>({
  expose: true,
  auth: false,
  func: async ({ registryService }, { packageName, version }) => {
    return await registryService.ingest(packageName, version)
  },
})
