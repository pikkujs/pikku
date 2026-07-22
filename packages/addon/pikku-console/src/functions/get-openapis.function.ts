import { pikkuFunc } from '#pikku'

export const getOpenapis = pikkuFunc<
  { limit: number; offset: number; search?: string; category?: string },
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
    // null once the last page has been handed out.
    nextCursor: number | null
  }
>({
  title: 'Get OpenAPI Specs',
  description:
    'Fetches one page of the OpenAPI catalogue from the fabric registry. Search and category are applied by the registry so they cover every entry, not just the loaded pages.',
  expose: true,
  func: async ({ addonService }, { limit, offset, search, category }) => {
    return addonService.readOpenapis({ limit, offset, search, category })
  },
})
