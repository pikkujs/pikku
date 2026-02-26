import { pikkuSessionlessFunc } from '#pikku'
import type { ExternalPackageDetail } from '../services/external.service.js'

export const getExternalPackage = pikkuSessionlessFunc<
  { id: string },
  ExternalPackageDetail | null
>({
  title: 'Get External Package',
  description:
    'Returns the full details of a single external package by ID, including readme and repository information',
  expose: true,
  auth: false,
  func: async ({ externalService }, { id }) => {
    return await externalService.readExternalPackage(id)
  },
})
