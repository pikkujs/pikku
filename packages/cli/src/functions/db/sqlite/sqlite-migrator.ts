import type { MigrationExecutor, AppliedMigration } from '../db-migrator.js'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

const TRACKING_TABLE = 'sql_migrations'

export class SqliteMigrationExecutor implements MigrationExecutor {
  constructor(private readonly db: SyncSqliteDatabase) {}

  async ensureTrackingTable(): Promise<void> {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
         name       TEXT PRIMARY KEY,
         hash       TEXT NOT NULL,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    )
  }

  async getApplied(): Promise<AppliedMigration[]> {
    return this.db
      .prepare(
        `SELECT name, hash, applied_at FROM ${TRACKING_TABLE} ORDER BY name`
      )
      .all() as unknown as AppliedMigration[]
  }

  async runMigration(sql: string, name: string, hash: string): Promise<void> {
    this.db.exec('BEGIN')
    try {
      this.db.exec(sql)
      this.db
        .prepare(`INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`)
        .run(name, hash)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }
}

export function dropTrackingTable(db: SyncSqliteDatabase): void {
  db.exec(`DROP TABLE IF EXISTS ${TRACKING_TABLE}`)
}
