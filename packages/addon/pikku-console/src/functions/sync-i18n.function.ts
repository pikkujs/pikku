import type { I18nSyncReport } from '@pikku/code-edit/i18n'
import { BadRequestError, LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const syncI18n = pikkuFunc<
  { app?: string; catalog?: string },
  { report: I18nSyncReport[] }
>({
  title: 'Sync Locales',
  description:
    'Adds every base-locale key a locale is missing, marked for translation, and reports keys only that locale has.',
  expose: true,
  scopes: ['pikku:console:i18n:write'],
  func: async ({ i18nService }, { app, catalog }) => {
    if (!i18nService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      return { report: await i18nService.sync(app, catalog) }
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})
