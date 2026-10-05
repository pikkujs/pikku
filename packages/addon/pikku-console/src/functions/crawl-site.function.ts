import type { CrawlResult } from '@pikku/code-edit/brand'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { rethrowBrandError } from '../lib/brand-error.js'

export const crawlSite = pikkuFunc<{ url: string; maxPages?: number; app?: string }, CrawlResult>({
  title: 'Crawl Site',
  description:
    "Crawls a site on the project's own Cloudflare account (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) and returns each page as markdown, its images saved into a frontend's public/crawled/.",
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ brandService }, input) => {
    if (!brandService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return brandService.crawl(input).catch(rethrowBrandError)
  },
})
