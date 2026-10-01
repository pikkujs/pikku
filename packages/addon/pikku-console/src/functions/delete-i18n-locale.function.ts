import { BadRequestError, LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const deleteI18nLocale = pikkuFunc<
  { app: string; locale: string },
  { ok: true }
>({
  title: 'Delete Locale',
  description:
    "Removes a locale's messages from a frontend; the base locale cannot be removed.",
  expose: true,
  scopes: ['pikku:console:i18n:write'],
  func: async ({ i18nService }, { app, locale }) => {
    if (!i18nService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    try {
      await i18nService.deleteLocale(app, locale)
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error)
      )
    }
    return { ok: true as const }
  },
})
