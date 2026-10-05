import type { DesignProfile } from '@pikku/code-edit/brand'
import type { ThemeInput } from '@pikku/code-edit/theme'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import { rethrowBrandError } from '../lib/brand-error.js'

export const extractDesign = pikkuFunc<
  { url?: string; file?: string; preset?: string },
  { profile: DesignProfile; theme: ThemeInput }
>({
  title: 'Extract Design',
  description:
    'Reads colours, fonts and structure off a live site or a W3C design-tokens file, and returns the theme input they imply — pass it to applyTheme to adopt it.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ brandService }, input) => {
    if (!brandService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return brandService.extract(input).catch(rethrowBrandError)
  },
})
