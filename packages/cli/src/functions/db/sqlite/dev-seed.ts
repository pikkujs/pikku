import { existsSync, readFileSync } from 'node:fs'
import type { SyncSqliteDatabase } from '@pikku/db-migrator/sqlite'

export interface DevSeedResult {
  applied: boolean
  bytes: number
}

/**
 * Apply db/<engine>-dev-seed.sql to the open db. Only `pikku db reset` reaches
 * here, against a database it has just wiped and migrated, so the file may be
 * plain `INSERT`s — it is never applied twice. Returns `applied: false` if the
 * file doesn't exist; throws on SQL errors.
 */
export function devSeed(
  db: SyncSqliteDatabase,
  devSeedFile: string
): DevSeedResult {
  if (!existsSync(devSeedFile)) {
    return { applied: false, bytes: 0 }
  }
  const raw = readFileSync(devSeedFile)
  db.exec('BEGIN')
  try {
    db.exec(raw.toString('utf8'))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { applied: true, bytes: raw.length }
}
