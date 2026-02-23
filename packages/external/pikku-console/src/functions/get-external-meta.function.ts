import { pikkuSessionlessFunc } from '#pikku'
import type { ExternalPackageMeta } from '../services/external.service.js'

export const getExternalMeta = pikkuSessionlessFunc<
  null,
  ExternalPackageMeta[]
>({
  title: 'Get External Metadata',
  description:
    'Returns an array of ExternalPackageMeta objects for all installed external packages by reading from externalService.readExternalPackagesMeta()',
  expose: true,
  auth: false,
  func: async ({ externalService }) => {
    return await externalService.readExternalPackagesMeta()
  },
})
