import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

const TRACKING_TABLE = 'sql_migrations'

export class MigrationDriftError extends Error {
  constructor(
    public readonly file: string,
    public readonly recordedHash: string,
    public readonly currentHash: string | null,
    public readonly appliedAt: string
  ) {
    const onDisk =
      currentHash === null
        ? 'file missing on disk'
        : `sha256:${currentHash.slice(0, 8)}…`
    super(
      `[PKU-DB-DRIFT] db/migrations/${file}\n\n` +
        `Migration content has changed since it was applied.\n` +
        `  recorded:  sha256:${recordedHash.slice(0, 8)}…  applied ${appliedAt}\n` +
        `  on disk:   ${onDisk}\n\n` +
        `If this edit was intentional, run \`pikku db reset\` to rebuild the dev\n` +
        `database from scratch. Production migrations are immutable.`
    )
    this.name = 'MigrationDriftError'
  }
}

export interface MigrateResult {
  applied: string[]
  skipped: string[]
}

interface MigrationRow {
  name: string
  hash: string
  applied_at: string
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function ensureTrackingTable(db: SyncSqliteDatabase): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
       name       TEXT PRIMARY KEY,
       hash       TEXT NOT NULL,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  )
}

function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

function readApplied(db: SyncSqliteDatabase): MigrationRow[] {
  return db
    .prepare(
      `SELECT name, hash, applied_at FROM ${TRACKING_TABLE} ORDER BY name`
    )
    .all() as unknown as MigrationRow[]
}

function checkDrift(applied: MigrationRow[], migrationsDir: string): void {
  for (const row of applied) {
    let currentHash: string | null = null
    try {
      currentHash = sha256(readFileSync(join(migrationsDir, row.name)))
    } catch {
      currentHash = null
    }
    if (currentHash !== row.hash) {
      throw new MigrationDriftError(
        row.name,
        row.hash,
        currentHash,
        row.applied_at
      )
    }
  }
}

/**
 * Apply pending migrations from <migrationsDir>/*.sql against the open db.
 * Hashes raw bytes on apply; subsequent runs re-hash and bail with
 * MigrationDriftError if any applied file has changed on disk.
 *
 * The same bytes that get hashed are the bytes passed to db.exec — no
 * splitting, trimming, or normalization. See docs/dev-builtin-sqlite.md.
 */
export function migrate(
  db: SyncSqliteDatabase,
  migrationsDir: string
): MigrateResult {
  ensureTrackingTable(db)
  const applied = readApplied(db)
  checkDrift(applied, migrationsDir)

  const appliedSet = new Set(applied.map((r) => r.name))
  const files = listMigrationFiles(migrationsDir)

  const result: MigrateResult = { applied: [], skipped: [] }
  const insertStmt = db.prepare(
    `INSERT INTO ${TRACKING_TABLE} (name, hash) VALUES (?, ?)`
  )

  for (const name of files) {
    if (appliedSet.has(name)) {
      result.skipped.push(name)
      continue
    }
    const raw = readFileSync(join(migrationsDir, name))
    const hash = sha256(raw)
    db.exec('BEGIN')
    try {
      db.exec(raw.toString('utf8'))
      insertStmt.run(name, hash)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    result.applied.push(name)
  }

  return result
}

/**
 * Wipe the tracking table. Used by `pikku db reset` after the DB file is
 * removed (calling this on its own does NOT drop user tables).
 */
export function dropTrackingTable(db: SyncSqliteDatabase): void {
  db.exec(`DROP TABLE IF EXISTS ${TRACKING_TABLE}`)
}
