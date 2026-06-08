import { Client } from 'pg'
import type { DbIntrospector, ColumnInfo } from '../db-introspector.js'

interface PgColumnRow {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  is_generated: string
  is_pk: boolean
}

export class PostgresIntrospector implements DbIntrospector {
  private client: Client

  constructor(connectionStringOrClient: string | Client) {
    this.client =
      typeof connectionStringOrClient === 'string'
        ? new Client({ connectionString: connectionStringOrClient })
        : connectionStringOrClient
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async listTables(): Promise<string[]> {
    const result = await this.client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
    return result.rows.map((r) => r.table_name)
  }

  async getColumns(table: string): Promise<ColumnInfo[]> {
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
             AND tc.table_schema = 'public'
             AND tc.table_name = $1
             AND kcu.column_name = c.column_name
         ) AS is_pk
       FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = $1
       ORDER BY c.ordinal_position`,
      [table]
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
