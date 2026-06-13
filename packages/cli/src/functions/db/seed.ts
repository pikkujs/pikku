import { existsSync, readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'

export interface SeedResult {
  applied: boolean
  bytes: number
}

/**
 * Apply db/seed.sql to the open db. Idempotency is the user's responsibility
 * (e.g. `INSERT OR IGNORE`, upserts). Returns `applied: false` if the file
 * doesn't exist; throws on SQL errors.
 */
export function seed(db: DatabaseSync, seedFile: string): SeedResult {
  if (!existsSync(seedFile)) {
    return { applied: false, bytes: 0 }
  }
  const raw = readFileSync(seedFile)
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
