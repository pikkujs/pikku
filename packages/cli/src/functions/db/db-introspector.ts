export interface ColumnInfo {
  name: string
  /** Raw SQL/DB type string, e.g. 'INTEGER', 'TEXT', 'boolean', 'timestamp without time zone' */
  type: string
  notNull: boolean
  pk: boolean
  defaultValue: string | null
  /** True for virtual or stored generated columns — these are read-only and never inserted. */
  generated?: boolean
  /**
   * Underlying DB type name (Postgres `udt_name`). For an enum column `type` is
   * the generic `'USER-DEFINED'`, while `udtName` holds the actual enum type
   * name used to resolve its values. Undefined on SQLite (no native enums).
   */
  udtName?: string
  /**
   * String-literal enum values for this column, when known. On SQLite (no native
   * enums) these come from a `CHECK (col IN ('a','b',…))` constraint — the CHECK
   * *is* the enum definition. Typed as a union, mirroring a Postgres enum column.
   */
  enumValues?: string[]
}

export interface ForeignKeyInfo {
  column: string
  foreignTable: string
  foreignColumn: string
}

export interface EnumInfo {
  name: string
  schema: string
  values: string[]
}

export interface DbIntrospector {
  listTables(): Promise<string[]>
  getColumns(table: string): Promise<ColumnInfo[]>
  getForeignKeys(table: string): Promise<ForeignKeyInfo[]>
  /**
   * Columns for every table in one sweep, keyed by the same table name that
   * {@link listTables} returns (schema-qualified for non-`public` tables). On
   * Postgres this is a single set-based query — introspecting a large schema
   * must not fan out one round-trip per table, which both scales O(tables) and
   * overlaps queries on a single connection.
   */
  getAllColumns(): Promise<Map<string, ColumnInfo[]>>
  /**
   * Foreign keys for every table in one sweep, keyed like {@link getAllColumns}.
   * Tables with no foreign keys may be omitted from the map.
   */
  getAllForeignKeys(): Promise<Map<string, ForeignKeyInfo[]>>
  listEnums(): Promise<EnumInfo[]>
  close(): Promise<void>
}
