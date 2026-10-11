import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { loadClassifications, type ResolvedDb } from './local-db.js'
import { openSqlite } from './sqlite/sqlite-extensions.js'
import { SqliteIntrospector } from './sqlite/sqlite-introspector.js'

export type DeclaredKind = 'bool' | 'date' | 'json'
type ColumnEntry = Record<string, unknown>
type ClassificationMap = Record<string, Record<string, ColumnEntry>>

export type AnnotateResult =
  | { status: 'not-sqlite' }
  | { status: 'up-to-date' }
  | { status: 'written'; file: string; added: string[] }
  | { status: 'skipped-manual'; file: string; missing: string[] }

/** The kind a SQLite declared column type (`BOOLEAN`, `TIMESTAMP`, `JSON`, ...) stands for. */
export function kindForDeclaredType(type: string): DeclaredKind | null {
  const t = type
    .trim()
    .toUpperCase()
    .replace(/\s*\(.*$/, '')
  if (t === 'BOOL' || t === 'BOOLEAN') return 'bool'
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIMESTAMPTZ'].includes(t))
    return 'date'
  if (t === 'JSON' || t === 'JSONB') return 'json'
  return null
}

const isAutoOnly = (map: ClassificationMap) =>
  Object.values(map).every((columns) =>
    Object.values(columns).every((entry) =>
      Object.keys(entry).every((key) => key === 'kind')
    )
  )

const EXPORT = 'export const classifications'

const render = (file: string, map: ClassificationMap): string | null => {
  const source = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const at = source.indexOf(EXPORT)
  if (source && (at < 0 || /\/\/|\/\*/.test(source.slice(at)))) return null
  const preamble = source
    ? source.slice(0, at)
    : `import type { DbClassificationMap } from '${relative(dirname(file), join(dirname(file), '..', '.pikku', 'db', 'classification-map.gen.d.ts')).replace(/\\/g, '/')}'\n\n`
  const satisfies = preamble.includes('DbClassificationMap')
    ? ' satisfies DbClassificationMap'
    : ''
  return `${preamble}${EXPORT} = ${JSON.stringify(map, null, 2)}${satisfies}\n`
}

/** Adds a `kind` to `db/annotations.ts` for every SQLite column declared BOOLEAN, DATE/DATETIME/TIMESTAMP or JSON that has none, leaving hand-written entries alone. */
export async function annotateDeclaredKinds(
  resolved: ResolvedDb
): Promise<AnnotateResult> {
  if (resolved.dialect !== 'sqlite') return { status: 'not-sqlite' }

  const derived: Record<string, Record<string, DeclaredKind>> = {}
  if (existsSync(resolved.dbFile)) {
    const db = await openSqlite(resolved, resolved.dbFile)
    try {
      const introspector = new SqliteIntrospector(db)
      for (const table of await introspector.listTables()) {
        for (const column of await introspector.getColumns(table)) {
          const kind = kindForDeclaredType(column.type)
          if (kind) (derived[table] ??= {})[column.name] = kind
        }
      }
    } finally {
      db.close()
    }
  }

  const file = resolved.classificationsFile
  const loaded = loadClassifications(file)
  if (
    existsSync(file) &&
    (loaded === undefined || typeof loaded !== 'object')
  ) {
    return {
      status: 'skipped-manual',
      file,
      missing: Object.entries(derived).flatMap(([table, columns]) =>
        Object.entries(columns).map(([c, k]) => `${table}.${c}: ${k}`)
      ),
    }
  }
  const current = structuredClone((loaded ?? {}) as ClassificationMap)

  const added: string[] = []
  const next: ClassificationMap = structuredClone(current)
  for (const [table, columns] of Object.entries(derived)) {
    for (const [column, kind] of Object.entries(columns)) {
      const entry = current[table]?.[column]
      if (entry?.kind || entry?.tsType) continue
      ;((next[table] ??= {})[column] ??= {}).kind = kind
      added.push(`${table}.${column}: ${kind}`)
    }
  }
  if (added.length === 0) return { status: 'up-to-date' }
  const rendered = isAutoOnly(current) ? render(file, next) : null
  if (!rendered) return { status: 'skipped-manual', file, missing: added }

  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, rendered, 'utf8')
  return { status: 'written', file, added }
}
