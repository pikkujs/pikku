import type { MetaService } from '@pikku/core'

export type Classification = 'public' | 'private' | 'pii' | 'secret'

export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  classification: Classification
  foreignKey?: { table: string; column: string }
  enumType?: string
  description?: string
}

export interface DbTable {
  name: string
  columns: DbColumn[]
  /**
   * Who declared this table: `app` for the project's own migrations, otherwise
   * the source label `pikku db generate` gave the migration that created it
   * (`better-auth`, `pikku-runtime`, an addon's package name).
   *
   * Absent when the schema JSON predates provenance — a consumer that needs to
   * tell framework tables apart has to fall back rather than assume `app`.
   */
  source?: string
  /** Human prose naming where the table's SQL came from, for a tooltip. */
  origin?: string
}

export interface DbEnum {
  name: string
  schema: string
  values: string[]
}

export interface DbSchema {
  tables: DbTable[]
  enums: DbEnum[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classificationFor(visibility: string | undefined): Classification {
  if (
    visibility === 'public' ||
    visibility === 'private' ||
    visibility === 'pii' ||
    visibility === 'secret'
  )
    return visibility
  return 'private'
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function bareTableName(name: string): string {
  const dot = name.indexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : name
}

interface AnnotationEntry {
  visibility?: 'public' | 'private' | 'pii' | 'secret'
  description?: string
}

type AnnotationsJson = Record<string, Record<string, AnnotationEntry>>

async function loadAnnotations(
  metaService: MetaService
): Promise<Record<string, Record<string, AnnotationEntry>>> {
  const raw = await metaService.readFile('db/annotations.gen.json')
  if (!raw) return {}
  const data = JSON.parse(raw) as AnnotationsJson
  const result: Record<string, Record<string, AnnotationEntry>> = {}
  for (const [tableName, cols] of Object.entries(data)) {
    const key = camelToSnake(bareTableName(tableName))
    result[key] = {}
    for (const [col, entry] of Object.entries(cols)) {
      result[key][camelToSnake(col)] = entry
    }
  }
  return result
}

// ── Raw JSON shape (from pikku-db-schema.gen.json) ────────────────────────────

interface RawColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  foreignKey?: { table: string; column: string }
}

interface RawTable {
  name: string
  columns: RawColumn[]
  source?: string
  origin?: string
}

interface RawSchema {
  tables: RawTable[]
  enums: DbEnum[]
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DbSchemaService {
  constructor(private readonly metaService: MetaService) {}

  async getSchema(): Promise<DbSchema | null> {
    const raw = await this.metaService.readFile('db/pikku-db-schema.gen.json')
    if (!raw) return null

    const parsed = JSON.parse(raw) as RawSchema
    const annotations = await loadAnnotations(this.metaService)

    const tables: DbTable[] = parsed.tables.map((t) => {
      const tableAnns = annotations[bareTableName(t.name)] ?? {}
      const table: DbTable = {
        name: t.name,
        columns: t.columns.map((c) => {
          const ann = tableAnns[c.name]
          const col: DbColumn = {
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            isPrimaryKey: c.isPrimaryKey,
            classification: classificationFor(ann?.visibility),
          }
          if (ann?.description) col.description = ann.description
          if (c.foreignKey) col.foreignKey = c.foreignKey
          return col
        }),
      }
      if (t.source) table.source = t.source
      if (t.origin) table.origin = t.origin
      return table
    })

    return { tables, enums: parsed.enums }
  }
}
