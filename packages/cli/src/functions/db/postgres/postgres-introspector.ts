import { Pool } from 'pg'
import type {
  DbIntrospector,
  ColumnInfo,
  ForeignKeyInfo,
  EnumInfo,
} from '../db-introspector.js'

interface PgColumnRow {
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: string
  column_default: string | null
  is_generated: string
  is_pk: boolean
}

interface PgAllColumnRow extends PgColumnRow {
  table_schema: string
  table_name: string
}

interface PgAllForeignKeyRow {
  owner_schema: string
  owner_table: string
  column_name: string
  foreign_table_schema: string
  foreign_table_name: string
  foreign_column_name: string
}

/** Table display name matching `listTables` (schema-qualified unless `public`). */
function tableKey(schema: string, table: string): string {
  return schema === 'public' ? table : `${schema}.${table}`
}

export interface QueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  end(): Promise<void>
}

/**
 * Resolve the SQL type string for a column, preserving array-ness. Postgres
 * reports every array column with `data_type = 'ARRAY'`; the element type lives
 * in `udt_name` as the internal array type name (`_text`, `_int4`, `_uuid`, …).
 * We strip the leading underscore and re-form it as `<element>[]` so downstream
 * type mapping keeps the array instead of flattening to the scalar element.
 */
function resolveColumnType(dataType: string, udtName: string): string {
  if (dataType === 'ARRAY') {
    const element = udtName.startsWith('_') ? udtName.slice(1) : udtName
    return `${element}[]`
  }
  return dataType
}

export class PostgresIntrospector implements DbIntrospector {
  private client: QueryClient
  private ownsClient: boolean

  constructor(clientOrConnectionString: QueryClient | string) {
    if (typeof clientOrConnectionString === 'string') {
      this.client = new Pool({
        connectionString: clientOrConnectionString,
        max: 10,
      })
      this.ownsClient = true
    } else {
      this.client = clientOrConnectionString
      this.ownsClient = false
    }
  }

  async connect(): Promise<void> {
    // Pool connects lazily; nothing to do here.
  }

  async listTables(): Promise<string[]> {
    const result = await this.client.query<{
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
    return result.rows.map((r) => tableKey(r.table_schema, r.table_name))
  }

  async getColumns(table: string): Promise<ColumnInfo[]> {
    const dotIdx = table.indexOf('.')
    const schema = dotIdx >= 0 ? table.slice(0, dotIdx) : 'public'
    const tableName = dotIdx >= 0 ? table.slice(dotIdx + 1) : table

    const result = await this.client.query<PgColumnRow>(
      `SELECT
         c.column_name,
         c.data_type,
         c.udt_name,
         c.is_nullable,
         c.column_default,
         c.is_generated,
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

    return result.rows.map((r) => ({
      name: r.column_name,
      type: resolveColumnType(r.data_type, r.udt_name),
      udtName: r.udt_name,
      notNull: r.is_nullable === 'NO',
      pk: Boolean(r.is_pk),
      defaultValue: r.column_default,
      generated: r.is_generated === 'ALWAYS',
    }))
  }

  async getForeignKeys(table: string): Promise<ForeignKeyInfo[]> {
    const dotIdx = table.indexOf('.')
    const schema = dotIdx >= 0 ? table.slice(0, dotIdx) : 'public'
    const tableName = dotIdx >= 0 ? table.slice(dotIdx + 1) : table

    const result = await this.client.query<{
      column_name: string
      foreign_table_schema: string
      foreign_table_name: string
      foreign_column_name: string
    }>(
      `SELECT kcu.column_name,
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
       WHERE kcu.table_schema = $2 AND kcu.table_name = $1
       ORDER BY kcu.ordinal_position`,
      [tableName, schema]
    )

    return result.rows.map((r) => ({
      column: r.column_name,
      foreignTable: tableKey(r.foreign_table_schema, r.foreign_table_name),
      foreignColumn: r.foreign_column_name,
    }))
  }

  async getAllColumns(): Promise<Map<string, ColumnInfo[]>> {
    const result = await this.client.query<PgAllColumnRow>(
      `WITH pk_cols AS (
         SELECT tc.table_schema, tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
         WHERE tc.constraint_type = 'PRIMARY KEY'
       )
       SELECT
         c.table_schema,
         c.table_name,
         c.column_name,
         c.data_type,
         c.udt_name,
         c.is_nullable,
         c.column_default,
         c.is_generated,
         (pk.column_name IS NOT NULL) AS is_pk
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
        AND t.table_type = 'BASE TABLE'
       LEFT JOIN pk_cols pk
         ON pk.table_schema = c.table_schema
        AND pk.table_name = c.table_name
        AND pk.column_name = c.column_name
       WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
         AND c.table_schema NOT LIKE 'pg_temp_%'
       ORDER BY c.table_schema, c.table_name, c.ordinal_position`
    )

    const byTable = new Map<string, ColumnInfo[]>()
    for (const r of result.rows) {
      const key = tableKey(r.table_schema, r.table_name)
      let cols = byTable.get(key)
      if (!cols) {
        cols = []
        byTable.set(key, cols)
      }
      cols.push({
        name: r.column_name,
        type: resolveColumnType(r.data_type, r.udt_name),
        udtName: r.udt_name,
        notNull: r.is_nullable === 'NO',
        pk: Boolean(r.is_pk),
        defaultValue: r.column_default,
        generated: r.is_generated === 'ALWAYS',
      })
    }
    return byTable
  }

  async getAllForeignKeys(): Promise<Map<string, ForeignKeyInfo[]>> {
    const result = await this.client.query<PgAllForeignKeyRow>(
      `SELECT kcu.table_schema  AS owner_schema,
              kcu.table_name    AS owner_table,
              kcu.column_name,
              kcu2.table_schema AS foreign_table_schema,
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
       WHERE kcu.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
         AND kcu.table_schema NOT LIKE 'pg_temp_%'
       ORDER BY kcu.table_schema, kcu.table_name, kcu.ordinal_position`
    )

    const byTable = new Map<string, ForeignKeyInfo[]>()
    for (const r of result.rows) {
      const key = tableKey(r.owner_schema, r.owner_table)
      let fks = byTable.get(key)
      if (!fks) {
        fks = []
        byTable.set(key, fks)
      }
      fks.push({
        column: r.column_name,
        foreignTable: tableKey(r.foreign_table_schema, r.foreign_table_name),
        foreignColumn: r.foreign_column_name,
      })
    }
    return byTable
  }

  async listEnums(): Promise<EnumInfo[]> {
    const result = await this.client.query<{
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

  async close(): Promise<void> {
    if (this.ownsClient) {
      await this.client.end()
    }
  }
}
