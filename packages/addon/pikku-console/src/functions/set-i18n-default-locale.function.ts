import { BadRequestError, LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const setI18nDefaultLocale = pikkuFunc<
  { app: string; locale: string },
  { ok: true }
>({
  title: 'Set Default Locale',
  description: 'Sets the locale a frontend opens in for a first-time visitor.',
  expose: true,
  scopes: ['pikku:console:i18n:write'],
  func: async ({ i18nService }, { app, locale }) => {
    if (!i18nService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      await i18nService.setDefaultLocale(app, locale)
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error)
      )
    }
    return { ok: true as const }
  },
})
