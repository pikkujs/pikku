import type { FaviconResult } from '@pikku/code-edit/brand'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { rethrowBrandError } from '../lib/brand-error.js'

export const generateFavicon = pikkuFunc<
  { app?: string; source?: string; emoji?: string; letter?: string; background?: string },
  FaviconResult & { app: string }
>({
  title: 'Generate Favicon',
  description:
    "Renders the favicon, apple-touch and PWA icons into a frontend's public/ from a logo image or an emoji or letter on a colour, and links them from the document head. Needs playwright's chromium.",
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ brandService }, input) => {
    if (!brandService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return brandService.favicon(input).catch(rethrowBrandError)
  },
})
