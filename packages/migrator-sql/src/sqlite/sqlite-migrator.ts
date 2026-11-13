import type { MigrationExecutor, AppliedMigration } from '../sql-migrator.js'
import { MIGRATION_TRACKING_TABLE as TRACKING_TABLE } from '../sql-migrator.js'
import { splitStatements } from '../schema-sql.js'
import { stripSqlComments } from '../migration-identifiers.js'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

/**
 * A line a migration carries to say it must run with foreign key enforcement
 * off, as SQLite's own recipe for changing a table's definition requires: the
 * pragma does nothing inside a transaction, so the executor sets it around one.
 */
export const SQLITE_FOREIGN_KEYS_OFF_MARKER = '-- pikku:foreign-keys-off'

/**
 * `sql` as single statements, a trigger's body kept whole: its `;`s end its
 * inner statements, and only the `END;` ends the trigger.
 */
export function splitSqliteStatements(sql: string): string[] {
  const out: string[] = []
  let open: string | undefined
  for (const piece of splitStatements(sql)) {
    const joined = open === undefined ? piece : `${open}\n${piece}`
    const code = stripSqlComments(joined).trim()
    if (
      /^create\s+(?:temp(?:orary)?\s+)?trigger\b/i.test(code) &&
      !/\bend\s*;?$/i.test(code)
    ) {
      open = joined
    } else {
      out.push(joined)
      open = undefined
    }
  }
  if (open !== undefined) out.push(open)
  return out
}

type ForeignKeyViolation = Record<string, unknown>

const violationKey = (row: ForeignKeyViolation) =>
  `${row.table}|${row.rowid}|${row.parent}|${row.fkid}`

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
    const was = (
      this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    ).foreign_keys
    this.db.exec('PRAGMA foreign_keys = OFF')
    try {
      const before = new Set(this.foreignKeyViolations().map(violationKey))
      this.db.exec('BEGIN')
      try {
        this.apply(sql, name, hash, true)
        const broken = this.foreignKeyViolations().filter(
          (row) => !before.has(violationKey(row))
        )
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

  private foreignKeyViolations(): ForeignKeyViolation[] {
    return this.db
      .prepare('PRAGMA foreign_key_check')
      .all() as ForeignKeyViolation[]
  }

  /**
   * Whether `sql` runs as one `exec` or a statement at a time. The foreign-keys
   * path runs them one at a time: bun:sqlite drops the error of a statement
   * that something follows, so a failed copy would go on to drop the table it
   * was copying from.
   */
  private apply(sql: string, name: string, hash: string, each = false): void {
    if (each) {
      for (const statement of splitSqliteStatements(sql)) {
        this.db.exec(statement)
      }
    } else {
      this.db.exec(sql)
    }
    this.db
      .prepare(`INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`)
      .run(name, hash)
  }
}

export function dropTrackingTable(db: SyncSqliteDatabase): void {
  db.exec(`DROP TABLE IF EXISTS ${TRACKING_TABLE}`)
}
