import type { SqliteDatabase } from 'kysely'

/**
 * Opens the SQLite database Kysely's `SqliteDialect` binds to, using whichever
 * driver the current runtime can actually load.
 *
 * `better-sqlite3` ships a Node-ABI addon. Bun cannot load it — and rather than
 * throwing, it aborts the process with `NAPI FATAL ERROR`, which takes down
 * `pikku dev --watch` before the server ever listens. `bun:sqlite` is built in,
 * so under Bun it is the only driver available; `openBunSqliteDatabase` adapts
 * it to the same `SqliteDatabase` shape better-sqlite3 already satisfies, so the
 * dialect (and every caller here) sees one interface either way.
 */
export const openSqliteDatabase = async (
  path: string
): Promise<SqliteDatabase> => {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
  if (isBun) {
    const { openBunSqliteDatabase } = await import('@pikku/kysely-bun-sqlite')
    return openBunSqliteDatabase(path)
  }
  const { default: Database } = await import('better-sqlite3')
  return new Database(path)
}
