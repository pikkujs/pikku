import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

/**
 * One thing `pikku meta` knows, in the shape every short listing shares:
 * what it is called, one line about it, and where it lives.
 */
export type MetaRow = {
  kind: string
  name: string
  detail?: string
  source?: string
}

const clip = (text: string, length: number): string =>
  text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text

const WORD = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{Lo}+|\p{N}+/gu

/** Splits camelCase, snake_case, kebab-case and paths into lowercase words. */
export const metaWords = (text: string): string[] =>
  (text.match(WORD) ?? []).map((word) => word.toLowerCase())

/** Search terms from the command line. Several terms, or `a|b`, mean any of them. */
export const parseMetaTerms = (args: string[]): string[] =>
  args
    .flatMap((arg) => arg.split('|'))
    .map((term) => term.trim())
    .filter((term) => metaWords(term).length > 0)

export const META_MATCH_LIMIT = 20

const TIER = { none: 0, text: 1, nameWords: 2, exactName: 3 }

const termTier = (term: string, row: MetaRow): number => {
  if (row.name.toLowerCase() === term.toLowerCase()) return TIER.exactName
  const wanted = metaWords(term)
  const found = (text: string): boolean => {
    const words = metaWords(text)
    return wanted.every((w) => words.some((word) => word.startsWith(w)))
  }
  if (found(row.name)) return TIER.nameWords
  if (found(`${row.detail ?? ''} ${row.source ?? ''}`)) return TIER.text
  return TIER.none
}

/**
 * How `pikku meta` finds things: every search goes through here. A row that
 * hits more terms comes first, then an exact name, then a word of the name,
 * then its description or path. Word prefixes count, so `invit` finds
 * `invitation`. Only the first few come back, with a count of the rest.
 */
export const matchMetaRows = (
  rows: MetaRow[],
  terms: string[],
  limit: number = META_MATCH_LIMIT
): { rows: MetaRow[]; rest: number } => {
  const matches = rows
    .map((row) => {
      const tiers = terms.map((term) => termTier(term, row))
      return {
        row,
        hits: tiers.filter((tier) => tier > TIER.none).length,
        best: Math.max(TIER.none, ...tiers),
      }
    })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits || b.best - a.best)
  return {
    rows: matches.slice(0, limit).map(({ row }) => row),
    rest: Math.max(0, matches.length - limit),
  }
}

const formatRow = (row: MetaRow, detailLength?: number): string =>
  [
    row.name,
    row.detail
      ? `— ${detailLength ? clip(row.detail, detailLength) : row.detail}`
      : '',
    row.source ? `(${row.source})` : '',
  ]
    .filter(Boolean)
    .join(' ')

/** One line per row: short enough to read whole, which is the reason it exists. */
export const formatMetaRows = (
  rows: MetaRow[],
  { withKind = false }: { withKind?: boolean } = {}
): string =>
  rows.length === 0
    ? '(none)'
    : rows
        .map((row) => `${withKind ? `${row.kind} ` : ''}${formatRow(row)}`)
        .join('\n')

/** Matches grouped by kind, the best kind first. */
export const formatMetaMatches = (
  { rows, rest }: { rows: MetaRow[]; rest: number },
  terms: string[]
): string => {
  if (rows.length === 0) return `No matches for: ${terms.join(', ')}`
  const groups = new Map<string, MetaRow[]>()
  for (const row of rows) {
    groups.set(row.kind, [...(groups.get(row.kind) ?? []), row])
  }
  return [
    ...[...groups].flatMap(([kind, group]) => [
      `${kind}:`,
      ...group.map((row) => `  ${formatRow(row, 100)}`),
    ]),
    ...(rest > 0 ? [`… ${rest} more. Use fewer or longer terms.`] : []),
  ].join('\n')
}

export type DbColumn = {
  name: string
  type: string
  nullable: boolean
  generated: boolean
  classification: 'private' | 'pii' | 'secret' | null
}

export type DbTable = { table: string; columns: DbColumn[] }

/** The first type argument of `Name<...>`, counting nested angle brackets. */
const firstTypeArgument = (type: string, name: string): string | null => {
  if (!type.startsWith(`${name}<`)) return null
  let depth = 0
  let quote: string | null = null
  const start = name.length + 1
  for (let index = start; index < type.length; index++) {
    const char = type[index]!
    if (quote) {
      if (char === quote) quote = null
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (char === '<' || char === '(' || char === '{') {
      depth++
    } else if (
      (char === '>' && type[index - 1] !== '=') ||
      char === ')' ||
      char === '}'
    ) {
      if (depth === 0) return type.slice(start, index)
      depth--
    } else if (char === ',' && depth === 0) {
      return type.slice(start, index)
    }
  }
  return null
}

const parseColumn = (name: string, declared: string): DbColumn => {
  let type = declared.trim()
  const generated = type.startsWith('Generated<')
  type = firstTypeArgument(type, 'Generated') ?? type
  type = firstTypeArgument(type, 'ColumnType') ?? type

  const nullable = /\|\s*null\b/.test(type)
  type = type.replace(/\s*\|\s*null\b/g, '').trim()

  const wrapper = /^(Private|Pii|Secret)</.exec(type)?.[1] as
    'Private' | 'Pii' | 'Secret' | undefined
  if (wrapper) type = firstTypeArgument(type, wrapper) ?? type

  return {
    name,
    type,
    nullable,
    generated,
    classification: wrapper
      ? (wrapper.toLowerCase() as DbColumn['classification'])
      : null,
  }
}

/** The members of `interface name { ... }`, one entry per member, wrapped lines joined. */
const interfaceMembers = (
  source: string,
  name: string
): { name: string; optional: boolean; type: string }[] | null => {
  const header = new RegExp(`interface\\s+${name}\\b[^{]*\\{`).exec(source)
  if (!header) return null

  const body: string[] = []
  let depth = 1
  for (const line of source
    .slice(header.index + header[0].length)
    .split('\n')) {
    for (const char of line) {
      if (char === '{') depth++
      if (char === '}') depth--
    }
    if (depth <= 0) break
    body.push(line)
  }

  const members: { name: string; optional: boolean; type: string }[] = []
  let nested = 0
  for (const line of body) {
    const trimmed = line.trim()
    if (nested === 0 && !/^(\/\/|\/\*|\*)/.test(trimmed)) {
      const member = /^(?:readonly\s+)?(['"]?)([\w$-]+)\1(\?)?:\s*(.*)$/.exec(
        trimmed
      )
      if (member) {
        members.push({
          name: member[2]!,
          optional: member[3] === '?',
          type: member[4]!,
        })
      } else if (members.length > 0 && trimmed && !/^[}\])]/.test(trimmed)) {
        members.at(-1)!.type += ` ${trimmed}`
      }
    }
    for (const char of line) {
      if (char === '{') nested++
      if (char === '}') nested--
    }
  }
  return members
}

/** Reads the tables out of the generated `DB` interface: it is what queries type against. */
export const parseDbSchema = (source: string): DbTable[] => {
  const tables = interfaceMembers(source, 'DB') ?? []
  return tables.map(({ name, type }) => ({
    table: name,
    columns: (interfaceMembers(source, type.trim()) ?? []).map((column) =>
      parseColumn(column.name, column.type)
    ),
  }))
}

export const dbTableRows = (tables: DbTable[]): MetaRow[] =>
  tables.map(({ table, columns }) => ({
    kind: 'table',
    name: table,
    detail: columns.map((column) => column.name).join(', '),
  }))

export const dbColumnRows = (table: DbTable): MetaRow[] =>
  table.columns.map((column) => ({
    kind: 'column',
    name: `${table.table}.${column.name}`,
    detail: [
      `${column.type}${column.nullable ? ' | null' : ''}`,
      column.generated ? 'generated' : '',
      column.classification ?? '',
    ]
      .filter(Boolean)
      .join(' '),
  }))

const SOURCE_EXTENSIONS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']

/** A local import as a file on disk; a package import resolves to nothing. */
export const resolveLocalImport = (
  specifier: string,
  fromFile: string,
  appDir: string
): string | null => {
  const base = specifier.startsWith('@/')
    ? join(appDir, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null
  if (!base) return null
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${base}${extension}`
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const IMPORT_FROM = /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g
const MAX_FILES_PER_SCREEN = 60

/** Every source a file reaches through its local imports, the file first. */
export const sourcesReachedFrom = (
  entry: string,
  appDir: string
): Map<string, string> => {
  const seen = new Map<string, string>()
  const queue = [entry]
  while (queue.length > 0 && seen.size < MAX_FILES_PER_SCREEN) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    const source = readFileSync(file, 'utf8')
    seen.set(file, source)
    for (const [, specifier] of source.matchAll(IMPORT_FROM)) {
      const next = resolveLocalImport(specifier!, file, appDir)
      if (next) queue.push(next)
    }
  }
  return seen
}

const RPC_CALL =
  /\b(?:usePikku\w*|invoke|startWorkflow|runWorkflow|\w*[rR]pc\w*)(?:<[^>()]*>)?\(\s*['"`]([\w:.-]+)['"`]/g

/** Every RPC a file reaches, following its local imports so a page's components count. */
export const rpcsReachedFrom = (entry: string, appDir: string): string[] => {
  const rpcs = new Set<string>()
  for (const source of sourcesReachedFrom(entry, appDir).values()) {
    for (const [, name] of source.matchAll(RPC_CALL)) rpcs.add(name!)
  }
  return [...rpcs].sort()
}

/** Where a route file renders: its `component`, resolved through its imports. */
const pageOfRoute = (
  source: string,
  routeFile: string,
  appDir: string
): string => {
  const component = /\bcomponent:\s*([A-Za-z_$][\w$]*)/.exec(source)?.[1]
  if (!component) return routeFile
  const imported = new RegExp(
    `import\\s+(?:\\{[^}]*\\b${component}\\b[^}]*\\}|${component})\\s+from\\s+['"]([^'"]+)['"]`
  ).exec(source)?.[1]
  return (
    (imported && resolveLocalImport(imported, routeFile, appDir)) || routeFile
  )
}

/**
 * Where a frontend's file routes live: the `routesDirectory` its vite config
 * names, else `src/routes`, else `src/pages`.
 */
export const routesDirOf = (appDir: string): string | null => {
  const viteConfig = readdirSync(appDir).find((file) =>
    /^vite\.config\.[cm]?[jt]s$/.test(file)
  )
  const configured = viteConfig
    ? /routesDirectory:\s*['"`]([^'"`]+)['"`]/.exec(
        readFileSync(join(appDir, viteConfig), 'utf8')
      )?.[1]
    : undefined
  return (
    [
      ...(configured ? [resolve(appDir, configured)] : []),
      join(appDir, 'src', 'routes'),
      join(appDir, 'src', 'pages'),
    ].find((dir) => existsSync(dir)) ?? null
  )
}

/** Screens of one frontend, from the routes its router declares. */
export const screenRows = (appDir: string, rootDir: string): MetaRow[] => {
  if (!existsSync(appDir)) return []
  const routesDir = routesDirOf(appDir)
  if (!routesDir) return []
  const rows: MetaRow[] = []
  for (const entry of readdirSync(routesDir, { recursive: true })) {
    const file = join(routesDir, String(entry))
    if (!/\.tsx?$/.test(file) || !statSync(file).isFile()) continue
    const source = readFileSync(file, 'utf8')
    const route = /createFileRoute\(\s*['"]([^'"]+)['"]/.exec(source)?.[1]
    if (!route) continue
    const page = pageOfRoute(source, file, appDir)
    rows.push({
      kind: 'screen',
      name: route,
      detail: rpcsReachedFrom(page, appDir).join(', ') || undefined,
      source: relative(rootDir, page),
    })
  }
  return rows.sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** The templates of an email folder, with the data each one takes. */
export const emailRows = (emailsDir: string, rootDir: string): MetaRow[] => {
  const templatesDir = join(emailsDir, 'templates')
  if (!existsSync(templatesDir)) return []
  const parts = new Map<string, string[]>()
  for (const file of readdirSync(templatesDir).sort()) {
    const name = file.split('.')[0]!
    parts.set(name, [...(parts.get(name) ?? []), file])
  }
  return [...parts].map(([name, files]) => {
    const data = new Set<string>()
    for (const file of files) {
      const source = readFileSync(join(templatesDir, file), 'utf8')
      for (const [, key] of source.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
        data.add(key!)
      }
    }
    return {
      kind: 'email',
      name,
      detail: [...data].sort().join(', ') || undefined,
      source: relative(rootDir, join(templatesDir, `${name}.html`)),
    }
  })
}

/** The locales an email folder carries, read off its files. */
export const emailLocales = (emailsDir: string): string[] => {
  const localesDir = join(emailsDir, 'locales')
  if (!existsSync(localesDir)) return []
  return readdirSync(localesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort()
}

const flattenMessages = (
  value: unknown,
  prefix: string,
  into: Map<string, string>
): void => {
  if (typeof value === 'string') {
    into.set(prefix, value)
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$schema') continue
      flattenMessages(child, prefix ? `${prefix}.${key}` : key, into)
    }
  }
}

/**
 * Translation keys of a folder of `<locale>.json` files, one row per key with
 * its text in every locale, so an English word reaches the German key.
 */
export const translationRows = (dir: string, rootDir: string): MetaRow[] => {
  if (!existsSync(dir)) return []
  const keys = new Map<string, string[]>()
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue
    const messages = new Map<string, string>()
    try {
      flattenMessages(
        JSON.parse(readFileSync(join(dir, file), 'utf8')),
        '',
        messages
      )
    } catch {
      continue // A broken locale file is the validator's to report, not a search's.
    }
    const locale = file.replace(/\.json$/, '')
    for (const [key, text] of messages) {
      keys.set(key, [...(keys.get(key) ?? []), `${locale}: ${text}`])
    }
  }
  return [...keys].map(([key, texts]) => ({
    kind: 'translation',
    name: key,
    detail: texts.join(' | '),
    source: relative(rootDir, dir),
  }))
}

/** The fields of a project interface, read from the file that declares it. */
export const interfaceRows = (
  kind: string,
  file: string,
  name: string
): MetaRow[] => {
  if (!existsSync(file)) return []
  const members = interfaceMembers(readFileSync(file, 'utf8'), name) ?? []
  return members.map((member) => ({
    kind,
    name: member.name,
    detail: `${member.optional ? 'optional ' : ''}${member.type.replace(/[;,]$/, '')}`,
  }))
}

export type CompactContext = {
  functions: {
    id: string
    description: string | null
    expose: boolean
    readonly: boolean
  }[]
  workflows: string[]
  permissions: string[]
  middleware: string[]
  wires: Record<string, number>
  tables: string[]
  screens: MetaRow[]
  /** Lines about this project that are not in its meta: see meta-facts. */
  facts?: string[]
  emails: string[]
}

const namesLine = (label: string, names: string[]): string[] =>
  names.length > 0 ? [`${label}: ${names.join(', ')}`] : []

/**
 * The map of a project, small enough to hand an agent up front. Names and a few
 * words each: `pikku meta <kind>` has the rest.
 */
export const formatCompactContext = (context: CompactContext): string => {
  const wires = Object.entries(context.wires)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type} ${count}`)
    .join(', ')
  return [
    'Search: pikku meta grep <terms>. Detail: pikku meta db|screens|services|emails.',
    ...namesLine('tables', context.tables),
    ...namesLine('workflows', context.workflows),
    ...namesLine('permissions', context.permissions),
    ...namesLine('middleware', context.middleware),
    ...namesLine('emails', context.emails),
    ...(wires ? [`wires: ${wires}`] : []),
    ...(context.facts ?? []),
    ...(context.screens.length > 0
      ? [
          'screens:',
          ...context.screens.map(
            (row) => `${row.name} ${basename(row.source ?? '', '.tsx')}`
          ),
        ]
      : []),
    `functions (${context.functions.length}; x exposed, r readonly):`,
    ...context.functions.map((fn) => {
      const flags = `${fn.expose ? 'x' : ''}${fn.readonly ? 'r' : ''}`
      return [
        fn.id,
        flags ? `[${flags}]` : '',
        fn.description ? clip(fn.description, 32) : '',
      ]
        .filter(Boolean)
        .join(' ')
    }),
  ].join('\n')
}
