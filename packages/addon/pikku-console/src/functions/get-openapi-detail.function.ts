import { pikkuSessionlessFunc } from '#pikku'

export const getOpenapiDetail = pikkuSessionlessFunc<
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
    'Fetches a single OpenAPI spec detail from the registry by name.',
  expose: true,
  auth: false,
  func: async ({ variables }, { name }) => {
    const registryUrl =
      (await variables.get('REGISTRY_URL')) ?? 'https://pikku-registry.fly.dev'
    const response = await fetch(
      `${registryUrl}/api/openapis?limit=1&offset=0&search=${encodeURIComponent(name)}`
    )
    if (!response.ok) return null
    const data = await response.json()
    const api = data.apis?.find((a: any) => a.name === name)
    return api ?? null
  },
})
