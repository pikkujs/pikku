import type { MigrationExecutor, AppliedMigration } from '../sql-migrator.js'
import { MIGRATION_TRACKING_TABLE as TRACKING_TABLE } from '../sql-migrator.js'

export interface MysqlMigrationClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

/**
 * Applies migrations to MySQL.
 *
 * MySQL commits implicitly before and after every DDL statement, so a
 * migration cannot be wrapped in a transaction the way the Postgres executor
 * does: there is nothing to roll back to. The migration is run and only then
 * recorded, which means a migration that fails part-way leaves its earlier
 * statements applied and is not recorded — the next run replays it from the top.
 * Write MySQL migrations so each statement tolerates that
 * (`CREATE TABLE IF NOT EXISTS`, one change per file).
 *
 * Foreign key checks are off for the duration of each migration (so a dump's
 * tables can appear in any order) and back on afterwards.
 *
 * The client must run a multi-statement string in one call
 * (`multipleStatements: true` on mysql2), because a migration file is one, and
 * must be a single connection, because FOREIGN_KEY_CHECKS is session state.
 */
export class MysqlMigrationExecutor implements MigrationExecutor {
  constructor(private readonly client: MysqlMigrationClient) {}

  async ensureTrackingTable(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
        name       VARCHAR(255) PRIMARY KEY,
        hash       VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  async getApplied(): Promise<AppliedMigration[]> {
    const { rows } = await this.client.query<AppliedMigration>(
      `SELECT name, hash, CAST(applied_at AS CHAR) AS applied_at FROM ${TRACKING_TABLE} ORDER BY name`
    )
    return rows
  }

  async recordMigration(name: string, hash: string): Promise<void> {
    await this.client.query(
      `INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`,
      [name, hash]
    )
  }

  async runMigration(sql: string, name: string, hash: string): Promise<void> {
    // Foreign keys are not checked while a migration runs: a mysqldump lists
    // tables alphabetically, so a table can reference one that comes after it.
    // The setting is per session, which is why the client must be one
    // connection, and it is restored whether or not the migration succeeds.
    await this.client.query('SET FOREIGN_KEY_CHECKS = 0')
    try {
      await this.client.query(sql)
    } finally {
      await this.client.query('SET FOREIGN_KEY_CHECKS = 1')
    }
    await this.recordMigration(name, hash)
  }
}
