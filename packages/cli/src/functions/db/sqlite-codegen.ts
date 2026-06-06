import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ColumnKind, CoercionMap } from './coercion-plugin.js'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

// ─── Local type aliases (mirror @pikku/core data-classification) ─────────────

type Classification = 'public' | 'private' | 'secret'
type AnonymizeStrategy = 'fake:email' | 'fake:name' | 'hash' | 'keep' | null

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

/**
 * Internal annotation for a single column.
 * `kind` and `classification` are independently optional — a column can have
 * only a kind annotation (e.g. `-- @date`) or only a classification annotation
 * (e.g. `-- @private:fake:email`), or both.
 */
interface ColAnnotation {
  kind?: ColumnKind
  /** TypeScript type string for @json columns, e.g. `string[]`. */
  tsType?: string
  classification?: Classification
  anonymize?: AnonymizeStrategy
}

/** Per-table, per-column annotation map built from migration SQL comments. */
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

function listTables(db: SyncSqliteDatabase): TableInfo[] {
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
function annotationFromName(colName: string): { kind: ColumnKind } | null {
  if (/_at$|_on$/.test(colName)) return { kind: 'date' }
  if (/^is_|^has_|^can_/.test(colName)) return { kind: 'bool' }
  return null
}

function parseStrategy(s: string | undefined): AnonymizeStrategy {
  if (!s) return null
  const valid = ['fake:email', 'fake:name', 'hash', 'keep'] as const
  return (valid as readonly string[]).includes(s)
    ? (s as AnonymizeStrategy)
    : null
}

/** Parse all recognised `@` tokens from a SQL comment string. */
function parseComment(comment: string): Partial<ColAnnotation> {
  const ann: Partial<ColAnnotation> = {}

  // Kind — @bool / @date / @json [TsType]
  if (/@bool\b/i.test(comment)) {
    ann.kind = 'bool'
  } else if (/@date\b/i.test(comment)) {
    ann.kind = 'date'
  } else {
    const jsonM = comment.match(/@json\b(?:\s+([^\s@]+))?/i)
    if (jsonM) {
      ann.kind = 'json'
      if (jsonM[1]) ann.tsType = jsonM[1].trim()
    }
  }

  // Classification — @public / @private[:strategy] / @secret[:strategy]
  const classM = comment.match(/@(public|private|secret)(?::([^\s@]+))?/i)
  if (classM) {
    ann.classification = classM[1].toLowerCase() as Classification
    ann.anonymize = parseStrategy(classM[2])
  }

  return ann
}

/**
 * Parse `-- @bool | @date | @json [TsType] | @public | @private[:strategy] | @secret[:strategy]`
 * inline annotations from migration SQL files.
 *
 * Multiple annotations can appear on the same comment line, e.g.:
 *   `deleted_at TIMESTAMP -- @date @private:keep`
 *
 * Covers both CREATE TABLE body lines and ALTER TABLE ... ADD [COLUMN] statements
 * so columns added in later migrations can also carry annotations.
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

  function mergeAnnotation(
    tableName: string,
    colName: string,
    partial: Partial<ColAnnotation>
  ): void {
    if (!partial.kind && partial.classification === undefined) return
    if (!result[tableName]) result[tableName] = {}
    result[tableName][colName] = { ...result[tableName][colName], ...partial }
  }

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf8')

    // ── CREATE TABLE body lines ──────────────────────────────────────────────
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
        // col_name TYPE ... -- comment (trailing comma optional)
        const lineMatch = trimmed.match(/^(\w+)\s+\w[^-]*--\s*(.+?)\s*,?\s*$/)
        if (!lineMatch) continue
        mergeAnnotation(
          tableName,
          lineMatch[1].toLowerCase(),
          parseComment(lineMatch[2])
        )
      }
    }

    // ── ALTER TABLE ... ADD [COLUMN] ... -- comment ──────────────────────────
    const alterPattern =
      /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+(?:COLUMN\s+)?"?(\w+)"?\s+\w[^;-]*--\s*(.+?)(?:;|$)/gim
    let alterMatch: RegExpExecArray | null
    while ((alterMatch = alterPattern.exec(content)) !== null) {
      mergeAnnotation(
        alterMatch[1].toLowerCase(),
        alterMatch[2].toLowerCase(),
        parseComment(alterMatch[3])
      )
    }
  }

  return result
}

// ─── Type expression ─────────────────────────────────────────────────────────

/** Plain select-type base (non-nullable, no brand) for the given column. */
function selectBase(
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  col: ColumnInfo
): string {
  if (annotation?.kind === 'bool') return 'boolean'
  if (annotation?.kind === 'date') return 'Date'
  if (annotation?.kind === 'json') return annotation.tsType ?? 'unknown'
  return mapType(col.type)
}

/** Plain insert/update-type base (non-nullable) for the given column. */
function insertBase(
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  col: ColumnInfo
): string {
  if (annotation?.kind === 'bool') return 'boolean | number'
  if (annotation?.kind === 'date') return 'Date | string'
  if (annotation?.kind === 'json') return annotation.tsType ?? 'unknown'
  return mapType(col.type)
}

/**
 * Build the TypeScript type string for a column in the emitted Kysely interface.
 *
 * `classification` controls branding in the SelectType slot:
 *   - `'public'`  → plain type, current behaviour (no brand)
 *   - `'private'` → `ColumnType<Private<T>, T, T>` — brand in select slot only
 *   - `'secret'`  → `ColumnType<Secret<T>, T, T>`
 *
 * Insert/update types are always the plain base type so callers never need to
 * construct a branded value for writes.
 */
function columnTypeExpression(
  col: ColumnInfo,
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  classification: Classification
): string {
  const nullable = !col.notnull && col.pk === 0
  const hasDefault = col.dflt_value !== null && col.dflt_value !== undefined
  const isAutoInt = col.pk === 1 && mapType(col.type) === 'number'
  const isGenerated = col.hidden === 2 || col.hidden === 3
  const isOptionalInsert = hasDefault || isAutoInt || isGenerated

  if (classification === 'public') {
    // Original behaviour — unchanged
    const wrap = (inner: string) =>
      isOptionalInsert ? `Generated<${inner}>` : inner

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
    const base = mapType(col.type)
    if (isAutoInt) return `Generated<${base}>`
    if (hasDefault || isGenerated)
      return `Generated<${base}${nullable ? ' | null' : ''}>`
    return nullable ? `${base} | null` : base
  }

  // Private / Secret: brand only the SelectType slot.
  // We always emit an explicit ColumnType<S, I, U> so the brand lives in S
  // and never leaks into insert/update types.
  const B = classification === 'secret' ? 'Secret' : 'Private'
  const sBase = selectBase(annotation, col)
  const iBase = insertBase(annotation, col)

  const selectT = nullable ? `${B}<${sBase}> | null` : `${B}<${sBase}>`
  const insertT = nullable
    ? `${iBase} | null${isOptionalInsert ? ' | undefined' : ''}`
    : `${iBase}${isOptionalInsert ? ' | undefined' : ''}`
  const updateT = nullable ? `${iBase} | null` : iBase

  return `ColumnType<${selectT}, ${insertT}, ${updateT}>`
}

// ─── Interface emitter ───────────────────────────────────────────────────────

function emitInterface(
  table: TableInfo,
  camelCase: boolean,
  explicitAnnotations: AnnotationMap
): string {
  const ifaceName = snakeToPascal(table.name)
  const tableCols = explicitAnnotations[table.name] ?? {}

  const fields = table.columns
    .map((col) => {
      const fieldName = camelCase ? snakeToCamel(col.name) : col.name
      const sqlAnn = tableCols[col.name] ?? null

      // Kind: explicit SQL annotation takes priority, then naming convention
      const kindAnn: { kind?: ColumnKind; tsType?: string } | null = sqlAnn?.kind
        ? { kind: sqlAnn.kind, tsType: sqlAnn.tsType }
        : annotationFromName(col.name)

      // Classification: explicit, else fail-closed to private
      const classification: Classification = sqlAnn?.classification ?? 'private'

      const type = columnTypeExpression(col, kindAnn, classification)
      const safeName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)
        ? fieldName
        : JSON.stringify(fieldName)
      return `  ${safeName}: ${type}`
    })
    .join('\n')

  return `export interface ${ifaceName} {\n${fields}\n}`
}

// ─── Manifest emitter ────────────────────────────────────────────────────────

function emitManifest(
  tables: TableInfo[],
  explicitAnnotations: AnnotationMap
): string {
  const tableEntries = tables
    .map((table) => {
      const tableCols = explicitAnnotations[table.name] ?? {}
      const colEntries = table.columns
        .map((col) => {
          const ann = tableCols[col.name]
          const classification: Classification = ann?.classification ?? 'private'
          const strategy = ann?.anonymize ?? null
          const strategyLiteral =
            strategy === null ? 'null' : `'${strategy}'`
          return (
            `      ${JSON.stringify(col.name)}: ` +
            `{ classification: '${classification}', anonymize_strategy: ${strategyLiteral} }`
          )
        })
        .join(',\n')
      return `    ${JSON.stringify(table.name)}: {\n${colEntries}\n    }`
    })
    .join(',\n')

  return [
    `// Generated by @pikku/cli — do not edit by hand.`,
    `// Run \`pikku db migrate\` to refresh.`,
    ``,
    `export const classificationManifest = {`,
    `  version: 1 as const,`,
    `  tables: {`,
    tableEntries,
    `  },`,
    `} as const`,
    ``,
  ].join('\n')
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CodegenOptions {
  outFile: string
  coercionFile: string
  manifestFile?: string
  camelCase?: boolean
  migrationsDir?: string
}

export interface CodegenResult {
  outFile: string
  coercionFile: string
  manifestFile?: string
  written: boolean
  coercionWritten: boolean
  manifestWritten: boolean
  tables: string[]
}

/**
 * Introspect the open SQLite database and emit:
 *   - `schema.d.ts`          Kysely DB type with classification brands
 *   - `coercion.gen.ts`      Runtime CoercionMap (date/bool/json coercion plugin)
 *   - `classification.gen.ts` Data-classification manifest (when manifestFile set)
 *
 * Column classification:
 *   - Default (no annotation)  → `Private<T>` in SelectType slot
 *   - `-- @public`             → plain `T`, no brand
 *   - `-- @private[:strategy]` → `Private<T>` (explicit)
 *   - `-- @secret[:strategy]`  → `Secret<T>`
 *
 * Kind annotations (`@bool`, `@date`, `@json`) and classification annotations
 * can appear on the same comment line and are parsed independently.
 * ALTER TABLE ADD COLUMN lines are also scanned so later-migration columns
 * can carry annotations.
 *
 * Returns `written: false` for any file whose on-disk content already matches.
 */
export function generateSchemaTypes(
  db: SyncSqliteDatabase,
  options: CodegenOptions
): CodegenResult {
  const camelCase = options.camelCase ?? true
  const tables = listTables(db)

  const explicitAnnotations = options.migrationsDir
    ? parseAnnotations(options.migrationsDir)
    : {}

  // ── schema.d.ts ─────────────────────────────────────────────────────────
  const interfaces = tables
    .map((t) => emitInterface(t, camelCase, explicitAnnotations))
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
    `export type Private<T> = T & { readonly __pii__: 'private' }`,
    `export type Secret<T> = T & { readonly __pii__: 'secret' }`,
    ``,
    interfaces,
    ``,
    `export interface DB {`,
    dbEntries,
    `}`,
    ``,
  ].join('\n')

  // ── coercion.gen.ts (runtime map — kind only, not classification) ─────────
  // Build from explicit SQL annotations merged with naming conventions
  const coercionMap: CoercionMap = {}
  for (const table of tables) {
    const tableCols = explicitAnnotations[table.name] ?? {}
    for (const col of table.columns) {
      const sqlAnn = tableCols[col.name]
      const kind: ColumnKind | undefined =
        sqlAnn?.kind ?? annotationFromName(col.name)?.kind
      if (kind) {
        if (!coercionMap[table.name]) coercionMap[table.name] = {}
        coercionMap[table.name][col.name] = kind
      }
    }
  }

  const coercionEntries = Object.entries(coercionMap)
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

  // ── classification.gen.ts ────────────────────────────────────────────────
  const manifestBody = options.manifestFile
    ? emitManifest(tables, explicitAnnotations)
    : null

  // ── write files ──────────────────────────────────────────────────────────
  let existingSchema: string | null = null
  let existingCoercion: string | null = null
  let existingManifest: string | null = null
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
  if (options.manifestFile) {
    try {
      existingManifest = readFileSync(options.manifestFile, 'utf8')
    } catch {
      /* ok */
    }
  }

  const schemaChanged = existingSchema !== schemaBody
  const coercionChanged = existingCoercion !== coercionBody
  const manifestChanged =
    manifestBody !== null && existingManifest !== manifestBody

  if (schemaChanged) {
    mkdirSync(dirname(options.outFile), { recursive: true })
    writeFileSync(options.outFile, schemaBody, 'utf8')
  }
  if (coercionChanged) {
    mkdirSync(dirname(options.coercionFile), { recursive: true })
    writeFileSync(options.coercionFile, coercionBody, 'utf8')
  }
  if (manifestChanged && options.manifestFile && manifestBody) {
    mkdirSync(dirname(options.manifestFile), { recursive: true })
    writeFileSync(options.manifestFile, manifestBody, 'utf8')
  }

  return {
    outFile: options.outFile,
    coercionFile: options.coercionFile,
    manifestFile: options.manifestFile,
    written: schemaChanged,
    coercionWritten: coercionChanged,
    manifestWritten: manifestChanged,
    tables: tables.map((t) => t.name),
  }
}
