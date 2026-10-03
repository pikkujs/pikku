import type { z } from 'zod'
import { I18nService, MISSING_MARKER } from '@pikku/code-edit/i18n'
import { pikkuSessionlessFunc } from '#pikku/function'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'
import { added, changed, dim } from '../../fabric/lib/output.js'
import {
  I18nAddInput,
  I18nAddOutput,
  I18nDefaultInput,
  I18nDefaultOutput,
  I18nListInput,
  I18nListOutput,
  I18nSyncInput,
  I18nSyncOutput,
} from './i18n.schemas.js'

const service = (rootDir: string) => new I18nService(findWorkspaceRoot(rootDir))

const resolveApp = async (i18n: I18nService, app?: string): Promise<string> => {
  if (app) return app
  const apps = await i18n.listApps()
  if (apps.length === 1) return apps[0]!.app
  throw new Error(
    apps.length
      ? `Several frontends have message catalogs (${apps.map((a) => a.app).join(', ')}); pass --app`
      : 'No frontend has a project.inlang/settings.json'
  )
}

export const i18nList = pikkuSessionlessFunc({
  description:
    "Report each frontend's message catalog: where it is, its locales, and how much of each is translated.",
  input: I18nListInput,
  output: I18nListOutput,
  func: async ({ config }) => ({
    apps: (await service(config.rootDir).listApps()).map(
      ({ locales, ...app }) => ({
        ...app,
        locales: Object.fromEntries(
          Object.entries(locales).map(([locale, catalog]) => [
            locale,
            {
              keys: Object.keys(catalog).length,
              untranslated: Object.values(catalog).filter((v) =>
                v.includes(MISSING_MARKER)
              ).length,
            },
          ])
        ),
      })
    ),
  }),
})

export const renderI18nList = (
  _services: unknown,
  { apps }: z.infer<typeof I18nListOutput>
): void => {
  if (!apps.length)
    console.log('No frontend has a project.inlang/settings.json.')
  for (const app of apps) {
    console.log(
      `${app.app} ${dim(`${app.messagesDir}, opens in ${app.defaultLocale ?? app.baseLocale}`)}`
    )
    for (const [locale, { keys, untranslated }] of Object.entries(
      app.locales
    )) {
      const note = untranslated
        ? changed(`${untranslated} untranslated`)
        : added('translated')
      console.log(
        `  ${locale}${locale === app.baseLocale ? dim(' (base)') : ''}: ${keys} keys, ${locale === app.baseLocale ? dim('source') : note}`
      )
    }
  }
}

export const i18nAdd = pikkuSessionlessFunc({
  description: `Add a locale with every base key, seeded from the base copy and marked ${MISSING_MARKER} to translate.`,
  input: I18nAddInput,
  output: I18nAddOutput,
  func: async ({ config }, { locale, app }) => {
    const i18n = service(config.rootDir)
    return i18n.addLocale(await resolveApp(i18n, app), locale)
  },
})

export const renderI18nAdd = (
  _services: unknown,
  { path, keys }: z.infer<typeof I18nAddOutput>
): void => {
  console.log(
    `${added('Created')} ${path} with ${keys} keys marked ${MISSING_MARKER}; translate each and drop the marker.`
  )
}

export const i18nSync = pikkuSessionlessFunc({
  description:
    'Add every base key a locale is missing, marked to translate, and report keys only that locale has.',
  input: I18nSyncInput,
  output: I18nSyncOutput,
  func: async ({ config }, { app }) => ({
    report: await service(config.rootDir).sync(app),
  }),
})

export const renderI18nSync = (
  _services: unknown,
  { report }: z.infer<typeof I18nSyncOutput>
): void => {
  if (!report.length) console.log('No locales besides the base to sync.')
  for (const r of report) {
    const parts = [
      r.added.length ? added(`added ${r.added.length}`) : dim('complete'),
      r.untranslated ? changed(`${r.untranslated} untranslated`) : '',
      r.stale.length
        ? changed(`${r.stale.length} stale: ${r.stale.join(', ')}`)
        : '',
    ].filter(Boolean)
    console.log(`${r.app}/${r.locale}: ${parts.join(', ')}`)
  }
}

export const i18nDefault = pikkuSessionlessFunc({
  description: 'Set the locale a frontend opens in for a first-time visitor.',
  input: I18nDefaultInput,
  output: I18nDefaultOutput,
  func: async ({ config }, { locale, app }) => {
    const i18n = service(config.rootDir)
    const target = await resolveApp(i18n, app)
    await i18n.setDefaultLocale(target, locale)
    return { app: target, locale }
  },
})

export const renderI18nDefault = (
  _services: unknown,
  { app, locale }: { app: string; locale: string }
): void => {
  console.log(`${app} now opens in ${locale}.`)
}
