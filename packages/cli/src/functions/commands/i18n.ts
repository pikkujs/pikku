import type { z } from 'zod'
import {
  I18nService,
  MISSING_MARKER,
  messageTexts,
  type I18nCatalog,
} from '@pikku/code-edit/i18n'
import { pikkuSessionlessFunc } from '#pikku/function'
import { workspaceRoot } from '../../utils/workspace-root.js'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import {
  I18nCheckInput,
  I18nCheckOutput,
  I18nKeyInput,
  I18nKeyOutput,
  I18nMoveInput,
  I18nMoveOutput,
  I18nUsageInput,
  I18nUsageOutput,
  I18nUnusedInput,
  I18nUnusedOutput,
  I18nAddInput,
  I18nAddOutput,
  I18nDefaultInput,
  I18nDefaultOutput,
  I18nListInput,
  I18nListOutput,
  I18nSyncInput,
  I18nSyncOutput,
} from './i18n.schemas.js'

const service = (rootDir: string) => new I18nService(workspaceRoot(rootDir))

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

const stats = (locales: Record<string, I18nCatalog>) =>
  Object.fromEntries(
    Object.entries(locales).map(([locale, catalog]) => [
      locale,
      {
        keys: Object.keys(catalog).length,
        untranslated: Object.values(catalog).filter((v) =>
          messageTexts(v).some((text) => text.includes(MISSING_MARKER))
        ).length,
      },
    ])
  )

export const i18nList = pikkuSessionlessFunc({
  description:
    "Report each frontend's message catalogs: where they are, their locales, how much of each is translated, and any key held by two catalogs.",
  input: I18nListInput,
  output: I18nListOutput,
  func: async ({ config }) => ({
    apps: (await service(config.rootDir).listApps()).map(
      ({ locales, catalogs, ...app }) => ({
        ...app,
        locales: stats(locales),
        catalogs: catalogs.map((c) => ({
          catalog: c.catalog,
          locales: stats(c.locales),
        })),
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
  const line = (
    locales: Record<string, { keys: number; untranslated: number }>,
    baseLocale: string,
    indent: string
  ) => {
    for (const [locale, { keys, untranslated }] of Object.entries(locales)) {
      const note = untranslated
        ? changed(`${untranslated} untranslated`)
        : added('translated')
      console.log(
        `${indent}${locale}${locale === baseLocale ? dim(' (base)') : ''}: ${keys} keys, ${locale === baseLocale ? dim('source') : note}`
      )
    }
  }
  for (const app of apps) {
    const several = app.catalogs.length > 1
    console.log(
      `${app.app} ${dim(`${several ? `${app.catalogs.length} catalogs` : app.messagesDir}, base ${app.baseLocale}, opens in ${app.defaultLocale ?? app.baseLocale}`)}`
    )
    if (!several) line(app.locales, app.baseLocale, '  ')
    else
      for (const c of app.catalogs) {
        console.log(`  ${c.catalog}`)
        line(c.locales, app.baseLocale, '    ')
      }
    if (app.duplicates.length) {
      process.exitCode = 1
      console.log(
        changed(
          `  ${app.duplicates.length} key(s) held by more than one catalog:`
        )
      )
      for (const d of app.duplicates)
        console.log(`    ${d.key}: ${d.catalogs.join(', ')}`)
    }
  }
}

export const i18nAdd = pikkuSessionlessFunc({
  description: `Add a locale with every base key, seeded from the base copy and marked ${MISSING_MARKER} to translate.`,
  input: I18nAddInput,
  output: I18nAddOutput,
  func: async ({ config }, { locale, app, catalog }) => {
    const i18n = service(config.rootDir)
    return i18n.addLocale(
      await resolveApp(i18n, app),
      locale,
      undefined,
      catalog
    )
  },
})

export const renderI18nAdd = (
  _services: unknown,
  { files }: z.infer<typeof I18nAddOutput>
): void => {
  for (const { path, keys } of files)
    console.log(
      `${added('Created')} ${path} with ${keys} keys marked ${MISSING_MARKER}`
    )
  console.log('Translate each and drop the marker.')
}

export const i18nSync = pikkuSessionlessFunc({
  description:
    'Add every base key a locale is missing, marked to translate, and report keys only that locale has.',
  input: I18nSyncInput,
  output: I18nSyncOutput,
  func: async ({ config }, { app, catalog }) => ({
    report: await service(config.rootDir).sync(app, catalog),
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
    console.log(`${r.catalog}/${r.locale}: ${parts.join(', ')}`)
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

export const i18nKey = pikkuSessionlessFunc({
  description:
    'Add one message to a catalog in every locale, or update it with --update. Texts are given as <locale>=<text>; the base locale is required and the others are marked to translate.',
  input: I18nKeyInput,
  output: I18nKeyOutput,
  func: async ({ config }, { name, texts, app, catalog, update }) => {
    const i18n = service(config.rootDir)
    const byLocale: Record<string, string> = {}
    for (const text of texts) {
      const at = text.indexOf('=')
      if (at < 1)
        throw new Error(
          `"${text}" is not <locale>=<text>, e.g. en="Your account" de="Dein Konto"`
        )
      const locale = text.slice(0, at)
      if (locale in byLocale) throw new Error(`${locale} is given twice`)
      byLocale[locale] = text.slice(at + 1)
    }
    return i18n.setKey(await resolveApp(i18n, app), name, byLocale, {
      catalog,
      update,
    })
  },
})

export const renderI18nKey = (
  _services: unknown,
  { key, catalog, action, files, kept }: z.infer<typeof I18nKeyOutput>
): void => {
  console.log(
    `${added(action === 'added' ? 'Added' : 'Updated')} ${key} in ${catalog}`
  )
  for (const f of files)
    console.log(
      `  ${f.locale}: ${f.marked ? changed(`marked ${MISSING_MARKER} to translate`) : 'set'}`
    )
  if (kept.length) console.log(dim(`  kept as they were: ${kept.join(', ')}`))
}

export const i18nCheck = pikkuSessionlessFunc({
  description:
    'Read-only gate over the message catalogs: keys in two catalogs, mismatched placeholders, stale keys, and values still marked to translate.',
  input: I18nCheckInput,
  output: I18nCheckOutput,
  func: async ({ config }, { app, catalog, strict }) => {
    const apps = await service(config.rootDir).check(app, { catalog, strict })
    return { ok: apps.every((a) => a.ok), apps }
  },
})

export const renderI18nCheck = (
  _services: unknown,
  { ok, apps }: z.infer<typeof I18nCheckOutput>
): void => {
  if (!apps.length)
    console.log('No frontend has a project.inlang/settings.json.')
  for (const a of apps) {
    console.log(`${a.app} ${dim(`base ${a.baseLocale}`)}`)
    for (const d of a.duplicates)
      console.log(changed(`  duplicate ${d.key}: ${d.catalogs.join(', ')}`))
    for (const c of a.catalogs) {
      const lines: string[] = []
      for (const [locale, n] of Object.entries(c.untranslated))
        lines.push(
          `    ${locale}: ${n} value(s) still marked ${MISSING_MARKER}`
        )
      for (const p of c.placeholders)
        lines.push(
          `    ${p.key} (${p.locale}): placeholders {${p.found.join(', ')}} but ${a.baseLocale} has {${p.base.join(', ')}}`
        )
      for (const p of c.plural)
        lines.push(
          p.problem === 'missing-other'
            ? `    ${p.key} (${p.locale}): plural ${p.selector} has no "other" variant`
            : p.problem === 'unknown-category'
              ? `    ${p.key} (${p.locale}): plural ${p.selector} uses ${p.categories.join(', ')}, which ${p.locale} does not have`
              : `    ${p.key} (${p.locale}): plural ${p.selector} does not write ${p.categories.join(', ')} (warning; covered by other)`
        )
      for (const s of c.stale)
        lines.push(
          `    ${s.locale}: stale, not in ${a.baseLocale}: ${s.keys.join(', ')}`
        )
      console.log(`  ${c.catalog} ${lines.length ? '' : dim('ok')}`)
      for (const l of lines) console.log(l)
    }
    if (a.errors) console.log(removed(`  ${a.errors} error(s)`))
    if (a.warnings)
      console.log(
        changed(
          `  ${a.warnings} untranslated value(s)${a.ok ? ' (warning; --strict makes it fail)' : ''}`
        )
      )
  }
  if (!ok) process.exitCode = 1
}

export const i18nUnused = pikkuSessionlessFunc({
  description:
    'List catalog keys no .ts/.tsx source in the workspace references; --fix deletes them from every locale of their catalog.',
  input: I18nUnusedInput,
  output: I18nUnusedOutput,
  func: async ({ config }, { app, catalog, fix, force }) =>
    service(config.rootDir).unused(app, { catalog, fix, force }),
})

export const renderI18nUnused = (
  _services: unknown,
  r: z.infer<typeof I18nUnusedOutput>
): void => {
  if (r.computed.length) {
    process.exitCode = 1
    console.log(
      removed(
        `Cannot tell which keys are unused: the message namespace is read by computed access in ${r.computed.length} place(s):`
      )
    )
    for (const c of r.computed)
      console.log(`  ${c.file}:${c.line}  ${dim(c.text)}`)
    console.log('Replace each with direct m.<key> calls, then run this again.')
    return
  }
  if (r.unparsed.length) {
    console.log(
      changed(
        `${r.unparsed.length} source file(s) did not parse; keys only they use may be reported as unused:`
      )
    )
    for (const f of r.unparsed) console.log(`  ${f}`)
  }
  for (const a of r.apps) {
    console.log(`${a.app} ${dim(`scanned ${r.files} source files`)}`)
    for (const d of a.duplicates) {
      process.exitCode = 1
      console.log(changed(`  duplicate ${d.key}: ${d.catalogs.join(', ')}`))
    }
    for (const c of a.catalogs) {
      console.log(
        `  ${c.catalog} ${dim(`${c.unused.length} of ${c.keys} unused`)}`
      )
      for (const k of c.unused) console.log(`    ${k}`)
    }
  }
  for (const c of r.removed) {
    console.log(removed(`Removed ${c.keys.length} key(s) from ${c.catalog}:`))
    for (const k of c.keys) console.log(`  ${k}`)
    console.log(dim(`  in ${c.files.join(', ')}`))
  }
}

export const i18nMove = pikkuSessionlessFunc({
  description:
    'Move keys to another catalog of the same app, in every locale, all or nothing.',
  input: I18nMoveInput,
  output: I18nMoveOutput,
  func: async ({ config }, { keys, to, app }) => {
    const i18n = service(config.rootDir)
    return i18n.move(await resolveApp(i18n, app), keys, to)
  },
})

export const renderI18nMove = (
  _services: unknown,
  { to, moved, created }: z.infer<typeof I18nMoveOutput>
): void => {
  for (const m of moved) {
    console.log(`${added('Moved')} ${m.key} from ${m.from} to ${to}`)
    if (m.marked.length)
      console.log(
        changed(
          `  ${m.marked.join(', ')}: marked ${MISSING_MARKER} to translate`
        )
      )
  }
  for (const c of created) console.log(dim(`  created ${c}`))
}

export const i18nUsage = pikkuSessionlessFunc({
  description:
    'For each catalog key, list the source files (or with --by-package the workspace packages) that use it.',
  input: I18nUsageInput,
  output: I18nUsageOutput,
  func: async ({ config }, { app, catalog, byPackage }) => ({
    ...(await service(config.rootDir).usage(app, { catalog })),
    byPackage: !!byPackage,
  }),
})

export const renderI18nUsage = (
  _services: unknown,
  r: z.infer<typeof I18nUsageOutput>
): void => {
  if (r.computed.length)
    console.log(
      changed(
        `The message namespace is read by computed access in ${r.computed.length} place(s); keys used that way are not listed.`
      )
    )
  if (r.unparsed.length)
    console.log(changed(`${r.unparsed.length} source file(s) did not parse`))
  for (const a of r.apps) {
    console.log(`${a.app} ${dim(`scanned ${r.files} source files`)}`)
    for (const d of a.duplicates) {
      process.exitCode = 1
      console.log(changed(`  duplicate ${d.key}: ${d.catalogs.join(', ')}`))
    }
    for (const c of a.catalogs) {
      console.log(`  ${c.catalog} ${dim(`${c.keys.length} keys`)}`)
      for (const k of c.keys) {
        const where = r.byPackage ? k.packages : k.files
        console.log(
          `    ${k.key}  ${where.length ? where.join(', ') : dim('unused')}`
        )
      }
    }
  }
}
