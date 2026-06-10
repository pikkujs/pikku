import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MetaService } from '@pikku/core'

export type Classification = 'public' | 'private' | 'secret'

export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  classification: Classification
  foreignKey?: { table: string; column: string }
  enumType?: string
}

export interface DbTable {
  name: string
  columns: DbColumn[]
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

// ── Internal DB adapters ──────────────────────────────────────────────────────

interface SyncSqliteStatement {
  all(...params: unknown[]): unknown[]
}

interface SyncSqliteDatabase {
  prepare(sql: string): SyncSqliteStatement
  close(): void
}

export type OpenDbFn = (filename: string) => SyncSqliteDatabase

interface PgPool {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  end(): Promise<void>
}

export type PgPoolCtor = new (opts: {
  connectionString: string
  max: number
  connectionTimeoutMillis?: number
  idleTimeoutMillis?: number
}) => PgPool

// ── Column-row shapes ─────────────────────────────────────────────────────────

interface SqliteColumnRow {
  name: string
  type: string
  notnull: number
  pk: number
  dflt_value: unknown
  hidden: number
}

interface SqliteForeignKeyRow {
  from: string
  table: string
  to: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKIP_TABLES = new Set([
  'sqlite_sequence',
  'sql_migrations',
  'migrations',
  'pgmigrations',
])

const SKIP_SCHEMAS = new Set(['pgboss', 'pgboss_tenant'])

function classificationFor(visibility: string | undefined): Classification {
  if (
    visibility === 'public' ||
    visibility === 'private' ||
    visibility === 'secret'
  )
    return visibility
  return 'private'
}

interface AnnotationEntry {
  visibility?: 'public' | 'private' | 'secret'
  classification?: string
}

type AnnotationsJson = Record<string, Record<string, AnnotationEntry>>

async function loadAnnotations(
  metaService: MetaService
): Promise<Record<string, Record<string, { visibility?: string }>>> {
  const raw = await metaService.readFile('db/annotations.gen.json')
  if (!raw) return {}
  const data = JSON.parse(raw) as AnnotationsJson
  const result: Record<string, Record<string, { visibility?: string }>> = {}
  for (const [tableName, cols] of Object.entries(data)) {
    const key = camelToSnake(bareTableName(tableName))
    result[key] = {}
    for (const [col, entry] of Object.entries(cols)) {
      result[key][camelToSnake(col)] = { visibility: entry.visibility }
    }
  }
  return result
}

function bareTableName(name: string): string {
  const dot = name.indexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : name
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

// ── SQLite introspector ───────────────────────────────────────────────────────

async function introspectSqlite(
  dbFile: string,
  annotations: Record<string, Record<string, { visibility?: string }>>,
  openDb: OpenDbFn
): Promise<DbTable[]> {
  const db = openDb(dbFile)
  const tables: DbTable[] = []

  try {
    const tableRows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         ORDER BY name`
      )
      .all() as Array<{ name: string }>

    for (const { name: tableName } of tableRows) {
      if (SKIP_TABLES.has(tableName)) continue

      const tableAnns = annotations[tableName] ?? {}

      const fkRows = db
        .prepare(`PRAGMA foreign_key_list("${tableName.replace(/"/g, '""')}")`)
        .all() as SqliteForeignKeyRow[]
      const fkMap = new Map(
        fkRows.map((fk) => [fk.from, { table: fk.table, column: fk.to }])
      )

      const colRows = db
        .prepare(`PRAGMA table_xinfo("${tableName.replace(/"/g, '""')}")`)
        .all() as SqliteColumnRow[]

      const columns: DbColumn[] = colRows
        .filter((c) => c.hidden !== 1)
        .map((c) => {
          const col: DbColumn = {
            name: c.name,
            type: c.type,
            nullable: !Boolean(c.notnull) && c.pk === 0,
            isPrimaryKey: c.pk > 0,
            classification: classificationFor(tableAnns[c.name]?.visibility),
          }
          const fk = fkMap.get(c.name)
          if (fk) col.foreignKey = fk
          return col
        })

      tables.push({ name: tableName, columns })
    }
  } finally {
    db.close()
  }

  return tables
}

// ── Postgres introspector ─────────────────────────────────────────────────────

async function introspectPostgresEnums(pool: PgPool): Promise<DbEnum[]> {
  const result = await pool.query<{
    enum_name: string
    schema_name: string
    values: string[]
  }>(
    `SELECT t.typname AS enum_name,
            t.typnamespace::regnamespace::text AS schema_name,
            json_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typtype = 'e'
     GROUP BY t.typname, t.typnamespace
     ORDER BY schema_name, enum_name`
  )
  return result.rows.map((r) => ({
    name: r.enum_name,
    schema: r.schema_name,
    values: r.values,
  }))
}

async function introspectPostgres(
  connectionString: string,
  annotations: Record<string, Record<string, { visibility?: string }>>,
  Pool: PgPoolCtor
): Promise<{ tables: DbTable[]; enums: DbEnum[] }> {
  const pool = new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  })

  try {
    const [tablesResult, colsResult, fkResult] = await Promise.all([
      pool.query<{ table_schema: string; table_name: string }>(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           AND table_schema NOT LIKE 'pg_temp_%'
           AND table_type = 'BASE TABLE'
         ORDER BY table_schema, table_name`
      ),
      pool.query<{
        table_schema: string
        table_name: string
        column_name: string
        data_type: string
        udt_name: string
        is_nullable: string
        is_pk: boolean
      }>(
        `SELECT
           c.table_schema,
           c.table_name,
           c.column_name,
           c.data_type,
           c.udt_name,
           c.is_nullable,
           EXISTS(
             SELECT 1
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema    = kcu.table_schema
              AND tc.table_name      = kcu.table_name
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema    = c.table_schema
               AND tc.table_name      = c.table_name
               AND kcu.column_name    = c.column_name
           ) AS is_pk
         FROM information_schema.columns c
         WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           AND c.table_schema NOT LIKE 'pg_temp_%'
         ORDER BY c.table_schema, c.table_name, c.ordinal_position`
      ),
      pool.query<{
        table_schema: string
        table_name: string
        column_name: string
        foreign_table_schema: string
        foreign_table_name: string
        foreign_column_name: string
      }>(
        `SELECT kcu.table_schema,
                kcu.table_name,
                kcu.column_name,
                kcu2.table_schema  AS foreign_table_schema,
                kcu2.table_name   AS foreign_table_name,
                kcu2.column_name  AS foreign_column_name
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_catalog = rc.constraint_catalog
          AND kcu.constraint_schema  = rc.constraint_schema
          AND kcu.constraint_name    = rc.constraint_name
         JOIN information_schema.key_column_usage kcu2
           ON kcu2.constraint_catalog = rc.unique_constraint_catalog
          AND kcu2.constraint_schema  = rc.unique_constraint_schema
          AND kcu2.constraint_name    = rc.unique_constraint_name
          AND kcu2.ordinal_position   = kcu.ordinal_position
         ORDER BY kcu.table_schema, kcu.table_name, kcu.ordinal_position`
      ),
    ])

    const fkIndex = new Map<string, { table: string; column: string }>()
    for (const r of fkResult.rows) {
      const refTable =
        r.foreign_table_schema === 'public'
          ? r.foreign_table_name
          : `${r.foreign_table_schema}.${r.foreign_table_name}`
      fkIndex.set(`${r.table_schema}.${r.table_name}.${r.column_name}`, {
        table: refTable,
        column: r.foreign_column_name,
      })
    }

    const colIndex = new Map<string, typeof colsResult.rows>()
    for (const r of colsResult.rows) {
      const key = `${r.table_schema}.${r.table_name}`
      let arr = colIndex.get(key)
      if (!arr) {
        arr = []
        colIndex.set(key, arr)
      }
      arr.push(r)
    }

    const tables: DbTable[] = []
    for (const {
      table_schema: schema,
      table_name: tableName,
    } of tablesResult.rows) {
      if (SKIP_SCHEMAS.has(schema)) continue
      if (SKIP_TABLES.has(tableName)) continue

      const qualifiedName =
        schema === 'public' ? tableName : `${schema}.${tableName}`
      const tableAnns = annotations[bareTableName(qualifiedName)] ?? {}
      const colRows = colIndex.get(`${schema}.${tableName}`) ?? []

      const columns: DbColumn[] = colRows.map((r) => {
        const isUserDefined = r.data_type === 'USER-DEFINED'
        const col: DbColumn = {
          name: r.column_name,
          type: isUserDefined ? r.udt_name : r.data_type,
          nullable: r.is_nullable === 'YES',
          isPrimaryKey: Boolean(r.is_pk),
          classification: classificationFor(
            tableAnns[r.column_name]?.visibility
          ),
        }
        if (isUserDefined) col.enumType = r.udt_name
        const fk = fkIndex.get(`${schema}.${tableName}.${r.column_name}`)
        if (fk) col.foreignKey = fk
        return col
      })

      tables.push({ name: qualifiedName, columns })
    }

    const enums = await introspectPostgresEnums(pool)
    return { tables, enums }
  } finally {
    await pool.end()
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DbSchemaService {
  constructor(
    private readonly projectRoot: string,
    private readonly openDb: OpenDbFn | null,
    private readonly PgPool: PgPoolCtor | null,
    private readonly metaService: MetaService
  ) {}

  async getSchema(): Promise<DbSchema | null> {
    const annotations = await loadAnnotations(this.metaService)

    // SQLite: prefer .pikku-runtime/dev.db when it exists
    if (this.openDb) {
      const candidates = [
        join(this.projectRoot, '.pikku-runtime', 'dev.db'),
        join(this.projectRoot, 'dev.db'),
      ]
      const dbFile = candidates.find((f) => existsSync(f))
      if (dbFile) {
        const tables = await introspectSqlite(dbFile, annotations, this.openDb)
        return { tables, enums: [] }
      }
    }

    // Postgres: explicit env vars only — no config file sniffing
    const postgresUrl =
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      this.buildEnvPostgresUrl()
    if (postgresUrl && this.PgPool) {
      return await introspectPostgres(postgresUrl, annotations, this.PgPool)
    }

    return null
  }

  private buildEnvPostgresUrl(): string | null {
    const dbName = process.env.DB_NAME
    if (!dbName) return null
    const host = process.env.DB_HOST ?? 'localhost'
    const port = process.env.DB_PORT ?? '5432'
    const user = encodeURIComponent(process.env.DB_USER ?? 'postgres')
    const password = encodeURIComponent(process.env.DB_PASSWORD ?? '')
    return password
      ? `postgres://${user}:${password}@${host}:${port}/${dbName}`
      : `postgres://${user}@${host}:${port}/${dbName}`
  }
}
