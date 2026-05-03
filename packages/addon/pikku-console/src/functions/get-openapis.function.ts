import { pikkuSessionlessFunc } from '#pikku'

export const getOpenapis = pikkuSessionlessFunc<
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
    nextCursor: number
  }
>({
  title: 'Get OpenAPI Specs',
  description: 'Fetches available OpenAPI specs from the registry.',
  expose: true,
  auth: false,
  func: async ({ variables }, { limit, offset, search }) => {
    const registryUrl =
      (await variables.get('REGISTRY_URL')) ?? 'https://pikku-registry.fly.dev'
    let url = `${registryUrl}/api/openapis?limit=${limit}&offset=${offset}`
    if (search) {
      url += `&search=${encodeURIComponent(search)}`
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    return response.json()
  },
})
