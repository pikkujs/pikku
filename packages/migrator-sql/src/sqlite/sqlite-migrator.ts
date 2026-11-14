import type { MigrationExecutor, AppliedMigration } from '../sql-migrator.js'
import { MIGRATION_TRACKING_TABLE as TRACKING_TABLE } from '../sql-migrator.js'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

/**
 * A line a migration carries to say it must run with foreign key enforcement
 * off, as SQLite's own recipe for changing a table's definition requires: the
 * pragma does nothing inside a transaction, so the executor sets it around one.
 */
export const SQLITE_FOREIGN_KEYS_OFF_MARKER = '-- pikku:foreign-keys-off'

type ForeignKeyViolation = Record<string, unknown>

/**
 * A violation by what is broken, not by which row: a rebuilt table's rows may
 * change rowid, and a WITHOUT ROWID table reports none.
 */
const violationKey = (row: ForeignKeyViolation) =>
  `${row.table}|${row.parent}|${row.fkid}`

function countByKey(rows: ForeignKeyViolation[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = violationKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

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

  async recordMigration(name: string, hash: string): Promise<void> {
    this.db
      .prepare(`INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`)
      .run(name, hash)
  }

  async runMigration(sql: string, name: string, hash: string): Promise<void> {
    if (new RegExp(`^${SQLITE_FOREIGN_KEYS_OFF_MARKER}\\s*$`, 'm').test(sql)) {
      return this.runWithForeignKeysOff(sql, name, hash)
    }
    this.db.exec('BEGIN')
    try {
      this.apply(sql, name, hash)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /**
   * Enforcement is switched off outside the transaction, where the pragma
   * counts, and the migration is refused if it leaves a foreign key broken that
   * was not broken before it ran. The pragma goes back to what it was whether
   * or not the migration did.
   */
  private runWithForeignKeysOff(sql: string, name: string, hash: string) {
    const enforced = () =>
      (this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
        .foreign_keys === 1
    const was = enforced()
    this.db.exec('PRAGMA foreign_keys = OFF')
    try {
      // SQLite ignores the pragma inside a transaction and says nothing, and
      // a rebuild with enforcement on cascades the DROP into the child rows.
      if (enforced()) {
        throw new Error(
          `${name} needs foreign key enforcement off, and it could not be switched off: a transaction is already open on this connection`
        )
      }
      const before = countByKey(this.foreignKeyViolations())
      const objectsBefore = this.dependentObjects()
      this.db.exec('BEGIN')
      try {
        this.apply(sql, name, hash)
        // Dropping a table takes its indexes and triggers with it, and a rebuild
        // only puts back the ones the migrations know. One that exists on this
        // database alone (made by hand, or by another tool) would be lost.
        const objectsAfter = new Set(this.dependentObjects())
        const lost = objectsBefore.filter((o) => !objectsAfter.has(o))
        if (lost.length > 0) {
          throw new Error(
            `${name} would lose ${lost.slice(0, 5).join(', ')}${lost.length > 5 ? `, and ${lost.length - 5} more` : ''}, which exist on this database and are not recreated by the migration. Recreate them in the migration or drop them first.`
          )
        }
        const broken: ForeignKeyViolation[] = []
        const seen = new Map<string, number>()
        for (const row of this.foreignKeyViolations()) {
          const key = violationKey(row)
          const n = (seen.get(key) ?? 0) + 1
          seen.set(key, n)
          if (n > (before.get(key) ?? 0)) broken.push(row)
        }
        if (broken.length > 0) {
          throw new Error(
            `the migration leaves foreign keys broken: ${broken
              .slice(0, 5)
              .map((row) => `${row.table} row ${row.rowid} -> ${row.parent}`)
              .join(
                ', '
              )}${broken.length > 5 ? `, and ${broken.length - 5} more` : ''}`
          )
        }
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    } finally {
      this.db.exec(`PRAGMA foreign_keys = ${was ? 'ON' : 'OFF'}`)
    }
  }

  /** Indexes, triggers and views by kind and name, SQLite's own excepted. */
  private dependentObjects(): string[] {
    return (
      this.db
        .prepare(
          `SELECT type, name FROM sqlite_master
           WHERE type IN ('index', 'trigger', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'`
        )
        .all() as Array<{ type: string; name: string }>
    ).map((o) => `${o.type} ${o.name}`)
  }

  private foreignKeyViolations(): ForeignKeyViolation[] {
    return this.db
      .prepare('PRAGMA foreign_key_check')
      .all() as ForeignKeyViolation[]
  }

  private apply(sql: string, name: string, hash: string): void {
    this.db.exec(sql)
    this.db
      .prepare(`INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`)
      .run(name, hash)
  }
}

export function dropTrackingTable(db: SyncSqliteDatabase): void {
  db.exec(`DROP TABLE IF EXISTS ${TRACKING_TABLE}`)
}
