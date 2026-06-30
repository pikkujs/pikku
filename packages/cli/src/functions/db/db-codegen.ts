import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ColumnKind, CoercionMap } from './coercion-plugin.js'
import type { DbIntrospector, ColumnInfo } from './db-introspector.js'
import {
  loadAnnotations,
  nameSuggestsKind,
  type AnnotationMap,
  type ColAnnotation,
} from './annotation-parser.js'
import { ZOD_FORMATS, type ZodFormat } from './zod-codegen.js'

// ─── Type aliases ─────────────────────────────────────────────────────────────

type Classification = 'public' | 'private' | 'pii' | 'secret'
type Dialect = 'sqlite' | 'postgres'

/**
 * The column kind implied by the *real* DB type, dialect-aware. Postgres has
 * native temporal/boolean types so we can trust them; SQLite stores dates as
 * TEXT and booleans as INTEGER, so its declared types are indeterminate and we
 * derive nothing (return null). Used both to auto-type Postgres dates and to
 * detect name↔type contradictions for warnings.
 */
function realKind(dialect: Dialect, sqlType: string): ColumnKind | null {
  if (dialect !== 'postgres') return null
  const u = sqlType.toUpperCase()
  if (u.includes('TIMESTAMP') || u === 'DATE') return 'date'
  if (u === 'BOOLEAN' || u === 'BOOL') return 'bool'
  if (u === 'UUID') return 'uuid'
  return null
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

function snakeToPascal(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function tableToInterfaceName(name: string): string {
  return name
    .split('.')
    .map((part) => snakeToPascal(part))
    .join('')
}

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** Escape a value for embedding inside a single-quoted TS string literal. */
function escapeTsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// ─── Type mapping ─────────────────────────────────────────────────────────────

function mapType(sqlType: string): string {
  const upper = sqlType.toUpperCase()
  if (upper.includes('INT')) return 'number'
  if (
    upper.includes('CHAR') ||
    upper.includes('CLOB') ||
    upper.includes('TEXT') ||
    upper === 'UUID'
  )
    return 'string'
  if (upper.includes('BLOB') || upper === 'BYTEA') return 'Buffer'
  if (
    upper.includes('REAL') ||
    upper.includes('FLOA') ||
    upper.includes('DOUB')
  )
    return 'number'
  if (upper.includes('NUMERIC') || upper.includes('DECIMAL')) return 'number'
  // Postgres BOOLEAN type → boolean; SQLite BOOL (stores as int) → number
  if (upper === 'BOOLEAN') return 'boolean'
  if (upper.includes('BOOL')) return 'number'
  if (upper.includes('JSON')) return 'unknown'
  return 'string'
}

// ─── Type expression ─────────────────────────────────────────────────────────

function selectBase(
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  col: ColumnInfo
): string {
  // An explicit `tsType` is a general type override and wins over everything.
  if (annotation?.tsType) return annotation.tsType
  if (annotation?.kind === 'bool') return 'boolean'
  if (annotation?.kind === 'date') return 'Date'
  if (annotation?.kind === 'uuid') return 'Uuid'
  if (annotation?.kind === 'json') return 'unknown'
  return mapType(col.type)
}

function insertBase(
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  col: ColumnInfo
): string {
  if (annotation?.tsType) return annotation.tsType
  if (annotation?.kind === 'bool') return 'boolean | number'
  if (annotation?.kind === 'date') return 'Date | string'
  if (annotation?.kind === 'uuid') return 'Uuid'
  if (annotation?.kind === 'json') return 'unknown'
  return mapType(col.type)
}

function columnTypeExpression(
  col: ColumnInfo,
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  classification: Classification
): string {
  const nullable = !col.notNull && !col.pk
  const isAutoInt = col.pk && mapType(col.type) === 'number'
  const isOptionalInsert =
    col.defaultValue !== null || isAutoInt || Boolean(col.generated)

  if (classification === 'public') {
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
    if (annotation?.kind === 'uuid') {
      return wrap(nullable ? 'Uuid | null' : 'Uuid')
    }
    if (annotation?.tsType) {
      const base = nullable ? `${annotation.tsType} | null` : annotation.tsType
      return wrap(base)
    }
    if (annotation?.kind === 'json') {
      const base = nullable ? 'unknown | null' : 'unknown'
      return wrap(base)
    }
    const base = mapType(col.type)
    if (isAutoInt) return `Generated<${base}>`
    if (col.defaultValue !== null || col.generated)
      return `Generated<${base}${nullable ? ' | null' : ''}>`
    return nullable ? `${base} | null` : base
  }

  const B =
    classification === 'secret'
      ? 'Secret'
      : classification === 'pii'
        ? 'Pii'
        : 'Private'
  const sBase = selectBase(annotation, col)
  const iBase = insertBase(annotation, col)

  const selectT = nullable ? `${B}<${sBase}> | null` : `${B}<${sBase}>`
  const insertT = nullable
    ? `${iBase} | null${isOptionalInsert ? ' | undefined' : ''}`
    : `${iBase}${isOptionalInsert ? ' | undefined' : ''}`
  const updateT = nullable ? `${iBase} | null` : iBase

  return `ColumnType<${selectT}, ${insertT}, ${updateT}>`
}

// ─── Interface emitter ────────────────────────────────────────────────────────

interface TableSchema {
  name: string
  columns: ColumnInfo[]
}

/** Strip optional schema prefix (e.g. "app.user" → "user"). */
function bareTableName(name: string): string {
  const dot = name.indexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : name
}

function emitInterface(
  table: TableSchema,
  camelCase: boolean,
  explicitAnnotations: AnnotationMap,
  dialect: Dialect,
  enumByName: Map<string, string[]>,
  formatHints: Record<string, Record<string, ZodFormat>>,
  warnings: string[]
): string {
  const ifaceName = tableToInterfaceName(table.name)
  const bare = bareTableName(table.name)
  const tableCols = explicitAnnotations[bare] ?? {}

  const fields = table.columns
    .map((col) => {
      const fieldName = camelCase ? snakeToCamel(col.name) : col.name
      const ann: ColAnnotation | null = tableCols[col.name] ?? null

      // Effective typing kind: explicit annotation wins; otherwise, on Postgres
      // the *real* column type tells us (a timestamp genuinely is a Date). On
      // SQLite there is no native date storage (dates are TEXT), so nothing is
      // derived — `string` unless explicitly `kind: 'date'`.
      // On Postgres, real `timestamp`/`uuid` types carry through automatically
      // (no annotation needed); SQLite has neither native type so derives nothing.
      const real = realKind(dialect, col.type)
      const derived =
        !ann?.tsType && (real === 'date' || real === 'uuid') ? real : undefined
      const typingKind: ColumnKind | undefined = ann?.kind ?? derived

      // Warn (don't force) only on a genuine contradiction the real type can
      // prove: a column NAMED like a date/bool whose actual type disagrees
      // (e.g. `created_at` that is really a boolean in Postgres). On SQLite the
      // type is indeterminate, so there is nothing to contradict — no warning.
      if (!ann?.kind && !ann?.tsType) {
        const suggested = nameSuggestsKind(col.name)
        if (suggested && real && suggested !== real) {
          warnings.push(
            `Column "${bare}.${col.name}" is named like a ${suggested} but its DB type ` +
              `is ${col.type} (${real}). If intentional, set its kind in db/annotations.ts.`
          )
        }
      }

      // Enum columns are typed as a union of string literals — only when no
      // explicit `tsType`/`kind` overrides it. This reuses the `tsType` plumbing,
      // so it flows through both the public and classified branches. Values come
      // from a Postgres enum (`type` is 'USER-DEFINED', real values via `udtName`)
      // or, on SQLite, from a `CHECK (col IN (…))` constraint the introspector
      // parsed onto `col.enumValues`.
      const enumValues =
        col.enumValues ??
        (col.udtName ? enumByName.get(col.udtName) : undefined)
      const enumUnion =
        enumValues && enumValues.length > 0
          ? enumValues.map((v) => `'${escapeTsString(v)}'`).join(' | ')
          : null
      const effectiveTsType =
        ann?.tsType ?? (typingKind ? undefined : (enumUnion ?? undefined))

      const typeAnn: { kind?: ColumnKind; tsType?: string } | null =
        typingKind || effectiveTsType
          ? { kind: typingKind, tsType: effectiveTsType }
          : null

      // JSON/JSONB columns carry no inherent TypeScript shape — without a
      // concrete `tsType` they degrade to `unknown`, erasing type-safety at
      // every call site. Warn (non-blocking) so an AI or developer can give the
      // column a real type. An explicit `tsType: 'unknown'`/`'any'` is allowed
      // (the developer has acknowledged it) but is still flagged as discouraged.
      const isJsonColumn =
        col.type.toUpperCase().includes('JSON') || ann?.kind === 'json'
      if (isJsonColumn) {
        const resolved = selectBase(typeAnn, col)
        if (resolved === 'unknown' || resolved === 'any') {
          warnings.push(
            `Column "${bare}.${col.name}" is ${col.type} and will be typed as ` +
              `\`${resolved}\` — JSON/JSONB columns need a concrete TypeScript type. ` +
              `In db/annotations.ts add: "${col.name}": { kind: 'json', tsType: 'YourType' }.`
          )
        }
      }

      // A `format` validator refines the zod schema only and keeps the TS type
      // as `string`. It therefore applies only when the resolved select base is
      // plain `string`; on anything else (Date/Uuid/boolean/enum/unknown via
      // kind/tsType) it would contradict the type, so warn and skip.
      if (ann?.format) {
        const base = selectBase(typeAnn, col)
        if (base === 'string') {
          ;(formatHints[ifaceName] ??= {})[fieldName] = ann.format
        } else {
          warnings.push(
            `Column "${bare}.${col.name}": format '${ann.format}' ignored — its ` +
              `resolved type is ${base}, not string. Remove the conflicting kind/tsType.`
          )
        }
      }

      const classification: Classification = ann?.classification ?? 'private'
      const type = columnTypeExpression(col, typeAnn, classification)
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
  tables: TableSchema[],
  explicitAnnotations: AnnotationMap
): string {
  const tableEntries = tables
    .map((table) => {
      const tableCols = explicitAnnotations[bareTableName(table.name)] ?? {}
      const colEntries = table.columns
        .map((col) => {
          const ann = tableCols[col.name]
          const classification: Classification =
            ann?.classification ?? 'private'
          const strategy = ann?.anonymize ?? null
          const strategyLiteral = strategy === null ? 'null' : `'${strategy}'`
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

// ─── Classification map type emitter ─────────────────────────────────────────

/**
 * Emits a `DbClassificationMap` type declaration that the developer's
 * hand-authored `db/classifications.ts` must satisfy. Every table and column
 * present in the current schema appears as a required key — TypeScript will
 * flag added or removed columns.
 */
function emitClassificationMap(tables: TableSchema[]): string {
  const colEntry = [
    `  /** Privacy level. Defaults to 'private' when omitted. */`,
    `  security?: 'public' | 'private' | 'pii' | 'secret' | 'encrypted'`,
    `  /** Anonymize strategy used by \`pikku db anonymize\`. */`,
    `  classification?: 'fake:email' | 'fake:name' | 'hash' | 'keep'`,
    `  /** Column kind override for codegen coercion + typing. */`,
    `  kind?: 'date' | 'bool' | 'json' | 'uuid'`,
    `  /** TypeScript type override, e.g. \`string[]\` or \`MyJson\`. Wins over \`kind\`. */`,
    `  tsType?: string`,
    `  /** Zod string-format validator (keeps the TS type as \`string\`). */`,
    `  format?: ${Object.keys(ZOD_FORMATS)
      .map((f) => `'${f}'`)
      .join(' | ')}`,
    `  description?: string`,
  ].join('\n')

  // Group tables by schema (for postgres schema.table names)
  const schemaMap = new Map<string, Map<string, string[]>>()
  for (const table of tables) {
    const dot = table.name.indexOf('.')
    const schema = dot >= 0 ? table.name.slice(0, dot) : ''
    const bare = dot >= 0 ? table.name.slice(dot + 1) : table.name
    if (!schemaMap.has(schema)) schemaMap.set(schema, new Map())
    schemaMap.get(schema)!.set(
      bare,
      table.columns.map((c) => c.name)
    )
  }

  const lines: string[] = [
    `// Generated by @pikku/cli — do not edit by hand.`,
    `// Run \`pikku db migrate\` to refresh.`,
    `// Use this type in db/classifications.ts:`,
    `//   import type { DbClassificationMap } from './.pikku/db/classification-map.gen.d.ts'`,
    `//   export const classifications = { ... } satisfies DbClassificationMap`,
    ``,
    `export type ColumnEntry = {`,
    `${colEntry}`,
    `}`,
    ``,
    `export type DbClassificationMap = {`,
  ]

  for (const [schema, tables] of schemaMap) {
    if (schema) {
      lines.push(`  ${JSON.stringify(schema)}: {`)
      for (const [table, cols] of tables) {
        lines.push(`    ${JSON.stringify(table)}: {`)
        for (const col of cols) {
          lines.push(`      ${JSON.stringify(col)}: ColumnEntry`)
        }
        lines.push(`    }`)
      }
      lines.push(`  }`)
    } else {
      for (const [table, cols] of tables) {
        lines.push(`  ${JSON.stringify(table)}: {`)
        for (const col of cols) {
          lines.push(`    ${JSON.stringify(col)}: ColumnEntry`)
        }
        lines.push(`  }`)
      }
    }
  }

  lines.push(`}`, ``)
  return lines.join('\n')
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CodegenOptions {
  outFile: string
  coercionFile: string
  manifestFile?: string
  classificationMapFile?: string
  schemaJsonFile?: string
  /**
   * When set, emit a standalone module of bare enum unions (one
   * `export type <Table><Column>` per enum column) — independent of the wrapped
   * DB interface, so callers import a clean union instead of unwrapping
   * `ColumnType<Private<…>>`.
   */
  enumsFile?: string
  camelCase?: boolean
  rootDir?: string
  /** DB dialect — drives real-type-aware date typing. Defaults to 'sqlite'. */
  dialect?: Dialect
}

export interface CodegenResult {
  outFile: string
  coercionFile: string
  manifestFile?: string
  classificationMapFile?: string
  enumsFile?: string
  written: boolean
  coercionWritten: boolean
  manifestWritten: boolean
  classificationMapWritten: boolean
  enumsWritten: boolean
  tables: string[]
  /** Non-fatal codegen warnings (e.g. name looks like a date but unannotated). */
  warnings: string[]
  /**
   * Per-interface, per-field zod `format` overrides for the zod codegen. Keyed
   * by interface name (PascalCase) and field name (camelCase), matching the
   * shapes the zod emitter parses out of `schema.gen.ts`.
   */
  zodFormats: Record<string, Record<string, ZodFormat>>
}

/**
 * Introspect `introspector` and emit:
 *   - `schema.gen.ts`          Kysely DB type with classification brands
 *   - `coercion.gen.ts`        Runtime CoercionMap for date/bool/json coercion
 *   - `classification.gen.ts`  Data-classification manifest (when manifestFile set)
 */
/**
 * Bare string-literal enum types, independent of the wrapped DB interface. One
 * `export type <Table><Column>` per enum column — Postgres native enums (values
 * via `udtName`/`enumByName`) and SQLite `CHECK (col IN (…))` (values on
 * `col.enumValues`) alike. Lets app code and i18n reconciliation import a clean
 * union instead of unwrapping `ColumnType<Private<…>>` from the DB interface.
 */
function emitEnumsModule(
  tables: TableSchema[],
  enumByName: Map<string, string[]>
): string {
  const pascal = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
  const seen = new Set<string>()
  const lines: string[] = []
  for (const t of tables) {
    const tablePart = pascal(snakeToCamel(bareTableName(t.name)))
    for (const col of t.columns) {
      const values =
        col.enumValues ??
        (col.udtName ? enumByName.get(col.udtName) : undefined)
      if (!values || values.length === 0) continue
      const name = `${tablePart}${pascal(snakeToCamel(col.name))}`
      if (seen.has(name)) continue
      seen.add(name)
      const union = values.map((v) => `'${escapeTsString(v)}'`).join(' | ')
      lines.push(`export type ${name} = ${union}`)
    }
  }
  return [
    `// Generated by @pikku/cli — do not edit by hand.`,
    `// Run \`pikku db migrate\` to refresh.`,
    `//`,
    `// Bare enum unions from Postgres enums and SQLite CHECK (col IN (…)) constraints.`,
    ``,
    ...(lines.length ? lines : ['export {}']),
    ``,
  ].join('\n')
}

export async function generateSchemaTypes(
  introspector: DbIntrospector,
  options: CodegenOptions
): Promise<CodegenResult> {
  const camelCase = options.camelCase ?? true
  const dialect: Dialect = options.dialect ?? 'sqlite'

  const tableNames = await introspector.listTables()
  const tables: TableSchema[] = await Promise.all(
    tableNames.map(async (name) => ({
      name,
      columns: await introspector.getColumns(name),
    }))
  )

  const explicitAnnotations = options.rootDir
    ? loadAnnotations(options.rootDir)
    : {}

  // Enum types — used to auto-type enum columns as string-literal unions. Keyed
  // by both bare and schema-qualified name; `udtName` is bare so the bare key
  // resolves it (a one-line changeset note flags the cross-schema-name caveat).
  const enums = await introspector.listEnums()
  const enumByName = new Map<string, string[]>()
  for (const e of enums) {
    enumByName.set(e.name, e.values)
    enumByName.set(`${e.schema}.${e.name}`, e.values)
  }

  // ── schema.gen.ts ────────────────────────────────────────────────────────────
  const warnings: string[] = []
  const zodFormats: Record<string, Record<string, ZodFormat>> = {}
  const interfaces = tables
    .map((t) =>
      emitInterface(
        t,
        camelCase,
        explicitAnnotations,
        dialect,
        enumByName,
        zodFormats,
        warnings
      )
    )
    .join('\n\n')
  for (const w of warnings) console.warn(`[pikku db] ${w}`)

  const dbEntries = tables
    .map((t) => {
      const tableKey = camelCase ? snakeToCamel(t.name) : t.name
      const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableKey)
        ? tableKey
        : JSON.stringify(tableKey)
      return `  ${safe}: ${tableToInterfaceName(t.name)}`
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
    // `__classification__` is optional so plain values stay assignable to branded
    // columns (Kysely where/insert/update operands) while the brand remains
    // structurally detectable for the inspector's PKU910 output check. Keep this
    // in lockstep with `@pikku/core`'s data-classification.ts definitions.
    `export type Private<T> = T & { readonly __classification__?: 'private' }`,
    `export type Pii<T> = T & { readonly __classification__?: 'pii' }`,
    `export type Secret<T> = T & { readonly __classification__?: 'secret' }`,
    // Transparent alias (structurally a string, so plain strings stay
    // interchangeable) — its name lets the zod codegen emit `z.uuid()`.
    `export type Uuid = string`,
    ``,
    interfaces,
    ``,
    `export interface DB {`,
    dbEntries,
    `}`,
    ``,
  ].join('\n')

  // ── coercion.gen.ts ──────────────────────────────────────────────────────────
  const coercionMap: CoercionMap = {}
  for (const table of tables) {
    const tableCols = explicitAnnotations[bareTableName(table.name)] ?? {}
    for (const col of table.columns) {
      // Coercion is driven only by an explicit `kind` in db/annotations.ts —
      // no name inference. An unannotated `*_at` column is not coerced. `uuid`
      // is a string in both dialects, so it needs no runtime coercion.
      const kind: ColumnKind | undefined = tableCols[col.name]?.kind
      if (kind && kind !== 'uuid') {
        if (!coercionMap[table.name])
          coercionMap[table.name] = {} as Record<string, ColumnKind>
        coercionMap[table.name]![col.name] = kind
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

  // ── classification.gen.ts ───────────────────────────────────────────────────
  const manifestBody = options.manifestFile
    ? emitManifest(tables, explicitAnnotations)
    : null

  // ── classification-map.gen.d.ts ──────────────────────────────────────────────
  const classificationMapBody = options.classificationMapFile
    ? emitClassificationMap(tables)
    : null

  // ── pikku-db-schema.gen.json ─────────────────────────────────────────────────
  let schemaJsonBody: string | null = null
  if (options.schemaJsonFile) {
    const fkResults = await Promise.all(
      tableNames.map((name) => introspector.getForeignKeys(name))
    )
    const fkMap = new Map(tableNames.map((name, i) => [name, fkResults[i]!]))
    const jsonTables = tables.map((t) => ({
      name: t.name,
      columns: t.columns.map((c) => {
        const fk = fkMap.get(t.name)?.find((f) => f.column === c.name)
        return {
          name: c.name,
          type: c.type,
          nullable: !c.notNull && !c.pk,
          isPrimaryKey: c.pk,
          ...(fk
            ? {
                foreignKey: {
                  table: fk.foreignTable,
                  column: fk.foreignColumn,
                },
              }
            : {}),
        }
      }),
    }))
    schemaJsonBody =
      JSON.stringify({ tables: jsonTables, enums }, null, 2) + '\n'
  }

  // ── enums.gen.ts ─────────────────────────────────────────────────────────────
  const enumsBody = options.enumsFile
    ? emitEnumsModule(tables, enumByName)
    : null

  // ── write files ───────────────────────────────────────────────────────────────
  let existingSchema: string | null = null
  let existingCoercion: string | null = null
  let existingManifest: string | null = null
  let existingClassificationMap: string | null = null
  let existingSchemaJson: string | null = null
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
  if (options.classificationMapFile) {
    try {
      existingClassificationMap = readFileSync(
        options.classificationMapFile,
        'utf8'
      )
    } catch {
      /* ok */
    }
  }
  if (options.schemaJsonFile) {
    try {
      existingSchemaJson = readFileSync(options.schemaJsonFile, 'utf8')
    } catch {
      /* ok */
    }
  }
  let existingEnums: string | null = null
  if (options.enumsFile) {
    try {
      existingEnums = readFileSync(options.enumsFile, 'utf8')
    } catch {
      /* ok */
    }
  }

  const schemaChanged = existingSchema !== schemaBody
  const coercionChanged = existingCoercion !== coercionBody
  const manifestChanged =
    manifestBody !== null && existingManifest !== manifestBody
  const classificationMapChanged =
    classificationMapBody !== null &&
    existingClassificationMap !== classificationMapBody
  const schemaJsonChanged =
    schemaJsonBody !== null && existingSchemaJson !== schemaJsonBody
  const enumsChanged = enumsBody !== null && existingEnums !== enumsBody

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
  if (
    classificationMapChanged &&
    options.classificationMapFile &&
    classificationMapBody
  ) {
    mkdirSync(dirname(options.classificationMapFile), { recursive: true })
    writeFileSync(options.classificationMapFile, classificationMapBody, 'utf8')
  }
  if (schemaJsonChanged && options.schemaJsonFile && schemaJsonBody) {
    mkdirSync(dirname(options.schemaJsonFile), { recursive: true })
    writeFileSync(options.schemaJsonFile, schemaJsonBody, 'utf8')
  }
  if (enumsChanged && options.enumsFile && enumsBody) {
    mkdirSync(dirname(options.enumsFile), { recursive: true })
    writeFileSync(options.enumsFile, enumsBody, 'utf8')
  }

  return {
    outFile: options.outFile,
    coercionFile: options.coercionFile,
    manifestFile: options.manifestFile,
    classificationMapFile: options.classificationMapFile,
    enumsFile: options.enumsFile,
    written: schemaChanged,
    coercionWritten: coercionChanged,
    manifestWritten: manifestChanged,
    classificationMapWritten: classificationMapChanged,
    enumsWritten: enumsChanged,
    tables: tables.map((t) => t.name),
    warnings,
    zodFormats,
  }
}
