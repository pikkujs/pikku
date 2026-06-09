import { Pool } from 'pg'
import type { DbIntrospector, ColumnInfo } from '../db-introspector.js'

interface PgColumnRow {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  is_generated: string
  is_pk: boolean
}

interface QueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  end(): Promise<void>
}

export class PostgresIntrospector implements DbIntrospector {
  private client: QueryClient

  constructor(clientOrConnectionString: QueryClient | string) {
    if (typeof clientOrConnectionString === 'string') {
      this.client = new Pool({
        connectionString: clientOrConnectionString,
        max: 10,
      })
    } else {
      this.client = clientOrConnectionString
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
    return result.rows.map((r) =>
      r.table_schema === 'public'
        ? r.table_name
        : `${r.table_schema}.${r.table_name}`
    )
  }

  async getColumns(table: string): Promise<ColumnInfo[]> {
    const dotIdx = table.indexOf('.')
    const schema = dotIdx >= 0 ? table.slice(0, dotIdx) : 'public'
    const tableName = dotIdx >= 0 ? table.slice(dotIdx + 1) : table

    const result = await this.client.query<PgColumnRow>(
      `SELECT
         c.column_name,
         c.data_type,
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
      type: r.data_type,
      notNull: r.is_nullable === 'NO',
      pk: Boolean(r.is_pk),
      defaultValue: r.column_default,
      generated: r.is_generated === 'ALWAYS',
    }))
  }

  async close(): Promise<void> {
    await this.client.end()
  }
}
