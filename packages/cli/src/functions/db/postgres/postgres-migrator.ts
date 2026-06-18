import type { MigrationExecutor, AppliedMigration } from '../db-migrator.js'

const TRACKING_TABLE = 'sql_migrations'

export interface PostgresMigrationClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec?(sql: string): Promise<unknown>
}

export class PostgresMigrationExecutor implements MigrationExecutor {
  constructor(private readonly client: PostgresMigrationClient) {}

  async ensureTrackingTable(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
        name       TEXT PRIMARY KEY,
        hash       TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  }

  async getApplied(): Promise<AppliedMigration[]> {
    const { rows } = await this.client.query<AppliedMigration>(
      `SELECT name, hash, applied_at FROM ${TRACKING_TABLE} ORDER BY name`
    )
    return rows
  }

  async runMigration(sql: string, name: string, hash: string): Promise<void> {
    await this.client.query('BEGIN')
    try {
      if (typeof this.client.exec === 'function') {
        await this.client.exec(sql)
      } else {
        await this.client.query(sql)
      }
      await this.client.query(
        `INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES ($1, $2)`,
        [name, hash]
      )
      await this.client.query('COMMIT')
    } catch (err) {
      await this.client.query('ROLLBACK')
      throw err
    }
  }
}
