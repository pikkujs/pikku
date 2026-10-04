import type { I18nCatalog } from '@pikku/code-edit/i18n'
import { BadRequestError, LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const writeI18nLocale = pikkuFunc<
  { app: string; locale: string; content: I18nCatalog },
  { path: string }
>({
  title: 'Write Locale',
  description:
    "Replaces one locale's messages for a frontend, registering the locale if it is new.",
  expose: true,
  scopes: ['pikku:console:i18n:write'],
  func: async ({ i18nService }, { app, locale, content }) => {
    if (!i18nService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return { path: await i18nService.writeLocale(app, locale, content) }
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})
