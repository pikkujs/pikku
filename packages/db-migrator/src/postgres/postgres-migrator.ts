import type { MigrationExecutor, AppliedMigration } from '../db-migrator.js'
import { MIGRATION_TRACKING_TABLE as TRACKING_TABLE } from '../db-migrator.js'

export interface PostgresMigrationClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec?(sql: string): Promise<unknown>
  /**
   * Run a migration and its bookkeeping row on one connection.
   *
   * A pooled client is free to answer `BEGIN`, the migration and `COMMIT` on
   * three different connections, which leaves a transaction open on one and the
   * DDL committed outside it on another — a failed migration then stays half
   * applied with nothing to roll back. A client that hands out a connection
   * implements this; one that only ever has a single connection does not need
   * to, and the statement pair below is correct for it.
   */
  begin?<T>(handler: (client: PostgresMigrationClient) => Promise<T>): Promise<T>
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

  async recordMigration(name: string, hash: string): Promise<void> {
    await this.client.query(
      `INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES ($1, $2)`,
      [name, hash]
    )
  }

  async runMigration(sql: string, name: string, hash: string): Promise<void> {
    if (typeof this.client.begin === 'function') {
      await this.client.begin(async (tx) => {
        await this.applyOn(tx, sql, name, hash)
      })
      return
    }

    await this.client.query('BEGIN')
    try {
      await this.applyOn(this.client, sql, name, hash)
      await this.client.query('COMMIT')
    } catch (err) {
      await this.client.query('ROLLBACK')
      throw err
    }
  }

  private async applyOn(
    client: PostgresMigrationClient,
    sql: string,
    name: string,
    hash: string
  ): Promise<void> {
    if (typeof client.exec === 'function') {
      await client.exec(sql)
    } else {
      await client.query(sql)
    }
    await client.query(
      `INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES ($1, $2)`,
      [name, hash]
    )
  }
}
