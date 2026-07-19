import { pikkuFunc } from '#pikku'

export const getOpenapis = pikkuFunc<
  { limit: number; offset: number; search?: string },
  {
    apis: Array<{
      name: string
      version: string
      provider: string
      service: string | null
      title: string
      description: string
      openapiVer: string
      swaggerUrl: string
      logo?: string
    }>
    total: number
    nextCursor: number | null
  }
>({
  title: 'Get OpenAPI Specs',
  description: 'Fetches available OpenAPI specs from the fabric registry.',
  expose: true,
  func: async ({ addonService }, { limit, offset, search }) => {
    return addonService.readOpenapis({ limit, offset, search })
  },
})
