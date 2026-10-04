import type { I18nApp } from '@pikku/code-edit/i18n'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const getI18n = pikkuFunc<null, { apps: I18nApp[] }>({
  title: 'Get Message Catalogs',
  description:
    "Lists every frontend's Paraglide message catalogs: its locales, each locale's messages, and the locale it opens in.",
  expose: true,
  scopes: ['pikku:console:i18n:read'],
  func: async ({ i18nService }) => {
    if (!i18nService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return { apps: await i18nService.listApps() }
  },
})
