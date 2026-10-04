import { existsSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

export const LOCALE_RE = /^[a-z]{2}([-_][A-Za-z]{2})?$/
/** Prefixes a value seeded from the base locale, so untranslated copy can be grepped. */
export const MISSING_MARKER = '%i18n-missing%'

export type I18nCatalog = Record<string, string>

export type I18nApp = {
  app: string
  messagesDir: string
  baseLocale: string
  defaultLocale: string | null
  locales: Record<string, I18nCatalog>
}

export type I18nSyncReport = {
  app: string
  locale: string
  added: string[]
  stale: string[]
  untranslated: number
}

type InlangSettings = {
  baseLocale?: string
  locales?: string[]
  'plugin.inlang.messageFormat'?: { pathPattern?: string }
} & Record<string, unknown>

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.pikku'])

const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')

const flat = (content: unknown): I18nCatalog => {
  if (!content || typeof content !== 'object') return {}
  return Object.fromEntries(
    Object.entries(content as Record<string, unknown>).filter(
      (e): e is [string, string] =>
        !e[0].startsWith('$') && typeof e[1] === 'string'
    )
  )
}

const sorted = (catalog: I18nCatalog): I18nCatalog =>
  Object.fromEntries(
    Object.keys(catalog)
      .sort()
      .map((k) => [k, catalog[k]!])
  )

/** The Paraglide message catalogs of every app under a workspace: each app is a directory holding `project.inlang/settings.json`. */
export class I18nService {
  constructor(private workspaceRoot: string) {}

  async listApps(): Promise<I18nApp[]> {
    const apps: I18nApp[] = []
    for (const appDir of await this.appDirs()) {
      const settings = await this.readSettings(appDir)
      const messagesDir = this.messagesDir(appDir, settings)
      apps.push({
        app: relative(this.workspaceRoot, appDir),
        messagesDir: relative(this.workspaceRoot, messagesDir),
        baseLocale: settings.baseLocale ?? 'en',
        defaultLocale: await this.readDefaultLocale(appDir),
        locales: await this.readCatalogs(messagesDir),
      })
    }
    return apps
  }

  async writeLocale(
    app: string,
    locale: string,
    content: I18nCatalog
  ): Promise<string> {
    const appDir = await this.appDir(app)
    const path = this.catalogPath(
      appDir,
      await this.readSettings(appDir),
      locale
    )
    await writeJson(path, flat(content))
    await this.registerLocale(appDir, locale)
    return relative(this.workspaceRoot, path)
  }

  async deleteLocale(app: string, locale: string): Promise<void> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    if (locale === (settings.baseLocale ?? 'en')) {
      throw new Error(`${locale} is the base locale and cannot be removed`)
    }
    await rm(this.catalogPath(appDir, settings, locale), { force: true })
    if (settings.locales?.includes(locale)) {
      await writeJson(this.settingsPath(appDir), {
        ...settings,
        locales: settings.locales.filter((l) => l !== locale),
      })
    }
  }

  /** Creates a locale with every base key, using `translations` where given and the marked base copy elsewhere. */
  async addLocale(
    app: string,
    locale: string,
    translations: I18nCatalog = {}
  ): Promise<{ path: string; keys: number; translated: number }> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    const path = this.catalogPath(appDir, settings, locale)
    if (existsSync(path)) throw new Error(`${locale} already exists for ${app}`)
    const base = await this.baseCatalog(appDir, settings)
    const keys = Object.keys(base)
    if (!keys.length)
      throw new Error(
        `${app} has no ${settings.baseLocale ?? 'en'} copy to start from`
      )
    const translated = keys.filter((k) => translations[k] !== undefined)
    await writeJson(
      path,
      sorted(
        Object.fromEntries(
          keys.map((k) => [
            k,
            translations[k] ?? `${MISSING_MARKER} ${base[k]}`,
          ])
        )
      )
    )
    await this.registerLocale(appDir, locale)
    return {
      path: relative(this.workspaceRoot, path),
      keys: keys.length,
      translated: translated.length,
    }
  }

  /** Adds every base key a locale lacks, seeded and marked, and reports keys only the locale has. */
  async sync(app?: string): Promise<I18nSyncReport[]> {
    const report: I18nSyncReport[] = []
    const dirs = app ? [await this.appDir(app)] : await this.appDirs()
    for (const appDir of dirs) {
      const settings = await this.readSettings(appDir)
      const baseLocale = settings.baseLocale ?? 'en'
      const base = await this.baseCatalog(appDir, settings)
      const catalogs = await this.readCatalogs(
        this.messagesDir(appDir, settings)
      )
      for (const [locale, entries] of Object.entries(catalogs)) {
        if (locale === baseLocale) continue
        const added = Object.keys(base).filter((k) => !(k in entries))
        for (const k of added) entries[k] = `${MISSING_MARKER} ${base[k]}`
        if (added.length)
          await writeJson(
            this.catalogPath(appDir, settings, locale),
            sorted(entries)
          )
        report.push({
          app: relative(this.workspaceRoot, appDir),
          locale,
          added,
          stale: Object.keys(entries).filter((k) => !(k in base)),
          untranslated: Object.values(entries).filter((v) =>
            v.includes(MISSING_MARKER)
          ).length,
        })
      }
    }
    return report
  }

  /** Sets the locale an app opens in (`src/i18n/active.json`); refuses one Paraglide does not compile. */
  async setDefaultLocale(app: string, locale: string): Promise<void> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    this.assertLocale(locale)
    if (settings.locales?.length && !settings.locales.includes(locale)) {
      throw new Error(
        `${locale} is not one of ${app}'s locales (${settings.locales.join(', ')}); add it first`
      )
    }
    const path = join(appDir, 'src', 'i18n', 'active.json')
    const current = await readFile(path, 'utf-8')
      .then((text) => JSON.parse(text) as Record<string, unknown>)
      .catch(() => undefined)
    if (!current)
      throw new Error(
        `${app} has no src/i18n/active.json to hold a default locale`
      )
    await writeJson(path, { ...current, defaultLocale: locale })
  }

  private async appDirs(): Promise<string[]> {
    const found: string[] = []
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (existsSync(join(dir, 'project.inlang', 'settings.json')))
        found.push(dir)
      if (depth === 0) return
      const entries = await readdir(dir, { withFileTypes: true }).catch(
        () => []
      )
      for (const e of entries) {
        if (
          e.isDirectory() &&
          !e.name.startsWith('.') &&
          !SKIP_DIRS.has(e.name)
        ) {
          await walk(join(dir, e.name), depth - 1)
        }
      }
    }
    await walk(this.workspaceRoot, 3)
    return found.sort()
  }

  private async appDir(app: string): Promise<string> {
    const abs = resolve(this.workspaceRoot, app)
    if (
      abs !== this.workspaceRoot &&
      !abs.startsWith(this.workspaceRoot + sep)
    ) {
      throw new Error('Path escapes the project')
    }
    if (!existsSync(this.settingsPath(abs)))
      throw new Error(`${app} has no project.inlang/settings.json`)
    return abs
  }

  private settingsPath(appDir: string): string {
    return join(appDir, 'project.inlang', 'settings.json')
  }

  private async readSettings(appDir: string): Promise<InlangSettings> {
    return JSON.parse(await readFile(this.settingsPath(appDir), 'utf-8'))
  }

  private messagesDir(appDir: string, settings: InlangSettings): string {
    const pattern =
      settings['plugin.inlang.messageFormat']?.pathPattern ??
      './messages/{locale}.json'
    return dirname(resolve(appDir, pattern.replace('{locale}', 'x')))
  }

  private assertLocale(locale: string): void {
    if (!LOCALE_RE.test(locale))
      throw new Error(`"${locale}" is not a locale (e.g. en, de, pt-BR)`)
  }

  private catalogPath(
    appDir: string,
    settings: InlangSettings,
    locale: string
  ): string {
    this.assertLocale(locale)
    return join(this.messagesDir(appDir, settings), `${locale}.json`)
  }

  private async readCatalogs(
    messagesDir: string
  ): Promise<Record<string, I18nCatalog>> {
    const catalogs: Record<string, I18nCatalog> = {}
    for (const file of (
      await readdir(messagesDir).catch(() => [] as string[])
    ).sort()) {
      const locale = file.slice(0, -'.json'.length)
      if (!file.endsWith('.json') || !LOCALE_RE.test(locale)) continue
      catalogs[locale] = flat(
        JSON.parse(await readFile(join(messagesDir, file), 'utf-8'))
      )
    }
    return catalogs
  }

  private async baseCatalog(
    appDir: string,
    settings: InlangSettings
  ): Promise<I18nCatalog> {
    const path = this.catalogPath(appDir, settings, settings.baseLocale ?? 'en')
    return flat(
      await readFile(path, 'utf-8')
        .then(JSON.parse)
        .catch(() => ({}))
    )
  }

  private async readDefaultLocale(appDir: string): Promise<string | null> {
    try {
      const { defaultLocale } = JSON.parse(
        await readFile(join(appDir, 'src', 'i18n', 'active.json'), 'utf-8')
      )
      return typeof defaultLocale === 'string' ? defaultLocale : null
    } catch {
      return null
    }
  }

  private async registerLocale(appDir: string, locale: string): Promise<void> {
    const settings = await this.readSettings(appDir)
    const locales = settings.locales ?? []
    if (!locales.includes(locale))
      await writeJson(this.settingsPath(appDir), {
        ...settings,
        locales: [...locales, locale],
      })
  }
}
