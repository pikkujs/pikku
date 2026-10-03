import { existsSync, rmSync } from 'node:fs'
import type { SyncSqliteDatabase } from '@pikku/migrator-sql/sqlite'
import { openSqlite, type SqliteExtensionContext } from './sqlite-extensions.js'

type MasterRow = { type: string; name: string; sql: string | null }

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

const objects = (db: SyncSqliteDatabase): MasterRow[] =>
  db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'view', 'trigger')`
    )
    .all() as MasterRow[]

function dropEverything(db: SyncSqliteDatabase): void {
  db.exec('PRAGMA foreign_keys = OFF')
  for (const { type, name } of objects(db)) {
    if (type === 'view') db.exec(`DROP VIEW IF EXISTS ${quote(name)}`)
    if (type === 'trigger') db.exec(`DROP TRIGGER IF EXISTS ${quote(name)}`)
  }
  for (const { type, name, sql } of objects(db)) {
    if (type === 'table' && /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(sql ?? '')) {
      db.exec(`DROP TABLE IF EXISTS ${quote(name)}`)
    }
  }
  for (const { type, name } of objects(db)) {
    if (type === 'table') db.exec(`DROP TABLE IF EXISTS ${quote(name)}`)
  }
  const sequence = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`
    )
    .get()
  if (sequence) db.exec('DELETE FROM sqlite_sequence')
  db.exec('VACUUM')
}

/** Empties a SQLite database in place so a `pikku dev` holding it keeps a writable file; deletes it and its WAL if it cannot be opened. */
export async function wipeSqlite(
  context: SqliteExtensionContext,
  dbFile: string
): Promise<'emptied' | 'removed' | 'absent'> {
  if (!existsSync(dbFile)) return 'absent'
  try {
    const db = await openSqlite(context, dbFile)
    try {
      dropEverything(db)
    } finally {
      db.close()
    }
    return 'emptied'
  } catch {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      rmSync(`${dbFile}${suffix}`, { force: true })
    }
    return 'removed'
  }
}
