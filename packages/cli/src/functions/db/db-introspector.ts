export interface ColumnInfo {
  name: string
  /** Raw SQL/DB type string, e.g. 'INTEGER', 'TEXT', 'boolean', 'timestamp without time zone' */
  type: string
  notNull: boolean
  pk: boolean
  defaultValue: string | null
  /** True for virtual or stored generated columns — these are read-only and never inserted. */
  generated?: boolean
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
  listEnums(): Promise<EnumInfo[]>
  close(): Promise<void>
}
