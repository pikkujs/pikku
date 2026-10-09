import type { I18nAddResult, I18nCatalog } from '@pikku/code-edit/i18n'
import { BadRequestError, LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const addI18nLocale = pikkuFunc<
  { app: string; locale: string; translations?: I18nCatalog; catalog?: string },
  I18nAddResult
>({
  title: 'Add Locale',
  description:
    'Adds a locale to a frontend with every base-locale key: given translations where supplied, the base copy marked %i18n-missing% elsewhere.',
  expose: true,
  scopes: ['pikku:console:i18n:write'],
  func: async ({ i18nService }, { app, locale, translations, catalog }) => {
    if (!i18nService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return await i18nService.addLocale(app, locale, translations, catalog)
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})
