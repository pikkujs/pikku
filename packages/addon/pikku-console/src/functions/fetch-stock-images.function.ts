import type { StockImagesResult } from '@pikku/code-edit/brand'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { rethrowBrandError } from '../lib/brand-error.js'

export const fetchStockImages = pikkuFunc<
  { query: string; count?: number; orientation?: 'landscape' | 'portrait' | 'squarish'; app?: string },
  StockImagesResult
>({
  title: 'Fetch Stock Images',
  description:
    "Searches Unsplash with the project's own UNSPLASH_ACCESS_KEY and downloads the photos into a frontend's public/stock/, with the photographer credit Unsplash requires.",
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ brandService }, input) => {
    if (!brandService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return brandService.stockImages(input).catch(rethrowBrandError)
  },
})
