import { existsSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { scanMessageUsage, type MessageSite } from './i18n-usage.js'

export const LOCALE_RE = /^[a-z]{2}([-_][A-Za-z]{2})?$/
/** Prefixes a value seeded from the base locale, so untranslated copy can be grepped. */
export const MISSING_MARKER = '%i18n-missing%'

/** The inlang `$schema` first line of a locale file; written when a file has none, kept when it names another URL. */
export const INLANG_SCHEMA = 'https://inlang.com/schema/inlang-message-format'

/**
 * One variant block of an inlang message-format (plugin v4) complex message, e.g. a plural:
 * `{ declarations: ["input count", "local countPlural = count: plural"], selectors: ["countPlural"],
 * match: { "countPlural=one": "{count} file", "countPlural=other": "{count} files" } }`.
 */
export type I18nVariantBlock = {
  declarations?: string[]
  selectors?: string[]
  match: Record<string, string>
}

/** A complex message is stored as a one-element array wrapping its variant block. */
export type I18nPluralMessage = I18nVariantBlock[]

/** A message: a plain string, or a variant (plural) message. A plural message is ONE key. */
export type I18nMessage = string | I18nPluralMessage

export type I18nCatalog = Record<string, I18nMessage>

/** One directory of `<locale>.json` files; named by its folder relative to the workspace root. */
export type I18nCatalogDir = {
  /** Folder relative to the workspace root, e.g. `packages/ui/messages`. */
  catalog: string
  locales: Record<string, I18nCatalog>
}

export type I18nDuplicateKey = { key: string; catalogs: string[] }

export type I18nApp = {
  app: string
  /** The first catalog's folder (the only one for most apps). */
  messagesDir: string
  baseLocale: string
  defaultLocale: string | null
  /** Every locale, with the keys of all catalogs merged. */
  locales: Record<string, I18nCatalog>
  /** One entry per `pathPattern`, in settings order. */
  catalogs: I18nCatalogDir[]
  /** Keys held by more than one catalog of this app; an error. */
  duplicates: I18nDuplicateKey[]
}

export type I18nSyncReport = {
  app: string
  catalog: string
  locale: string
  added: string[]
  stale: string[]
  untranslated: number
}

export type I18nAddResult = {
  path: string
  keys: number
  translated: number
  /** One entry per catalog written. */
  files: { catalog: string; path: string; keys: number; translated: number }[]
}

export type I18nKeyResult = {
  app: string
  key: string
  catalog: string
  /** Created, or updated in the catalog that already held it. */
  action: 'added' | 'updated'
  /** Files written, with the locales set in each. */
  files: { path: string; locale: string; marked: boolean }[]
  /** Update only: locales whose existing text was left as it was. */
  kept: string[]
}

export type I18nCheckCatalog = {
  catalog: string
  /** Per non-base locale: how many values still carry the missing marker. */
  untranslated: Record<string, number>
  /** Same key, different `{placeholder}` sets in two locales. */
  placeholders: {
    key: string
    locale: string
    base: string[]
    found: string[]
  }[]
  /** Keys a locale holds that the base locale does not. */
  stale: { locale: string; keys: string[] }[]
  /**
   * Plural-message problems per key and locale. `missing-other` and `unknown-category` are errors;
   * `missing-category` (a category the locale has but the message does not write, so `other` covers it) is a warning.
   */
  plural: {
    key: string
    locale: string
    problem: 'missing-other' | 'unknown-category' | 'missing-category'
    selector: string
    /** The offending or missing categories (for `missing-other`, empty). */
    categories: string[]
  }[]
}

export type I18nCheckReport = {
  app: string
  baseLocale: string
  duplicates: I18nDuplicateKey[]
  catalogs: I18nCheckCatalog[]
  /** Problems that always fail the check. */
  errors: number
  /** Marked values; they fail only with `strict`. */
  warnings: number
  ok: boolean
}

export type I18nUnusedResult = {
  app: string
  baseLocale: string
  duplicates: I18nDuplicateKey[]
  catalogs: { catalog: string; keys: number; unused: string[] }[]
}

export type I18nUnusedReport = {
  /** Source files scanned across the whole workspace. */
  files: number
  /** Namespace reads that name no key; when present nothing is reported as unused. */
  computed: MessageSite[]
  /** Source files that did not parse; keys they use could be missed. */
  unparsed: string[]
  apps: I18nUnusedResult[]
  /** With `fix`: keys deleted from every locale file, per catalog. */
  removed: { catalog: string; keys: string[]; files: string[] }[]
}

export type I18nMoveResult = {
  app: string
  /** The catalog the keys went to. */
  to: string
  /** In the order given, de-duplicated. */
  moved: {
    key: string
    from: string
    /** Locales whose existing text travelled with the key. */
    locales: string[]
    /** Locales the target has that the source had no text for; written as the marked base text. */
    marked: string[]
  }[]
  /** Target locale files that did not exist and were created. */
  created: string[]
  /** Every file rewritten, source and target. */
  files: string[]
}

export type I18nUsageKey = {
  key: string
  /** Workspace-relative source files referencing the key; sorted. */
  files: string[]
  /** Workspace packages (`apps/x`, `packages/y`, else the top-level folder) those files sit in; sorted. */
  packages: string[]
}

export type I18nUsageReport = {
  files: number
  computed: MessageSite[]
  unparsed: string[]
  apps: {
    app: string
    duplicates: I18nDuplicateKey[]
    catalogs: { catalog: string; keys: I18nUsageKey[] }[]
  }[]
}

type InlangSettings = {
  baseLocale?: string
  locales?: string[]
  'plugin.inlang.messageFormat'?: { pathPattern?: string | string[] }
} & Record<string, unknown>

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.pikku'])

const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')

/** File text of a locale file: `$schema` first (the content's own, else the standard URL), then the entries in their order. */
const catalogText = (content: Record<string, unknown>): string => {
  const { $schema, ...rest } = content
  return (
    JSON.stringify(
      {
        $schema:
          typeof $schema === 'string' && $schema ? $schema : INLANG_SCHEMA,
        ...rest,
      },
      null,
      2
    ) + '\n'
  )
}

/** The `$schema` an existing locale file holds, if any. */
const existingSchema = async (path: string): Promise<string | undefined> => {
  try {
    const { $schema } = JSON.parse(await readFile(path, 'utf-8'))
    return typeof $schema === 'string' && $schema ? $schema : undefined
  } catch {
    return undefined
  }
}

/** Writes a locale file with `$schema` first: the content's, else the file's current one, else the standard URL. */
const writeCatalog = async (path: string, content: Record<string, unknown>) => {
  const schema =
    typeof content.$schema === 'string' && content.$schema
      ? (content.$schema as string)
      : await existingSchema(path)
  await writeFile(
    path,
    catalogText({ ...(schema ? { $schema: schema } : {}), ...content }),
    'utf-8'
  )
}

/** True for the stored shape of a complex message: a non-empty array whose first element has a `match` map of strings. */
export const isPluralMessage = (value: unknown): value is I18nPluralMessage => {
  if (!Array.isArray(value) || !value.length) return false
  const block = value[0]
  if (!block || typeof block !== 'object') return false
  const { match, declarations, selectors } = block as Record<string, unknown>
  const strings = (v: unknown) =>
    v === undefined ||
    (Array.isArray(v) && v.every((x) => typeof x === 'string'))
  return (
    !!match &&
    typeof match === 'object' &&
    !Array.isArray(match) &&
    Object.values(match).every((v) => typeof v === 'string') &&
    strings(declarations) &&
    strings(selectors)
  )
}

const isMessage = (value: unknown): value is I18nMessage =>
  typeof value === 'string' || isPluralMessage(value)

const flat = (content: unknown): I18nCatalog => {
  if (!content || typeof content !== 'object') return {}
  return Object.fromEntries(
    Object.entries(content as Record<string, unknown>).filter(
      (e): e is [string, I18nMessage] =>
        !e[0].startsWith('$') && isMessage(e[1])
    )
  )
}

/** Every text of a message: the string, or each variant's text. */
export const messageTexts = (message: I18nMessage): string[] =>
  typeof message === 'string'
    ? [message]
    : message.flatMap((block) => Object.values(block.match))

/** The message as one string, for emptiness and marker checks. */
const messageText = (message: I18nMessage): string =>
  messageTexts(message).join('\n')

/** The same message with every text prefixed by the missing marker. */
const markedCopy = (message: I18nMessage): I18nMessage =>
  typeof message === 'string'
    ? `${MISSING_MARKER} ${message}`
    : message.map((block) => ({
        ...block,
        match: Object.fromEntries(
          Object.entries(block.match).map(([k, v]) => [
            k,
            `${MISSING_MARKER} ${v}`,
          ])
        ),
      }))

const hasMarker = (message: I18nMessage): boolean =>
  messageText(message).includes(MISSING_MARKER)

const KEY_RE = /^[a-z_][a-z0-9_]*$/
const PLACEHOLDER_RE = /\{\s*([A-Za-z_$][\w$.]*)\s*\}/g

/** The `{name}` placeholders a message uses, sorted and unique. */
export const placeholders = (text: string): string[] =>
  [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!))].sort()

/** The variables a message uses: `{name}` in any text plus every `input name` declared. Sorted, unique. */
export const messagePlaceholders = (message: I18nMessage): string[] => {
  const names = new Set(messageTexts(message).flatMap(placeholders))
  if (typeof message !== 'string')
    for (const block of message)
      for (const d of block.declarations ?? []) {
        const m = /^\s*input\s+(\S+)\s*$/.exec(d)
        if (m) names.add(m[1]!)
      }
  return [...names].sort()
}

type PluralSelector = { name: string; type: 'cardinal' | 'ordinal' }

/** The selectors of a block declared as `local X = y: plural [type=ordinal]`. */
const pluralSelectors = (block: I18nVariantBlock): PluralSelector[] => {
  const out: PluralSelector[] = []
  for (const d of block.declarations ?? []) {
    const m = /^\s*local\s+(\w+)\s*=\s*\w+\s*:\s*plural\b(.*)$/.exec(d)
    if (m)
      out.push({
        name: m[1]!,
        type: /\btype\s*=\s*\|?ordinal\|?/.test(m[2]!) ? 'ordinal' : 'cardinal',
      })
  }
  return out
}

/** The categories a locale has (`Intl.PluralRules`); `other` only when the locale is not recognised. */
export const pluralCategories = (
  locale: string,
  type: 'cardinal' | 'ordinal' = 'cardinal'
): string[] => {
  try {
    return new Intl.PluralRules(locale.replace('_', '-'), {
      type,
    }).resolvedOptions().pluralCategories as string[]
  } catch {
    return ['other']
  }
}

type PluralIssue = I18nCheckCatalog['plural'][number]

/**
 * Checks one plural message against a locale. Rules: every plural selector must have an `other` (or `*`)
 * variant, since `other` is what Paraglide falls back to (error); a category the locale does not have
 * per `Intl.PluralRules` is an error; a category the locale has but the message does not write is covered
 * by `other` and is a warning (`missing-category`), so strict checks make translators write each form.
 */
export const pluralIssues = (
  message: I18nMessage,
  locale: string
): Omit<PluralIssue, 'key' | 'locale'>[] => {
  if (typeof message === 'string') return []
  const issues: Omit<PluralIssue, 'key' | 'locale'>[] = []
  for (const block of message)
    for (const sel of pluralSelectors(block)) {
      const written = new Set<string>()
      let catchall = false
      for (const pattern of Object.keys(block.match))
        for (const part of pattern.replace(/\s/g, '').split(',')) {
          const [name, value] = part.split('=')
          if (name !== sel.name || !value) continue
          if (value === '*') catchall = true
          else written.add(value)
        }
      const has = pluralCategories(locale, sel.type)
      const unknown = [...written].filter((c) => !has.includes(c)).sort()
      if (!written.has('other') && !catchall)
        issues.push({
          problem: 'missing-other',
          selector: sel.name,
          categories: [],
        })
      if (unknown.length)
        issues.push({
          problem: 'unknown-category',
          selector: sel.name,
          categories: unknown,
        })
      const missing = has.filter((c) => c !== 'other' && !written.has(c))
      if (missing.length)
        issues.push({
          problem: 'missing-category',
          selector: sel.name,
          categories: missing,
        })
    }
  return issues
}

const gitStatus = (cwd: string, files: string[]): Promise<string | null> =>
  new Promise((done) =>
    execFile(
      'git',
      ['status', '--porcelain', '--', ...files],
      { cwd },
      (error, stdout) => done(error ? null : stdout.trim())
    )
  )

/** The workspace package a workspace-relative file belongs to: `apps/x` or `packages/y`, else its top-level folder. */
const packageOf = (file: string): string => {
  const parts = file.split('/')
  return ['apps', 'packages'].includes(parts[0]!) && parts.length > 2
    ? `${parts[0]}/${parts[1]}`
    : parts.length > 1
      ? parts[0]!
      : '.'
}

const sorted = (catalog: I18nCatalog): I18nCatalog =>
  Object.fromEntries(
    Object.keys(catalog)
      .sort()
      .map((k) => [k, catalog[k]!])
  )

/** The Paraglide message catalogs of every app under a workspace: each app is a directory holding `project.inlang/settings.json`. An app may list several `pathPattern`s; each is a catalog and all merge into one namespace. */
export class I18nService {
  constructor(private workspaceRoot: string) {}

  async listApps(): Promise<I18nApp[]> {
    const apps: I18nApp[] = []
    for (const appDir of await this.appDirs())
      apps.push(await this.readApp(appDir))
    return apps
  }

  /** Replaces one locale in one catalog. With several catalogs, `catalog` is required unless every key belongs to a single catalog. */
  async writeLocale(
    app: string,
    locale: string,
    content: I18nCatalog,
    catalog?: string
  ): Promise<string> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    const dirs = this.catalogDirs(appDir, settings)
    const dir = await this.pickCatalog(appDir, settings, dirs, catalog, content)
    const path = this.catalogPath(dir, locale)
    await writeCatalog(path, flat(content))
    await this.registerLocale(appDir, locale)
    return relative(this.workspaceRoot, path)
  }

  /** Removes a locale; with several catalogs `catalog` is required, and the locale is unregistered once no catalog holds it. */
  async deleteLocale(
    app: string,
    locale: string,
    catalog?: string
  ): Promise<void> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    if (locale === (settings.baseLocale ?? 'en')) {
      throw new Error(`${locale} is the base locale and cannot be removed`)
    }
    const dirs = this.catalogDirs(appDir, settings)
    const dir = await this.pickCatalog(appDir, settings, dirs, catalog)
    await rm(this.catalogPath(dir, locale), { force: true })
    const remains = dirs.some((d) => existsSync(this.catalogPath(d, locale)))
    if (!remains && settings.locales?.includes(locale)) {
      await writeJson(this.settingsPath(appDir), {
        ...settings,
        locales: settings.locales.filter((l) => l !== locale),
      })
    }
  }

  /** Creates a locale in every catalog (or just `catalog`) with every base key, using `translations` where given and the marked base copy elsewhere. */
  async addLocale(
    app: string,
    locale: string,
    translations: I18nCatalog = {},
    catalog?: string
  ): Promise<I18nAddResult> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    await this.assertNoDuplicates(appDir, settings, app)
    const all = this.catalogDirs(appDir, settings)
    const dirs = catalog ? [this.findCatalog(all, appDir, catalog)] : all
    const plan: { dir: string; base: I18nCatalog }[] = []
    for (const dir of dirs) {
      if (existsSync(this.catalogPath(dir, locale)))
        throw new Error(
          `${locale} already exists for ${app} in ${this.catalogName(dir)}`
        )
      const base = await this.baseCatalog(dir, settings)
      if (!Object.keys(base).length)
        throw new Error(
          `${this.catalogName(dir)} has no ${settings.baseLocale ?? 'en'} copy to start from`
        )
      plan.push({ dir, base })
    }
    const files: I18nAddResult['files'] = []
    for (const { dir, base } of plan) {
      const keys = Object.keys(base)
      const path = this.catalogPath(dir, locale)
      await writeCatalog(
        path,
        sorted(
          Object.fromEntries(
            keys.map((k) => [k, translations[k] ?? markedCopy(base[k]!)])
          )
        )
      )
      files.push({
        catalog: this.catalogName(dir),
        path: relative(this.workspaceRoot, path),
        keys: keys.length,
        translated: keys.filter((k) => translations[k] !== undefined).length,
      })
    }
    await this.registerLocale(appDir, locale)
    return {
      path: files[0]!.path,
      keys: files.reduce((n, f) => n + f.keys, 0),
      translated: files.reduce((n, f) => n + f.translated, 0),
      files,
    }
  }

  /** Per catalog, adds every base key a locale lacks, seeded and marked, and reports keys only the locale has. */
  async sync(app?: string, catalog?: string): Promise<I18nSyncReport[]> {
    const report: I18nSyncReport[] = []
    const dirs = app ? [await this.appDir(app)] : await this.appDirs()
    for (const appDir of dirs) {
      const settings = await this.readSettings(appDir)
      await this.assertNoDuplicates(
        appDir,
        settings,
        relative(this.workspaceRoot, appDir)
      )
      const baseLocale = settings.baseLocale ?? 'en'
      const all = this.catalogDirs(appDir, settings)
      for (const dir of catalog
        ? [this.findCatalog(all, appDir, catalog)]
        : all) {
        const base = await this.baseCatalog(dir, settings)
        const catalogs = await this.readCatalogs(dir)
        for (const [locale, entries] of Object.entries(catalogs)) {
          if (locale === baseLocale) continue
          const added = Object.keys(base).filter((k) => !(k in entries))
          for (const k of added) entries[k] = markedCopy(base[k]!)
          if (added.length)
            await writeCatalog(this.catalogPath(dir, locale), sorted(entries))
          report.push({
            app: relative(this.workspaceRoot, appDir),
            catalog: this.catalogName(dir),
            locale,
            added,
            stale: Object.keys(entries).filter((k) => !(k in base)),
            untranslated: Object.values(entries).filter(hasMarker).length,
          })
        }
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

  /**
   * Adds one message to one catalog, in every locale the catalog holds: `texts[baseLocale]` is required,
   * other locales not given get the marked base text. Refuses a key that any catalog of the app already
   * holds unless `update`, which rewrites it in the catalog that holds it and leaves locales not given
   * as they are.
   *
   * A text is a string, or a plural message in the inlang message-format shape (an array holding one
   * `{ declarations, selectors, match }` block; see `setPlural` to build one from categories). A plural
   * message is one key: every locale must keep the same variables (the `input` declarations and `{names}`
   * in the texts), and each locale given a plural must use only the categories that locale has and
   * include `other`. A locale not given gets the marked copy of the base message, in the same shape.
   */
  async setKey(
    app: string,
    key: string,
    texts: Record<string, I18nMessage>,
    { catalog, update = false }: { catalog?: string; update?: boolean } = {}
  ): Promise<I18nKeyResult> {
    if (!KEY_RE.test(key))
      throw new Error(
        `"${key}" is not a valid message key; use lowercase letters, digits and underscores, starting with a letter (e.g. account_screen__title)`
      )
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    await this.assertNoDuplicates(appDir, settings, app)
    const baseLocale = settings.baseLocale ?? 'en'
    const dirs = this.catalogDirs(appDir, settings)
    const appLocales = new Set([...(settings.locales ?? []), baseLocale])
    for (const dir of dirs)
      for (const l of Object.keys(await this.readCatalogs(dir)))
        appLocales.add(l)
    for (const locale of Object.keys(texts)) {
      this.assertLocale(locale)
      if (!appLocales.has(locale))
        throw new Error(
          `${locale} is not one of ${app}'s locales (${[...appLocales].join(', ')}); add it first`
        )
    }
    const baseText = texts[baseLocale]
    if (baseText === undefined || !isMessage(baseText))
      throw new Error(`The ${baseLocale} (base locale) text is required`)
    if (!messageText(baseText).trim())
      throw new Error(`The ${baseLocale} (base locale) text is required`)
    for (const [locale, text] of Object.entries(texts)) {
      if (!isMessage(text))
        throw new Error(
          `${key}: the ${locale} text must be a string or a plural message ([{ declarations, selectors, match }])`
        )
      for (const issue of pluralIssues(text, locale))
        if (issue.problem !== 'missing-category')
          throw new Error(
            issue.problem === 'missing-other'
              ? `${key}: ${locale} plural message has no "${issue.selector}=other" variant`
              : `${key}: ${locale} has no plural ${issue.categories.map((c) => `"${c}"`).join(', ')} (it has ${pluralCategories(locale).join(', ')})`
          )
    }
    const basePlaceholders = messagePlaceholders(baseText)
    for (const [locale, text] of Object.entries(texts))
      this.assertSamePlaceholders(
        key,
        locale,
        basePlaceholders,
        text,
        baseLocale
      )

    let holder: string | undefined
    for (const dir of dirs)
      if (
        key in (await this.baseCatalog(dir, settings)) ||
        Object.values(await this.readCatalogs(dir)).some((c) => key in c)
      )
        holder = dir
    if (holder && !update)
      throw new Error(
        `${key} already exists in ${this.catalogName(holder)}; pass update to change it`
      )
    let target: string
    if (holder) {
      target = holder
      if (catalog && this.findCatalog(dirs, appDir, catalog) !== holder)
        throw new Error(
          `${key} lives in ${this.catalogName(holder)}, not ${catalog}`
        )
    } else if (catalog) target = this.findCatalog(dirs, appDir, catalog)
    else if (dirs.length === 1) target = dirs[0]!
    else
      throw new Error(
        `This app has several message catalogs (${dirs.map((d) => this.catalogName(d)).join(', ')}); say which one with catalog`
      )

    const existing = await this.readRawCatalogs(target)
    const locales = new Set([...Object.keys(existing), ...Object.keys(texts)])
    const plan: { locale: string; value: I18nMessage; marked: boolean }[] = []
    const kept: string[] = []
    for (const locale of [...locales].sort()) {
      const given = texts[locale]
      const current = existing[locale]?.[key]
      if (given !== undefined)
        plan.push({ locale, value: given, marked: false })
      else if (holder && isMessage(current)) {
        this.assertSamePlaceholders(
          key,
          locale,
          basePlaceholders,
          current,
          baseLocale,
          true
        )
        kept.push(locale)
      } else
        plan.push({
          locale,
          value: markedCopy(baseText),
          marked: true,
        })
    }
    const files: I18nKeyResult['files'] = []
    for (const { locale, value, marked } of plan) {
      const path = this.catalogPath(target, locale)
      const content = { ...(existing[locale] ?? {}), [key]: value }
      await writeCatalog(
        path,
        Object.fromEntries(
          Object.keys(content)
            .sort()
            .map((k) => [k, content[k]])
        )
      )
      await this.registerLocale(appDir, locale)
      files.push({ path: relative(this.workspaceRoot, path), locale, marked })
    }
    return {
      app,
      key,
      catalog: this.catalogName(target),
      action: holder ? 'updated' : 'added',
      files,
      kept,
    }
  }

  /**
   * Writes a plural message: `forms[locale]` maps plural categories to text (`{ one: '{count} file',
   * other: '{count} files' }`). It builds the inlang shape (`input <input>`, `local <input>Plural = <input>:
   * plural`, selector `<input>Plural`, `match` keys `<input>Plural=<category>`) and calls `setKey`, so all
   * its rules apply: base locale required, `other` required, only categories the locale has (German: one,
   * other; Arabic: zero, one, two, few, many, other), the same variables in every locale.
   */
  async setPlural(
    app: string,
    key: string,
    forms: Record<string, Record<string, string>>,
    {
      input = 'count',
      catalog,
      update = false,
    }: { input?: string; catalog?: string; update?: boolean } = {}
  ): Promise<I18nKeyResult> {
    const selector = `${input}Plural`
    const texts: Record<string, I18nMessage> = {}
    for (const [locale, categories] of Object.entries(forms))
      texts[locale] = [
        {
          declarations: [
            `input ${input}`,
            `local ${selector} = ${input}: plural`,
          ],
          selectors: [selector],
          match: Object.fromEntries(
            Object.entries(categories).map(([c, t]) => [`${selector}=${c}`, t])
          ),
        },
      ]
    return this.setKey(app, key, texts, { catalog, update })
  }

  /** Read-only: per catalog, marked values, mismatched `{placeholders}` and keys a locale has that the base does not; plus keys held by two catalogs. */
  async check(
    app?: string,
    { strict = false, catalog }: { strict?: boolean; catalog?: string } = {}
  ): Promise<I18nCheckReport[]> {
    const reports: I18nCheckReport[] = []
    for (const appDir of app
      ? [await this.appDir(app)]
      : await this.appDirs()) {
      const settings = await this.readSettings(appDir)
      const baseLocale = settings.baseLocale ?? 'en'
      const all = this.catalogDirs(appDir, settings)
      const dirs = catalog ? [this.findCatalog(all, appDir, catalog)] : all
      const catalogs: I18nCheckCatalog[] = []
      let errors = (await this.findDuplicates(all, settings)).length
      let warnings = 0
      for (const dir of dirs) {
        const locales = await this.readCatalogs(dir)
        const base = locales[baseLocale] ?? {}
        const entry: I18nCheckCatalog = {
          catalog: this.catalogName(dir),
          untranslated: {},
          placeholders: [],
          stale: [],
          plural: [],
        }
        for (const [locale, values] of Object.entries(locales)) {
          for (const key of Object.keys(values).sort())
            for (const issue of pluralIssues(values[key]!, locale)) {
              entry.plural.push({ key, locale, ...issue })
              if (issue.problem === 'missing-category') warnings++
              else errors++
            }
          if (locale === baseLocale) continue
          const marked = Object.values(values).filter(hasMarker).length
          if (marked) {
            entry.untranslated[locale] = marked
            warnings += marked
          }
          const stale = Object.keys(values).filter((k) => !(k in base))
          if (stale.length) {
            entry.stale.push({ locale, keys: stale.sort() })
            errors += stale.length
          }
          for (const key of Object.keys(values).sort()) {
            if (!(key in base)) continue
            const want = messagePlaceholders(base[key]!)
            const found = messagePlaceholders(values[key]!)
            if (want.join() !== found.join()) {
              entry.placeholders.push({ key, locale, base: want, found })
              errors++
            }
          }
        }
        catalogs.push(entry)
      }
      reports.push({
        app: relative(this.workspaceRoot, appDir),
        baseLocale,
        duplicates: await this.findDuplicates(all, settings),
        catalogs,
        errors,
        warnings,
        ok: errors === 0 && (!strict || warnings === 0),
      })
    }
    return reports
  }

  /**
   * Catalog keys no source file references, found by scanning every `.ts`/`.tsx` in the workspace for
   * `m.key`, `m['key']` and `m.key(...)` (see `scanMessageUsage`). A key used from any package counts.
   * With computed access to the namespace nothing can be known and no key is reported. `fix` deletes
   * the unused keys from every locale file of their catalog, and refuses unless every source parsed, no
   * key is duplicated, and git shows the files unchanged (`force` is only for git being unavailable).
   */
  async unused(
    app?: string,
    {
      fix = false,
      force = false,
      catalog,
    }: { fix?: boolean; force?: boolean; catalog?: string } = {}
  ): Promise<I18nUnusedReport> {
    const scan = scanMessageUsage(this.workspaceRoot)
    const report: I18nUnusedReport = {
      files: scan.files,
      computed: scan.computed,
      unparsed: scan.unparsed,
      apps: [],
      removed: [],
    }
    const dirsOf = new Map<string, string>()
    for (const appDir of app
      ? [await this.appDir(app)]
      : await this.appDirs()) {
      const settings = await this.readSettings(appDir)
      const all = this.catalogDirs(appDir, settings)
      const result: I18nUnusedResult = {
        app: relative(this.workspaceRoot, appDir),
        baseLocale: settings.baseLocale ?? 'en',
        duplicates: await this.findDuplicates(all, settings),
        catalogs: [],
      }
      for (const dir of catalog
        ? [this.findCatalog(all, appDir, catalog)]
        : all) {
        const keys = new Set<string>()
        for (const values of Object.values(await this.readCatalogs(dir)))
          for (const k of Object.keys(values)) keys.add(k)
        const unused = scan.computed.length
          ? []
          : [...keys].filter((k) => !scan.keys.has(k)).sort()
        result.catalogs.push({
          catalog: this.catalogName(dir),
          keys: keys.size,
          unused,
        })
        dirsOf.set(this.catalogName(dir), dir)
      }
      report.apps.push(result)
    }
    if (!fix) return report

    const why: string[] = []
    if (scan.computed.length)
      why.push(
        `the message namespace is read by computed access in ${scan.computed.length} place(s)`
      )
    if (scan.unparsed.length)
      why.push(`${scan.unparsed.length} source file(s) did not parse`)
    if (report.apps.some((a) => a.duplicates.length))
      why.push('keys are held by more than one catalog')
    const targets = report.apps
      .flatMap((a) => a.catalogs)
      .filter((c) => c.unused.length)
    const paths = new Map<string, string[]>()
    for (const c of targets) {
      const dir = dirsOf.get(c.catalog)!
      paths.set(
        c.catalog,
        Object.keys(await this.readCatalogs(dir)).map((l) =>
          this.catalogPath(dir, l)
        )
      )
    }
    if (!why.length && targets.length) {
      const files = [...paths.values()]
        .flat()
        .map((f) => relative(this.workspaceRoot, f))
      const status = await gitStatus(this.workspaceRoot, files)
      if (status === null) {
        if (!force)
          why.push(
            'git is not available here to confirm the catalog files are unchanged; pass force to go ahead without it'
          )
      } else if (status)
        why.push(
          `the catalog files have uncommitted changes; commit or stash them first:\n${status}`
        )
    }
    if (why.length)
      throw new Error(`Refusing to remove unused keys: ${why.join('; ')}`)
    for (const c of targets) {
      const gone = new Set(c.unused)
      const written: string[] = []
      for (const path of paths.get(c.catalog)!) {
        const raw = JSON.parse(await readFile(path, 'utf-8')) as Record<
          string,
          unknown
        >
        const kept = Object.fromEntries(
          Object.entries(raw).filter(([k]) => !gone.has(k))
        )
        if (Object.keys(kept).length !== Object.keys(raw).length) {
          await writeCatalog(path, kept)
          written.push(relative(this.workspaceRoot, path))
        }
      }
      report.removed.push({
        catalog: c.catalog,
        keys: c.unused,
        files: written,
      })
    }
    return report
  }

  /**
   * Read-only: for each key of each catalog, the source files and workspace packages that reference it
   * (from `scanMessageUsage`). A key nobody uses has empty lists. Computed access to the namespace is
   * reported in `computed`; the per-key lists are then only a lower bound.
   */
  async usage(
    app?: string,
    { catalog }: { catalog?: string } = {}
  ): Promise<I18nUsageReport> {
    const scan = scanMessageUsage(this.workspaceRoot)
    const report: I18nUsageReport = {
      files: scan.files,
      computed: scan.computed,
      unparsed: scan.unparsed,
      apps: [],
    }
    for (const appDir of app
      ? [await this.appDir(app)]
      : await this.appDirs()) {
      const settings = await this.readSettings(appDir)
      const all = this.catalogDirs(appDir, settings)
      const entry: I18nUsageReport['apps'][number] = {
        app: relative(this.workspaceRoot, appDir),
        duplicates: await this.findDuplicates(all, settings),
        catalogs: [],
      }
      for (const dir of catalog
        ? [this.findCatalog(all, appDir, catalog)]
        : all) {
        const keys = new Set<string>()
        for (const values of Object.values(await this.readCatalogs(dir)))
          for (const k of Object.keys(values)) keys.add(k)
        entry.catalogs.push({
          catalog: this.catalogName(dir),
          keys: [...keys].sort().map((key) => {
            const files = [...(scan.usedIn.get(key) ?? [])]
              .map((f) => relative(this.workspaceRoot, f).split(sep).join('/'))
              .sort()
            return {
              key,
              files,
              packages: [...new Set(files.map(packageOf))].sort(),
            }
          }),
        })
      }
      report.apps.push(entry)
    }
    return report
  }

  /**
   * Moves keys from the catalog that holds them to `to`, all or nothing. Every locale file of the source
   * that has the key gives its text to the same locale file of the target (`$schema` and other entries
   * stay; the key is removed from the source in place, and target files are rewritten key-sorted like
   * `setKey` does). A target locale the source has no text for gets `%i18n-missing% <base text>`. A
   * locale file the target lacks but the source has is created the way `addLocale` seeds one: every
   * other base key of the target is included, marked, and the locale is registered. Everything is
   * computed first; any refusal throws before a file is touched, and a failed write restores the files
   * already written.
   */
  async move(app: string, keys: string[], to: string): Promise<I18nMoveResult> {
    const appDir = await this.appDir(app)
    const settings = await this.readSettings(appDir)
    await this.assertNoDuplicates(appDir, settings, app)
    const baseLocale = settings.baseLocale ?? 'en'
    const dirs = this.catalogDirs(appDir, settings)
    const target = this.findCatalog(dirs, appDir, to)
    const wanted = [...new Set(keys)]
    if (!wanted.length) throw new Error('Name at least one key to move')

    const raw = new Map<string, Record<string, Record<string, unknown>>>()
    for (const dir of dirs) raw.set(dir, await this.readRawCatalogs(dir))
    const holds = (dir: string, key: string) =>
      Object.values(raw.get(dir)!).some((c) => isMessage(c[key]))
    const problems: string[] = []
    const sourceOf = new Map<string, string>()
    for (const key of wanted) {
      const holder = dirs.find((d) => holds(d, key))
      if (!holder) problems.push(`${key} is in no catalog of ${app}`)
      else if (holder === target)
        problems.push(`${key} is already in ${this.catalogName(target)}`)
      else sourceOf.set(key, holder)
    }
    if (problems.length) throw new Error(problems.join('; '))

    // Next file contents; the source files keep their order, the target files are sorted.
    const next = new Map<string, Record<string, unknown>>()
    const edit = (dir: string, locale: string) => {
      const path = this.catalogPath(dir, locale)
      if (!next.has(path)) next.set(path, { ...(raw.get(dir)![locale] ?? {}) })
      return next.get(path)!
    }
    const targetLocales = raw.get(target)!
    const created = new Set<string>()
    const moved: I18nMoveResult['moved'] = []
    for (const key of wanted) {
      const source = sourceOf.get(key)!
      const sourceLocales = raw.get(source)!
      const baseText = sourceLocales[baseLocale]?.[key]
      if (!isMessage(baseText) || !messageText(baseText).trim())
        throw new Error(
          `${key} has no ${baseLocale} (base locale) text in ${this.catalogName(source)}`
        )
      const travelled: string[] = []
      for (const [locale, values] of Object.entries(sourceLocales)) {
        const text = values[key]
        if (!isMessage(text)) continue
        travelled.push(locale)
        if (!targetLocales[locale]) created.add(locale)
        edit(target, locale)[key] = text
        delete edit(source, locale)[key]
      }
      const marked: string[] = []
      for (const locale of Object.keys(targetLocales))
        if (!travelled.includes(locale)) {
          edit(target, locale)[key] = markedCopy(baseText)
          marked.push(locale)
        }
      moved.push({
        key,
        from: this.catalogName(source),
        locales: travelled,
        marked,
      })
    }
    // A created locale is seeded like addLocale: the target's other base keys, marked.
    const targetBase = await this.baseCatalog(target, settings)
    for (const locale of created) {
      const content = edit(target, locale)
      for (const k of Object.keys(targetBase))
        if (!(k in content)) content[k] = markedCopy(targetBase[k]!)
    }
    const writes: { path: string; text: string }[] = []
    for (const [path, content] of next) {
      const inTarget = dirname(path) === target
      const ordered = inTarget
        ? Object.fromEntries(
            Object.keys(content)
              .sort()
              .map((k) => [k, content[k]])
          )
        : content
      writes.push({ path, text: catalogText(ordered) })
    }
    const before = new Map<string, string | null>()
    for (const { path } of writes)
      before.set(path, await readFile(path, 'utf-8').catch(() => null))
    try {
      for (const { path, text } of writes) await writeFile(path, text, 'utf-8')
    } catch (error) {
      for (const [path, text] of before)
        if (text === null) await rm(path, { force: true }).catch(() => {})
        else await writeFile(path, text, 'utf-8').catch(() => {})
      throw error
    }
    for (const locale of created) await this.registerLocale(appDir, locale)
    return {
      app,
      to: this.catalogName(target),
      moved,
      created: [...created]
        .sort()
        .map((l) => relative(this.workspaceRoot, this.catalogPath(target, l))),
      files: writes.map((w) => relative(this.workspaceRoot, w.path)).sort(),
    }
  }

  private assertSamePlaceholders(
    key: string,
    locale: string,
    base: string[],
    text: I18nMessage,
    baseLocale: string,
    kept = false
  ): void {
    const found = messagePlaceholders(text)
    if (found.join() === base.join()) return
    const show = (p: string[]) =>
      p.length ? p.map((n) => `{${n}}`).join(' ') : 'none'
    throw new Error(
      `${key}: ${locale} uses ${show(found)} but ${baseLocale} uses ${show(base)}${kept ? `; give ${locale} a new text too` : ''}`
    )
  }

  /** Locale files of a catalog exactly as stored, `$schema` and all. */
  private async readRawCatalogs(
    dir: string
  ): Promise<Record<string, Record<string, unknown>>> {
    const out: Record<string, Record<string, unknown>> = {}
    for (const file of (
      await readdir(dir).catch(() => [] as string[])
    ).sort()) {
      const locale = file.slice(0, -'.json'.length)
      if (!file.endsWith('.json') || !LOCALE_RE.test(locale)) continue
      out[locale] = JSON.parse(await readFile(join(dir, file), 'utf-8'))
    }
    return out
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

  private async readApp(appDir: string): Promise<I18nApp> {
    const settings = await this.readSettings(appDir)
    const dirs = this.catalogDirs(appDir, settings)
    const catalogs: I18nCatalogDir[] = []
    for (const dir of dirs)
      catalogs.push({
        catalog: this.catalogName(dir),
        locales: await this.readCatalogs(dir),
      })
    const locales: Record<string, I18nCatalog> = {}
    for (const c of catalogs)
      for (const [locale, entries] of Object.entries(c.locales))
        locales[locale] = { ...locales[locale], ...entries }
    return {
      app: relative(this.workspaceRoot, appDir),
      messagesDir: catalogs[0]!.catalog,
      baseLocale: settings.baseLocale ?? 'en',
      defaultLocale: await this.readDefaultLocale(appDir),
      locales,
      catalogs,
      duplicates: await this.findDuplicates(dirs, settings),
    }
  }

  /** One directory per `pathPattern`, absolute, de-duplicated, in settings order. */
  private catalogDirs(appDir: string, settings: InlangSettings): string[] {
    const raw = settings['plugin.inlang.messageFormat']?.pathPattern
    const patterns = (Array.isArray(raw) ? raw : [raw]).filter(
      (p): p is string => typeof p === 'string' && p.length > 0
    )
    if (!patterns.length) patterns.push('./messages/{locale}.json')
    return [
      ...new Set(
        patterns.map((p) =>
          dirname(resolve(appDir, p.replace('{locale}', 'x')))
        )
      ),
    ]
  }

  private catalogName(dir: string): string {
    return relative(this.workspaceRoot, dir)
  }

  private findCatalog(dirs: string[], appDir: string, catalog: string): string {
    const abs = [resolve(this.workspaceRoot, catalog), resolve(appDir, catalog)]
    const found = dirs.find((d) => abs.includes(d))
    if (!found)
      throw new Error(
        `Unknown catalog "${catalog}"; this app has ${dirs.map((d) => this.catalogName(d)).join(', ')}`
      )
    return found
  }

  /** Resolves the one catalog a write targets, refusing to guess between several. */
  private async pickCatalog(
    appDir: string,
    settings: InlangSettings,
    dirs: string[],
    catalog?: string,
    content?: I18nCatalog
  ): Promise<string> {
    if (catalog) return this.findCatalog(dirs, appDir, catalog)
    if (dirs.length === 1) return dirs[0]!
    const keys = Object.keys(content ?? {})
    if (keys.length) {
      // An existing key lives in exactly one catalog; if they all share one, that is the target.
      const bases = await Promise.all(
        dirs.map(async (dir) => ({
          dir,
          base: await this.baseCatalog(dir, settings),
        }))
      )
      const owners = keys.map((k) =>
        bases.filter((b) => k in b.base).map((b) => b.dir)
      )
      if (owners.every((o) => o.length === 1 && o[0] === owners[0]![0]))
        return owners[0]![0]!
    }
    throw new Error(
      `This app has several message catalogs (${dirs.map((d) => this.catalogName(d)).join(', ')}); say which one with catalog`
    )
  }

  private async findDuplicates(
    dirs: string[],
    settings: InlangSettings
  ): Promise<I18nDuplicateKey[]> {
    const holders = new Map<string, Set<string>>()
    for (const dir of dirs)
      for (const entries of Object.values(await this.readCatalogs(dir)))
        for (const key of Object.keys(entries)) {
          if (!holders.has(key)) holders.set(key, new Set())
          holders.get(key)!.add(this.catalogName(dir))
        }
    return [...holders]
      .filter(([, c]) => c.size > 1)
      .map(([key, c]) => ({ key, catalogs: [...c] }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }

  private async assertNoDuplicates(
    appDir: string,
    settings: InlangSettings,
    label: string
  ): Promise<void> {
    const dirs = this.catalogDirs(appDir, settings)
    if (dirs.length < 2) return
    const dupes = await this.findDuplicates(dirs, settings)
    if (dupes.length)
      throw new Error(
        `${label} has keys in more than one catalog: ${dupes
          .map((d) => `${d.key} (${d.catalogs.join(', ')})`)
          .join('; ')}. Remove the duplicates first`
      )
  }

  private assertLocale(locale: string): void {
    if (!LOCALE_RE.test(locale))
      throw new Error(`"${locale}" is not a locale (e.g. en, de, pt-BR)`)
  }

  private catalogPath(dir: string, locale: string): string {
    this.assertLocale(locale)
    return join(dir, `${locale}.json`)
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
    dir: string,
    settings: InlangSettings
  ): Promise<I18nCatalog> {
    const path = this.catalogPath(dir, settings.baseLocale ?? 'en')
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
