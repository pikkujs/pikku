import type {
  DbIntrospector,
  ColumnInfo,
  ForeignKeyInfo,
  EnumInfo,
} from '../db-introspector.js'
import { MIGRATION_TRACKING_TABLE } from '@pikku/migrator-sql'
import type { MysqlQueryClient } from './mysql-client.js'

interface MysqlColumnRow {
  table_name: string
  column_name: string
  column_type: string
  is_nullable: string
  column_default: string | null
  extra: string
  column_key: string
}

interface MysqlForeignKeyRow {
  table_name: string
  column_name: string
  referenced_table_name: string
  referenced_column_name: string
}

/**
 * The values of an `enum('a','b')` column type, unescaped.
 *
 * MySQL doubles a quote inside a literal (`'it''s'`), and the column type is the
 * only place the values live — there is no catalog of enum types to join to.
 */
export function parseEnumValues(columnType: string): string[] | undefined {
  if (!/^enum\(/i.test(columnType)) return undefined
  return [...columnType.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1]!.replace(/''/g, "'")
  )
}

/**
 * `type` is the full column type (`varchar(255)`, `decimal(10,2)`), not the bare
 * `data_type`: it is what an `ALTER TABLE … ADD COLUMN` has to be written with,
 * and a `varchar` with no length is not a type MySQL accepts.
 */
function toColumn(row: MysqlColumnRow): ColumnInfo {
  const autoIncrement = /auto_increment/i.test(row.extra)
  return {
    name: row.column_name,
    type: row.column_type,
    notNull: row.is_nullable === 'NO',
    pk: row.column_key === 'PRI',
    defaultValue:
      row.column_default ?? (autoIncrement ? 'AUTO_INCREMENT' : null),
    // `DEFAULT_GENERATED` is an expression default, which is writable.
    generated: /\b(VIRTUAL|STORED) GENERATED\b/i.test(row.extra),
    enumValues: parseEnumValues(row.column_type),
  }
}

/**
 * Introspects the database the connection is using. MySQL calls what Postgres
 * calls a schema a database, so there is never a qualifier on a table name.
 */
export class MysqlIntrospector implements DbIntrospector {
  constructor(private readonly client: MysqlQueryClient) {}

  async connect(): Promise<void> {}

  async listTables(): Promise<string[]> {
    const { rows } = await this.client.query<{ table_name: string }>(
      `SELECT table_name AS table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
    return rows
      .map((r) => r.table_name)
      .filter((name) => name !== MIGRATION_TRACKING_TABLE)
  }

  async getColumns(table: string): Promise<ColumnInfo[]> {
    return (await this.getAllColumns()).get(table) ?? []
  }

  async getForeignKeys(table: string): Promise<ForeignKeyInfo[]> {
    return (await this.getAllForeignKeys()).get(table) ?? []
  }

  async getAllColumns(): Promise<Map<string, ColumnInfo[]>> {
    const { rows } = await this.client.query<MysqlColumnRow>(
      `SELECT table_name AS table_name, column_name AS column_name,
              column_type AS column_type,
              is_nullable AS is_nullable, column_default AS column_default,
              extra AS extra, column_key AS column_key
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
       ORDER BY table_name, ordinal_position`
    )
    const byTable = new Map<string, ColumnInfo[]>()
    for (const row of rows) {
      if (row.table_name === MIGRATION_TRACKING_TABLE) continue
      const columns = byTable.get(row.table_name) ?? []
      columns.push(toColumn(row))
      byTable.set(row.table_name, columns)
    }
    return byTable
  }

  async getAllForeignKeys(): Promise<Map<string, ForeignKeyInfo[]>> {
    const { rows } = await this.client.query<MysqlForeignKeyRow>(
      `SELECT table_name AS table_name, column_name AS column_name,
              referenced_table_name AS referenced_table_name,
              referenced_column_name AS referenced_column_name
       FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE()
         AND referenced_table_schema = DATABASE()
         AND referenced_table_name IS NOT NULL
       ORDER BY table_name, constraint_name, ordinal_position`
    )
    const byTable = new Map<string, ForeignKeyInfo[]>()
    for (const row of rows) {
      if (row.table_name === MIGRATION_TRACKING_TABLE) continue
      const fks = byTable.get(row.table_name) ?? []
      fks.push({
        column: row.column_name,
        foreignTable: row.referenced_table_name,
        foreignColumn: row.referenced_column_name,
      })
      byTable.set(row.table_name, fks)
    }
    return byTable
  }

  async listEnums(): Promise<EnumInfo[]> {
    return []
  }

  async close(): Promise<void> {}
}
