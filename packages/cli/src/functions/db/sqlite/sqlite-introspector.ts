import type { DbIntrospector, ColumnInfo } from '../db-introspector.js'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

const SKIP_TABLES = new Set(['sqlite_sequence', 'sql_migrations'])

interface SqliteColumnRow {
  name: string
  type: string
  notnull: number
  pk: number
  dflt_value: unknown
  /** 0=regular, 1=virtual-table hidden, 2=virtual generated, 3=stored generated */
  hidden: number
}

export class SqliteIntrospector implements DbIntrospector {
  constructor(private readonly db: SyncSqliteDatabase) {}

  async listTables(): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
           ORDER BY name`
      )
      .all() as Array<{ name: string }>
    return rows.map((r) => r.name).filter((n) => !SKIP_TABLES.has(n))
  }

  async getColumns(table: string): Promise<ColumnInfo[]> {
    const escaped = `"${table.replace(/"/g, '""')}"`
    const rows = this.db
      .prepare(`PRAGMA table_xinfo(${escaped})`)
      .all() as unknown as SqliteColumnRow[]
    return rows
      .filter((c) => c.hidden !== 1)
      .map((c) => ({
        name: c.name,
        type: c.type,
        notNull: Boolean(c.notnull),
        pk: c.pk > 0,
        defaultValue: c.dflt_value != null ? String(c.dflt_value) : null,
        generated: c.hidden === 2 || c.hidden === 3,
      }))
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
