import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ColumnKind, CoercionMap } from './coercion-plugin.js'
import type { DbIntrospector, ColumnInfo } from './db-introspector.js'
import {
  loadAnnotations,
  parseAnnotations,
  annotationFromName,
  type AnnotationMap,
  type ColAnnotation,
} from './annotation-parser.js'

// ─── Type aliases ─────────────────────────────────────────────────────────────

type Classification = 'public' | 'private' | 'pii' | 'secret'

// ─── Name helpers ─────────────────────────────────────────────────────────────

function snakeToPascal(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
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
  if (annotation?.kind === 'bool') return 'boolean'
  if (annotation?.kind === 'date') return 'Date'
  if (annotation?.kind === 'json') return annotation.tsType ?? 'unknown'
  return mapType(col.type)
}

function insertBase(
  annotation: { kind?: ColumnKind; tsType?: string } | null,
  col: ColumnInfo
): string {
  if (annotation?.kind === 'bool') return 'boolean | number'
  if (annotation?.kind === 'date') return 'Date | string'
  if (annotation?.kind === 'json') return annotation.tsType ?? 'unknown'
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
  explicitAnnotations: AnnotationMap
): string {
  const ifaceName = snakeToPascal(table.name)
  const tableCols = explicitAnnotations[bareTableName(table.name)] ?? {}

  const fields = table.columns
    .map((col) => {
      const fieldName = camelCase ? snakeToCamel(col.name) : col.name
      const sqlAnn: ColAnnotation | null = tableCols[col.name] ?? null

      const kindAnn: { kind?: ColumnKind; tsType?: string } | null =
        sqlAnn?.kind
          ? { kind: sqlAnn.kind, tsType: sqlAnn.tsType }
          : annotationFromName(col.name)

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
  const colEntry = `  security: 'public' | 'private' | 'pii' | 'secret' | 'encrypted'\n  classification?: 'fake:email' | 'fake:name' | 'hash' | 'keep'\n  description?: string`

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
  camelCase?: boolean
  rootDir?: string
  migrationsDir?: string
}

export interface CodegenResult {
  outFile: string
  coercionFile: string
  manifestFile?: string
  classificationMapFile?: string
  written: boolean
  coercionWritten: boolean
  manifestWritten: boolean
  classificationMapWritten: boolean
  tables: string[]
}

/**
 * Introspect `introspector` and emit:
 *   - `schema.d.ts`            Kysely DB type with classification brands
 *   - `coercion.gen.ts`        Runtime CoercionMap for date/bool/json coercion
 *   - `classification.gen.ts`  Data-classification manifest (when manifestFile set)
 */
export async function generateSchemaTypes(
  introspector: DbIntrospector,
  options: CodegenOptions
): Promise<CodegenResult> {
  const camelCase = options.camelCase ?? true

  const tableNames = await introspector.listTables()
  const tables: TableSchema[] = await Promise.all(
    tableNames.map(async (name) => ({
      name,
      columns: await introspector.getColumns(name),
    }))
  )

  const explicitAnnotations = options.rootDir
    ? loadAnnotations(options.rootDir, options.migrationsDir)
    : options.migrationsDir
      ? parseAnnotations(options.migrationsDir)
      : {}

  // ── schema.d.ts ─────────────────────────────────────────────────────────────
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
    `export type Private<T> = T & { readonly __classification__: 'private' }`,
    `export type Pii<T> = T & { readonly __classification__: 'pii' }`,
    `export type Secret<T> = T & { readonly __classification__: 'secret' }`,
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
      const sqlAnn = tableCols[col.name]
      const kind: ColumnKind | undefined =
        sqlAnn?.kind ?? annotationFromName(col.name)?.kind
      if (kind) {
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
    const [fkResults, enums] = await Promise.all([
      Promise.all(tableNames.map((name) => introspector.getForeignKeys(name))),
      introspector.listEnums(),
    ])
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

  const schemaChanged = existingSchema !== schemaBody
  const coercionChanged = existingCoercion !== coercionBody
  const manifestChanged =
    manifestBody !== null && existingManifest !== manifestBody
  const classificationMapChanged =
    classificationMapBody !== null &&
    existingClassificationMap !== classificationMapBody
  const schemaJsonChanged =
    schemaJsonBody !== null && existingSchemaJson !== schemaJsonBody

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

  return {
    outFile: options.outFile,
    coercionFile: options.coercionFile,
    manifestFile: options.manifestFile,
    classificationMapFile: options.classificationMapFile,
    written: schemaChanged,
    coercionWritten: coercionChanged,
    manifestWritten: manifestChanged,
    classificationMapWritten: classificationMapChanged,
    tables: tables.map((t) => t.name),
  }
}
