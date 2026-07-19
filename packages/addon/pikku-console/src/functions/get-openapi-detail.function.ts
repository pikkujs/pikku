import { pikkuFunc } from '#pikku'

export const getOpenapiDetail = pikkuFunc<
  { name: string },
  {
    name: string
    version: string
    provider: string
    service: string | null
    title: string
    description: string
    openapiVer: string
    swaggerUrl: string
    swaggerYamlUrl?: string
    logo?: string
    categories: string[]
    tags: string[]
    added?: string
    updated?: string
  } | null
>({
  title: 'Get OpenAPI Detail',
  description:
    'Fetches a single OpenAPI spec detail from the fabric registry by name.',
  expose: true,
  func: async ({ addonService }, { name }) => {
    return addonService.readOpenapiDetail(name)
  },
})
