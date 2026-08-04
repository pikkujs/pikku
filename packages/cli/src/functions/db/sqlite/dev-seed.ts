import { existsSync, readFileSync } from 'node:fs'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'

export interface DevSeedResult {
  applied: boolean
  bytes: number
}

/**
 * Apply db/<engine>-dev-seed.sql to the open db. Idempotency is the user's
 * responsibility (e.g. `INSERT OR IGNORE`, upserts). Returns `applied: false`
 * if the file doesn't exist; throws on SQL errors.
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
