import type { PlaceholderBrand } from '@pikku/code-edit/brand'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const getPlaceholderBrands = pikkuFunc<null, { productName: string | null; placeholders: PlaceholderBrand[] }>({
  title: 'Get Placeholder Brands',
  description:
    "Lists every place an app still uses a starter template's name — the wordmark, the tab title, the emails' sender — and the product name the other apps already carry.",
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ brandService }) => {
    if (!brandService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return brandService.placeholders()
  },
})
