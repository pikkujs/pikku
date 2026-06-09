import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type Classification = 'public' | 'private' | 'secret'

export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  classification: Classification
  foreignKey?: { table: string; column: string }
}

export interface DbTable {
  name: string
  columns: DbColumn[]
}

export interface DbSchema {
  tables: DbTable[]
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

function classificationFor(visibility: string | undefined): Classification {
  if (
    visibility === 'public' ||
    visibility === 'private' ||
    visibility === 'secret'
  )
    return visibility
  return 'private'
}

function loadAnnotations(
  rootDir: string
): Record<string, Record<string, { visibility?: string }>> {
  const jsonPath = join(rootDir, 'db', 'annotations.gen.json')
  if (!existsSync(jsonPath)) return {}
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<
      string,
      Record<string, { visibility?: string }>
    >
  } catch {
    return {}
  }
}

function bareTableName(name: string): string {
  const dot = name.indexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : name
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
        .prepare(
          `PRAGMA foreign_key_list("${tableName.replace(/"/g, '""')}")`
        )
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

async function introspectPostgres(
  connectionString: string,
  annotations: Record<string, Record<string, { visibility?: string }>>,
  Pool: PgPoolCtor
): Promise<DbTable[]> {
  const pool = new Pool({ connectionString, max: 3 })

  try {
    const tablesResult = await pool.query<{
      table_schema: string
      table_name: string
    }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
         AND table_schema NOT LIKE 'pg_temp_%'
         AND table_type = 'BASE TABLE'
       ORDER BY table_schema, table_name`
    )

    const tables: DbTable[] = []

    for (const {
      table_schema: schema,
      table_name: tableName,
    } of tablesResult.rows) {
      if (SKIP_TABLES.has(tableName)) continue

      const qualifiedName =
        schema === 'public' ? tableName : `${schema}.${tableName}`
      const tableAnns = annotations[bareTableName(qualifiedName)] ?? {}

      const fkResult = await pool.query<{
        column_name: string
        foreign_table_name: string
        foreign_column_name: string
      }>(
        `SELECT kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
         FROM information_schema.table_constraints AS tc
         JOIN information_schema.key_column_usage AS kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage AS ccu
           ON ccu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = $1 AND tc.table_name = $2`,
        [schema, tableName]
      )

      const fkMap = new Map(
        fkResult.rows.map((r) => [
          r.column_name,
          { table: r.foreign_table_name, column: r.foreign_column_name },
        ])
      )

      interface PgColRow {
        column_name: string
        data_type: string
        is_nullable: string
        is_pk: boolean
      }

      const colResult = await pool.query<PgColRow>(
        `SELECT
           c.column_name,
           c.data_type,
           c.is_nullable,
           EXISTS(
             SELECT 1
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
              AND tc.table_name = kcu.table_name
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = $2
               AND tc.table_name = $1
               AND kcu.column_name = c.column_name
           ) AS is_pk
         FROM information_schema.columns c
         WHERE c.table_schema = $2 AND c.table_name = $1
         ORDER BY c.ordinal_position`,
        [tableName, schema]
      )

      const columns: DbColumn[] = colResult.rows.map((r) => {
        const col: DbColumn = {
          name: r.column_name,
          type: r.data_type,
          nullable: r.is_nullable === 'YES',
          isPrimaryKey: Boolean(r.is_pk),
          classification: classificationFor(
            tableAnns[r.column_name]?.visibility
          ),
        }
        const fk = fkMap.get(r.column_name)
        if (fk) col.foreignKey = fk
        return col
      })

      tables.push({ name: qualifiedName, columns })
    }

    return tables
  } finally {
    await pool.end()
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DbSchemaService {
  constructor(
    private readonly projectRoot: string,
    private readonly openDb: OpenDbFn | null,
    private readonly PgPool: PgPoolCtor | null
  ) {}

  async getSchema(): Promise<DbSchema | null> {
    const annotations = loadAnnotations(this.projectRoot)

    // SQLite: prefer .pikku-runtime/dev.db when it exists
    if (this.openDb) {
      const candidates = [
        join(this.projectRoot, '.pikku-runtime', 'dev.db'),
        join(this.projectRoot, 'dev.db'),
      ]
      const dbFile = candidates.find((f) => existsSync(f))
      if (dbFile) {
        const tables = await introspectSqlite(dbFile, annotations, this.openDb)
        return { tables }
      }
    }

    // Postgres: fall back to env-var connection string
    const postgresUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
    if (postgresUrl && this.PgPool) {
      const tables = await introspectPostgres(postgresUrl, annotations, this.PgPool)
      return { tables }
    }

    return null
  }
}
