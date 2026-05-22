import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { ColumnKind, CoercionMap } from '@pikku/kysely-node-sqlite'

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  pk: number
  dflt_value: unknown
  /** 0=regular, 1=virtual-table hidden, 2=virtual generated, 3=stored generated */
  hidden: number
}

interface TableInfo {
  name: string
  columns: ColumnInfo[]
}

/** Internal annotation: column kind plus an optional TS type string (for @json). */
interface ColAnnotation {
  kind: ColumnKind
  /** TypeScript type string, e.g. `string[]` or `Record<string, number>`. Only set for @json. */
  tsType?: string
}

/** Internal annotation map used during codegen. */
type AnnotationMap = Record<string, Record<string, ColAnnotation>>

const SKIP_TABLES = new Set(['sqlite_sequence', 'sql_migrations'])

function snakeToPascal(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function mapType(sqlType: string): string {
  const upper = sqlType.toUpperCase()
  if (upper.includes('INT')) return 'number'
  if (
    upper.includes('CHAR') ||
    upper.includes('CLOB') ||
    upper.includes('TEXT')
  ) {
    return 'string'
  }
  if (upper.includes('BLOB')) return 'Buffer'
  if (
    upper.includes('REAL') ||
    upper.includes('FLOA') ||
    upper.includes('DOUB')
  ) {
    return 'number'
  }
  if (upper.includes('NUMERIC') || upper.includes('DECIMAL')) return 'number'
  if (upper.includes('BOOL')) return 'number'
  return 'string'
}

function listTables(db: DatabaseSync): TableInfo[] {
  const tableRows = db
    .prepare(
      `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         ORDER BY name`
    )
    .all() as Array<{ name: string }>

  return tableRows
    .filter((t) => !SKIP_TABLES.has(t.name))
    .map((t) => {
      const allColumns = db
        .prepare(`PRAGMA table_xinfo(${escapeIdentifier(t.name)})`)
        .all() as unknown as ColumnInfo[]
      // hidden: 0=regular, 2=virtual generated, 3=stored generated — include all; skip 1 (vtab hidden)
      const columns = allColumns.filter((c) => c.hidden !== 1)
      return { name: t.name, columns }
    })
}

function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

// ─── Annotation parsing ──────────────────────────────────────────────────────

/**
 * Determine column kind from naming conventions:
 *   *_at / *_on            → date
 *   is_* / has_* / can_*   → bool
 */
function annotationFromName(colName: string): ColAnnotation | null {
  if (/_at$|_on$/.test(colName)) return { kind: 'date' }
  if (/^is_|^has_|^can_/.test(colName)) return { kind: 'bool' }
  return null
}

/**
 * Parse `-- @bool | @date | @json [TypescriptType]` inline annotations from
 * migration SQL files. The TypeScript type is optional and only meaningful for
 * `@json` — it controls the generated TypeScript type (e.g. `string[]`,
 * `Record<string, number>`).
 *
 * Returns an AnnotationMap: { table_name: { col_name: ColAnnotation } }.
 */
export function parseAnnotations(migrationsDir: string): AnnotationMap {
  let files: string[]
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  } catch {
    return {}
  }

  const result: AnnotationMap = {}

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf8')
    const createTablePattern =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(([^;]+)\)/gis
    let tableMatch: RegExpExecArray | null
    while ((tableMatch = createTablePattern.exec(content)) !== null) {
      const tableName = tableMatch[1].toLowerCase()
      const body = tableMatch[2]
      for (const line of body.split('\n')) {
        const trimmed = line.trim()
        if (/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)/i.test(trimmed))
          continue
        // Match: col_name TYPE ... -- @kind [optional ts type]
        const annotationMatch = trimmed.match(
          /^(\w+)\s+\w.*?--\s*@(bool|date|json)(?:\s+(.+?))?$/i
        )
        if (annotationMatch) {
          const colName = annotationMatch[1].toLowerCase()
          const kind = annotationMatch[2].toLowerCase() as ColumnKind
          const tsType = annotationMatch[3]?.trim() || undefined
          if (!result[tableName]) result[tableName] = {}
          result[tableName][colName] = {
            kind,
            tsType: kind === 'json' ? tsType : undefined,
          }
        }
      }
    }
  }
  return result
}

/**
 * Merge explicit SQL annotations with naming-convention-based ones.
 * Explicit annotations take precedence.
 */
function buildAnnotationMap(
  tables: TableInfo[],
  explicit: AnnotationMap
): AnnotationMap {
  const merged: AnnotationMap = {}
  for (const table of tables) {
    const explicitCols = explicit[table.name] ?? {}
    for (const col of table.columns) {
      const annotation = explicitCols[col.name] ?? annotationFromName(col.name)
      if (annotation) {
        if (!merged[table.name]) merged[table.name] = {}
        merged[table.name][col.name] = annotation
      }
    }
  }
  return merged
}

// ─── Type expression ─────────────────────────────────────────────────────────

function columnTypeExpression(
  col: ColumnInfo,
  annotation: ColAnnotation | null
): string {
  const nullable = !col.notnull && col.pk === 0
  const hasDefault = col.dflt_value !== null && col.dflt_value !== undefined
  const isAutoInt = col.pk === 1 && mapType(col.type) === 'number'
  const isGenerated = col.hidden === 2 || col.hidden === 3
  const wrap = (inner: string) =>
    hasDefault || isAutoInt || isGenerated ? `Generated<${inner}>` : inner

  if (annotation?.kind === 'bool') {
    const base = nullable ? 'boolean | null' : 'boolean'
    const rw = nullable ? 'boolean | number | null' : 'boolean | number'
    return wrap(`ColumnType<${base}, ${rw}, ${rw}>`)
  }

  if (annotation?.kind === 'date') {
    const base = nullable ? 'Date | null' : 'Date'
    const rw = nullable ? 'Date | string | null' : 'Date | string'
    return wrap(`ColumnType<${base}, ${rw}, ${rw}>`)
  }

  if (annotation?.kind === 'json') {
    const base = annotation.tsType
      ? nullable
        ? `${annotation.tsType} | null`
        : annotation.tsType
      : nullable
        ? 'unknown | null'
        : 'unknown'
    return wrap(base)
  }

  // Default: plain SQL-mapped type
  const base = mapType(col.type)
  if (isAutoInt) return `Generated<${base}>`
  if (hasDefault || isGenerated)
    return `Generated<${base}${nullable ? ' | null' : ''}>`
  return nullable ? `${base} | null` : base
}

// ─── Interface emitter ───────────────────────────────────────────────────────

function emitInterface(
  table: TableInfo,
  camelCase: boolean,
  annotations: AnnotationMap
): string {
  const ifaceName = snakeToPascal(table.name)
  const tableCols = annotations[table.name] ?? {}
  const fields = table.columns
    .map((col) => {
      const fieldName = camelCase ? snakeToCamel(col.name) : col.name
      const annotation = tableCols[col.name] ?? null
      const type = columnTypeExpression(col, annotation)
      const safeName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)
        ? fieldName
        : JSON.stringify(fieldName)
      return `  ${safeName}: ${type}`
    })
    .join('\n')
  return `export interface ${ifaceName} {\n${fields}\n}`
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CodegenOptions {
  outFile: string
  coercionFile: string
  camelCase?: boolean
  migrationsDir?: string
}

export interface CodegenResult {
  outFile: string
  coercionFile: string
  written: boolean
  coercionWritten: boolean
  tables: string[]
}

/**
 * Introspect the open SQLite database and emit a Kysely DB type to outFile
 * plus a CoercionMap to coercionFile.
 *
 * Columns are annotated via:
 *   1. Naming conventions (_at/_on → date; is_/has_/can_ → bool)
 *   2. Inline SQL comments: `col_name TYPE ... -- @bool|@date|@json [TsType]`
 *      For @json, an optional TypeScript type string controls the generated type.
 *
 * Returns `written: false` if the on-disk file already matches.
 */
export function generateSchemaTypes(
  db: DatabaseSync,
  options: CodegenOptions
): CodegenResult {
  const camelCase = options.camelCase ?? true
  const tables = listTables(db)

  const explicitAnnotations = options.migrationsDir
    ? parseAnnotations(options.migrationsDir)
    : {}
  const annotations = buildAnnotationMap(tables, explicitAnnotations)

  // ── schema.d.ts ──
  const interfaces = tables
    .map((t) => emitInterface(t, camelCase, annotations))
    .join('\n\n')

  const dbEntries = tables
    .map((t) => {
      const tableKey = camelCase ? snakeToCamel(t.name) : t.name
      const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableKey)
        ? tableKey
        : JSON.stringify(tableKey)
      return `  ${safe}: ${snakeToPascal(t.name)}`
    })
    .join('\n')

  const schemaBody = [
    `// Generated by @pikku/cli — do not edit by hand.`,
    `// Run \`pikku db migrate\` to refresh.`,
    ``,
    `import type { ColumnType } from 'kysely'`,
    ``,
    `export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>`,
    `  ? ColumnType<S, I | undefined, U>`,
    `  : ColumnType<T, T | undefined, T>`,
    ``,
    interfaces,
    ``,
    `export interface DB {`,
    dbEntries,
    `}`,
    ``,
  ].join('\n')

  // ── coercion.gen.ts (runtime map — only kind, not tsType) ──
  const runtimeMap: CoercionMap = {}
  for (const [table, cols] of Object.entries(annotations)) {
    for (const [col, ann] of Object.entries(cols)) {
      if (!runtimeMap[table]) runtimeMap[table] = {}
      runtimeMap[table][col] = ann.kind
    }
  }

  const coercionEntries = Object.entries(runtimeMap)
    .map(([table, cols]) => {
      const colEntries = Object.entries(cols)
        .map(([col, kind]) => `    "${col}": "${kind}"`)
        .join(',\n')
      return `  "${table}": {\n${colEntries}\n  }`
    })
    .join(',\n')

  const coercionBody = [
    `// Generated by @pikku/cli — do not edit by hand.`,
    `// Run \`pikku db migrate\` to refresh.`,
    ``,
    `export const coercionMap = {`,
    coercionEntries,
    `} as const`,
    ``,
  ].join('\n')

  // ── write files ──
  let existingSchema: string | null = null
  let existingCoercion: string | null = null
  try {
    existingSchema = readFileSync(options.outFile, 'utf8')
  } catch {
    /* ok */
  }
  try {
    existingCoercion = readFileSync(options.coercionFile, 'utf8')
  } catch {
    /* ok */
  }

  const schemaChanged = existingSchema !== schemaBody
  const coercionChanged = existingCoercion !== coercionBody

  if (schemaChanged) {
    mkdirSync(dirname(options.outFile), { recursive: true })
    writeFileSync(options.outFile, schemaBody, 'utf8')
  }
  if (coercionChanged) {
    mkdirSync(dirname(options.coercionFile), { recursive: true })
    writeFileSync(options.coercionFile, coercionBody, 'utf8')
  }

  return {
    outFile: options.outFile,
    coercionFile: options.coercionFile,
    written: schemaChanged,
    coercionWritten: coercionChanged,
    tables: tables.map((t) => t.name),
  }
}
