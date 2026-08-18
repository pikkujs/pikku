import { pikkuFunc } from '#pikku/addon/function'

export const getOpenapiCategories = pikkuFunc<null, Record<string, number>>({
  title: 'Get OpenAPI Categories',
  description:
    'Category counts across the whole OpenAPI catalogue, for the gallery category rail. Counted by the registry rather than derived from the loaded rows, which would only ever describe the pages already scrolled past.',
  expose: true,
  scopes: ['pikku:console:addons:read'],
  func: async ({ addonService }) => {
    return addonService.readOpenapiCategories()
  },
})
