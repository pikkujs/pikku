import type {
  DbIntrospector,
  ColumnInfo,
  ForeignKeyInfo,
  EnumInfo,
} from '../db-introspector.js'
import { MIGRATION_TRACKING_TABLE } from '@pikku/sql-migrator'
import type { SyncSqliteDatabase } from '@pikku/sql-migrator/sqlite'
import { parseCheckEnumsFromDdl } from '../check-enums.js'

const SKIP_TABLES = new Set(['sqlite_sequence', MIGRATION_TRACKING_TABLE])

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
    const enumsByColumn = this.parseCheckEnums(table)
    return rows
      .filter((c) => c.hidden !== 1)
      .map((c) => ({
        name: c.name,
        type: c.type,
        notNull: Boolean(c.notnull),
        pk: c.pk > 0,
        defaultValue: c.dflt_value != null ? String(c.dflt_value) : null,
        generated: c.hidden === 2 || c.hidden === 3,
        enumValues: enumsByColumn.get(c.name),
      }))
  }

  /**
   * SQLite has no native enums, but a `CHECK (col IN ('a','b',…))` constraint is
   * an enum by another name. Read back the table's stored `CREATE TABLE` DDL —
   * which SQLite keeps verbatim, comments included — and map each constrained
   * column to its allowed values so codegen can type it as a union.
   */
  private parseCheckEnums(table: string): Map<string, string[]> {
    const row = this.db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`
      )
      .get(table) as { sql: string | null } | undefined
    return row?.sql ? parseCheckEnumsFromDdl(row.sql) : new Map()
  }

  async getForeignKeys(table: string): Promise<ForeignKeyInfo[]> {
    const escaped = `"${table.replace(/"/g, '""')}"`
    const rows = this.db
      .prepare(`PRAGMA foreign_key_list(${escaped})`)
      .all() as Array<{ from: string; table: string; to: string }>
    return rows.map((r) => ({
      column: r.from,
      foreignTable: r.table,
      foreignColumn: r.to,
    }))
  }

  async getAllColumns(): Promise<Map<string, ColumnInfo[]>> {
    const byTable = new Map<string, ColumnInfo[]>()
    for (const table of await this.listTables()) {
      byTable.set(table, await this.getColumns(table))
    }
    return byTable
  }

  async getAllForeignKeys(): Promise<Map<string, ForeignKeyInfo[]>> {
    const byTable = new Map<string, ForeignKeyInfo[]>()
    for (const table of await this.listTables()) {
      const fks = await this.getForeignKeys(table)
      if (fks.length > 0) byTable.set(table, fks)
    }
    return byTable
  }

  async listEnums(): Promise<EnumInfo[]> {
    return []
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
