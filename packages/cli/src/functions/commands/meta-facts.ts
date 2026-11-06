import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { messageTexts, type I18nApp } from '@pikku/code-edit/i18n'
import { type MetaRow, sourcesReachedFrom } from './meta-lines.js'

/**
 * Project facts for the compact map: what an agent otherwise reads files to
 * learn before its first edit. How to use Pikku belongs to the skills and
 * `pikku doc`; everything here is read from this project, and a part the
 * project does not have prints nothing.
 */

const MAX_SOURCES = 3000
const MAX_NAMED_HOOKS = 6
const MAX_SHELLS = 2
const MAX_KEY_AREAS = 12
const RUNNER_ENV_WINDOW = 60

type Source = { file: string; text: string }

const isScannable = (name: string): boolean =>
  /\.tsx?$/.test(name) && !/\.(gen|test|spec|stories)\.|\.d\.ts$/.test(name)

/** A frontend's own code; generated and compiled files say nothing of its habits. */
export const readSources = (appDir: string): Source[] => {
  const dir = join(appDir, 'src')
  if (!existsSync(dir)) return []
  const sources: Source[] = []
  for (const entry of readdirSync(dir, { recursive: true }).sort()) {
    const path = String(entry)
    if (/(^|[\\/])(node_modules|paraglide)[\\/]/.test(path)) continue
    if (!isScannable(basename(path))) continue
    const file = join(dir, path)
    if (!statSync(file).isFile()) continue
    sources.push({ file, text: readFileSync(file, 'utf8') })
    if (sources.length >= MAX_SOURCES) break
  }
  return sources
}

type Import = { names: string[]; from: string }

const NAMED_IMPORT = /\bimport\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g
const NAMESPACE_IMPORT = /\bimport\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g

const importsOf = (sources: Source[]): Import[] =>
  sources.flatMap(({ text }) => [
    ...[...text.matchAll(NAMED_IMPORT)].map(([, names, from]) => ({
      names: names!
        .split(',')
        .map((name) => name.trim().split(/\s+as\s+/)[0]!)
        .filter((name) => name && !name.startsWith('type ')),
      from: from!,
    })),
    ...[...text.matchAll(NAMESPACE_IMPORT)].map(([, name, from]) => ({
      names: [`* as ${name}`],
      from: from!,
    })),
  ])

const mostCommon = (values: string[]): string | undefined => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** The module most imports come from, with every name the project takes from it. */
const usualImport = (imports: Import[]): Import | undefined => {
  const from = mostCommon(imports.map((entry) => entry.from))
  if (!from) return undefined
  const names = new Set(
    imports.filter((entry) => entry.from === from).flatMap((e) => e.names)
  )
  return { names: [...names], from }
}

const formatImport = ({ names, from }: Import): string =>
  names.length === 1 && names[0]!.startsWith('* as ')
    ? `import ${names[0]} from '${from}'`
    : `import { ${names.join(', ')} } from '${from}'`

export type AgentRunnerFacts = {
  runner: string
  source: string
  providers: string[]
  env: string[]
  models: string[]
}

/** The keys at the top level of the object literal that opens at `start`. */
const topLevelKeys = (text: string, start: number): string[] => {
  const keys: string[] = []
  let depth = 0
  for (let at = start; at < text.length; at++) {
    const char = text[at]!
    if ('{[('.includes(char)) depth++
    else if ('}])'.includes(char) && --depth === 0) break
    else if (depth === 1 && /[\w$'"]/.test(char)) {
      const key = /^['"]?([\w$-]+)['"]?\s*:/.exec(text.slice(at, at + 80))
      if (key) keys.push(key[1]!)
      const next = text.slice(at).search(/[,}\n]/)
      if (next > 0 && text[at + next] !== '}') at += next
      else if (next > 0) at += next - 1
    }
  }
  return keys
}

/**
 * What the agent runner of a services file was built with. Environment names
 * only, from the lines that build it: a value is never read or printed.
 */
export const agentRunnerFacts = (
  file: string,
  rootDir: string
): AgentRunnerFacts | null => {
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const built = /\bnew\s+(?:\w+\.)?(\w*AgentRunner)\s*\(\s*/.exec(text)
  if (!built) return null
  const opens = built.index + built[0].length
  const providers = text[opens] === '{' ? topLevelKeys(text, opens) : []
  const line = text.slice(0, built.index).split('\n').length
  const before = text
    .split('\n')
    .slice(Math.max(0, line - RUNNER_ENV_WINDOW), line)
  const env = before.flatMap((row) =>
    [...row.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map(
      ([, name]) => name!
    )
  )
  const models = providers.flatMap((provider) =>
    [...text.matchAll(new RegExp(`\\b${provider}/[\\w.-]*\\w`, 'g'))].map(
      ([model]) => model
    )
  )
  return {
    runner: built[1]!,
    source: relative(rootDir, file),
    providers,
    env: [...new Set(env)],
    models: [...new Set(models)],
  }
}

export type TextFacts = {
  app: string
  locales: string[]
  baseLocale: string
  defaultLocale: string | null
  source: string
  keys: number
  /** Another locale that repeats most of the base locale's text, and how much. */
  repeats?: { locale: string; keys: number }
  separator?: string
  areas: string[]
  usage?: Import
}

const textOf = (message: unknown): string =>
  messageTexts(message as never).join('\n')

const KEY_SEPARATORS = ['__', '.']

/** What one frontend's catalogs hold, and how its code reaches them. */
export const textFacts = (
  app: I18nApp,
  appDir: string,
  rootDir: string,
  sources: Source[] = readSources(appDir)
): TextFacts => {
  const base = Object.entries(app.locales[app.baseLocale] ?? {}).filter(
    ([key]) => !key.startsWith('$')
  )
  const keys = base.map(([key]) => key)
  const repeats = Object.keys(app.locales)
    .filter((locale) => locale !== app.baseLocale)
    .map((locale) => ({
      locale,
      keys: base.filter(
        ([key, message]) =>
          key in app.locales[locale]! &&
          textOf(app.locales[locale]![key]) === textOf(message)
      ).length,
    }))
    .sort((a, b) => b.keys - a.keys)[0]
  const separator = KEY_SEPARATORS.find(
    (candidate) =>
      keys.filter((key) => key.includes(candidate)).length * 2 > keys.length
  )
  const byArea = new Map<string, number>()
  for (const key of separator ? keys : []) {
    const area = key.split(separator!)[0]!
    byArea.set(area, (byArea.get(area) ?? 0) + 1)
  }
  const areas = [...byArea]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEY_AREAS)
    .map(([area]) => area)
  const fromMessages = importsOf(sources).filter((entry) =>
    entry.names.some((name) => name === 'm' || name === '* as m')
  )
  return {
    app: relative(rootDir, appDir),
    locales: [
      app.baseLocale,
      ...Object.keys(app.locales).filter((l) => l !== app.baseLocale),
    ],
    baseLocale: app.baseLocale,
    defaultLocale: app.defaultLocale,
    source: join(
      relative(rootDir, resolve(rootDir, app.messagesDir)),
      '{locale}.json'
    ),
    keys: keys.length,
    repeats: repeats && repeats.keys * 2 > keys.length ? repeats : undefined,
    separator,
    areas,
    usage: usualImport(fromMessages),
  }
}

export type FrontendFacts = {
  app: string
  routes?: string
  pages?: string
  shells: string[]
  nav?: string
  hooks?: Import
  rpc?: string
  uiKit?: { from: string; names: string[] }
}

const importSpecifier = (file: string): string =>
  basename(file).replace(/\.d\.ts$|\.tsx?$/, '')

const uiKitNames = (dir: string): string[] =>
  readdirSync(dir)
    .filter(isScannable)
    .map((name) => name.replace(/\.tsx?$/, ''))
    .filter((name) => name !== 'index')
    .sort()

const UI_IMPORT = /^(.+)\/ui\/[\w-]+$/

/** The component folder a frontend imports from, and what is in it. */
const uiKitOf = (
  imports: Import[],
  appDir: string,
  rootDir: string
): FrontendFacts['uiKit'] => {
  const kits = imports.flatMap(({ from }) => UI_IMPORT.exec(from)?.[1] ?? [])
  const kit = mostCommon(kits)
  if (!kit) return undefined
  const from = `${kit}/ui`
  const roots = kit.startsWith('@/')
    ? [join(appDir, 'src', kit.slice(2))]
    : [join(appDir, 'node_modules', kit), join(rootDir, 'node_modules', kit)]
  const dir = roots
    .flatMap((root) => [join(root, 'ui'), join(root, 'src', 'ui')])
    .find((candidate) => existsSync(candidate))
  if (dir) return { from, names: uiKitNames(dir) }
  const seen = imports.flatMap(({ from: specifier }) =>
    specifier.startsWith(`${from}/`) ? [basename(specifier)] : []
  )
  return { from, names: [...new Set(seen)].sort() }
}

/** Where a frontend's screens, shell, nav, client and components are. */
export const frontendFacts = (
  appDir: string,
  rootDir: string,
  screens: MetaRow[],
  rpcFile?: string,
  sources: Source[] = readSources(appDir)
): FrontendFacts | null => {
  if (sources.length === 0) return null
  const imports = importsOf(sources)
  const routesDir = join(appDir, 'src', 'routes')
  const pageFiles = screens.flatMap((row) => {
    const file = row.source ? resolve(rootDir, row.source) : null
    return file?.startsWith(`${appDir}${sep}`) ? [file] : []
  })
  const pages = mostCommon(
    pageFiles
      .filter((file) => !file.startsWith(`${routesDir}${sep}`))
      .map(dirname)
  )
  const shells = [...new Set(pageFiles)]
    .filter((file) => /<Outlet\b/.test(readFileSync(file, 'utf8')))
    .slice(0, MAX_SHELLS)
  const nav = shells
    .flatMap((shell) => [...sourcesReachedFrom(shell, appDir).keys()])
    .filter((file) => /nav|sidebar|menu/i.test(basename(file)))
    .sort((a, b) => basename(a).length - basename(b).length)[0]
  const generated = rpcFile ? importSpecifier(rpcFile) : null
  const rpc =
    generated &&
    sources.find(({ text }) =>
      new RegExp(`from\\s+['"][^'"]*${generated.replace(/\./g, '\\.')}`).test(
        text
      )
    )?.file
  const hooks = usualImport(
    imports
      .filter(({ from }) => !from.startsWith('@pikku/'))
      .map(({ names, from }) => ({
        names: names.filter((name) => name.startsWith('usePikku')),
        from,
      }))
      .filter(({ names }) => names.length > 0)
  )
  const relativeTo = (file: string) => relative(rootDir, file)
  return {
    app: relativeTo(appDir),
    routes: existsSync(routesDir) ? relativeTo(routesDir) : undefined,
    pages: pages ? relativeTo(pages) : undefined,
    shells: shells.map(relativeTo),
    nav: nav ? relativeTo(nav) : undefined,
    hooks,
    rpc: rpc ? relativeTo(rpc) : undefined,
    uiKit: uiKitOf(imports, appDir, rootDir),
  }
}

export type ProjectFacts = {
  agents: string[]
  models: Record<string, string>
  configFile: string
  runner: AgentRunnerFacts | null
  texts: TextFacts[]
  frontends: FrontendFacts[]
  /** Folder of the generated client, whichever frontend uses it. */
  generated?: string
}

const listOr = (names: string[], fallback: string): string =>
  names.length > 0 ? names.join(', ') : fallback

const runnerLine = (runner: AgentRunnerFacts): string =>
  [
    `agent runner: ${runner.runner} in ${runner.source}`,
    runner.providers.length > 0 && `providers ${runner.providers.join(', ')}`,
    runner.env.length > 0 && `env ${runner.env.join(', ')}`,
    runner.models.length > 0 && `models seen ${runner.models.join(', ')}`,
  ]
    .filter(Boolean)
    .join('; ')

const textLines = (text: TextFacts, several: boolean): string[] => {
  const samples = text.locales.map((locale) => `${locale}="…"`).join(' ')
  return [
    [
      `text: ${text.locales.join(', ')}; base ${text.baseLocale}`,
      text.defaultLocale && `opens in ${text.defaultLocale}`,
      `source ${text.source}, ${text.keys} keys`,
      text.repeats &&
        `${text.repeats.locale} has the same text as ${text.baseLocale} in ${text.repeats.keys}`,
    ]
      .filter(Boolean)
      .join('; '),
    `text use: ${text.usage ? `${formatImport(text.usage)}; ` : ''}add with pikku i18n key <name> ${samples}${several ? ` --app ${text.app}` : ''}`,
    ...(text.areas.length > 0
      ? [
          `keys <area>${text.separator}<name>; largest areas ${text.areas.join(', ')}`,
        ]
      : []),
  ]
}

const frontendLines = (
  frontend: FrontendFacts,
  generated?: string
): string[] => {
  const client = [
    frontend.hooks &&
      formatImport({
        ...frontend.hooks,
        names: frontend.hooks.names.slice(0, MAX_NAMED_HOOKS),
      }),
    frontend.rpc && `rpc client ${frontend.rpc}`,
    generated && `generated ${generated}`,
  ].filter(Boolean)
  const places = [
    frontend.routes && `routes ${frontend.routes}`,
    frontend.pages && `pages ${frontend.pages}`,
    frontend.shells.length > 0 && `shell ${frontend.shells.join(', ')}`,
    frontend.nav && `nav ${frontend.nav}`,
  ].filter(Boolean)
  return [
    ...(client.length > 0 ? [`client: ${client.join('; ')}`] : []),
    ...(places.length > 0 ? [`ui: ${places.join('; ')}`] : []),
    ...(frontend.uiKit
      ? [
          `ui kit (${frontend.uiKit.from}/<name>): ${frontend.uiKit.names.join(', ')}`,
        ]
      : []),
  ]
}

export const formatProjectFacts = (facts: ProjectFacts): string[] => {
  const aliases = Object.entries(facts.models).map(
    ([alias, model]) => `${alias}=${model}`
  )
  return [
    `agents: ${listOr(facts.agents, 'none yet')}`,
    `model aliases: ${listOr(aliases, 'none yet')}; add in ${facts.configFile} "models" as "alias": "provider/model"`,
    ...(facts.runner ? [runnerLine(facts.runner)] : []),
    ...facts.texts.flatMap((text) => textLines(text, facts.texts.length > 1)),
    ...facts.frontends.flatMap((frontend) =>
      frontendLines(frontend, facts.generated)
    ),
  ]
}
