import { MysqlAdapter, type Kysely } from 'kysely'

/**
 * Whether `db` talks to MySQL.
 *
 * Read from the dialect's adapter rather than configured, so a store handed any
 * Kysely instance (or an open transaction) answers for the engine it will
 * actually run against.
 */
export const isMysql = (db: Kysely<any>): boolean =>
  db.getExecutor().adapter instanceof MysqlAdapter

/** In an upsert's update set: take the value the insert proposed for this column. */
export const INSERTED = Symbol('inserted')

/**
 * Insert, leaving an existing row alone when `conflictColumns` already match one.
 *
 * Postgres and sqlite spell this `on conflict do nothing`. MySQL has no such
 * clause; `insert ignore` is the closest, and unlike `on conflict (cols)` it
 * also swallows other row errors, so it is only used where the conflict target
 * is the table's key.
 */
export const insertOrIgnore = (
  db: Kysely<any>,
  query: any,
  conflictColumns?: string[]
): any =>
  isMysql(db)
    ? query.ignore()
    : query.onConflict((oc: any) =>
        conflictColumns
          ? oc.columns(conflictColumns).doNothing()
          : oc.doNothing()
      )

/**
 * Insert, or update the row `conflictColumns` match.
 *
 * `set` maps column to the new value, or to `INSERTED` for "whatever this
 * insert carried" — `excluded.col` on postgres and sqlite, `values(col)` on
 * MySQL, which has no `excluded`.
 */
export const upsert = (
  db: Kysely<any>,
  query: any,
  conflictColumns: string[],
  set: Record<string, unknown>
): any => {
  if (isMysql(db)) {
    return query.onDuplicateKeyUpdate((eb: any) =>
      Object.fromEntries(
        Object.entries(set).map(([column, value]) => [
          column,
          value === INSERTED ? eb.fn('values', [eb.ref(column)]) : value,
        ])
      )
    )
  }
  return query.onConflict((oc: any) =>
    oc
      .columns(conflictColumns)
      .doUpdateSet((eb: any) =>
        Object.fromEntries(
          Object.entries(set).map(([column, value]) => [
            column,
            value === INSERTED ? eb.ref(`excluded.${column}`) : value,
          ])
        )
      )
  )
}

/**
 * A moment as a `timestamp` column's parameter.
 *
 * An ISO 8601 string with its trailing `Z` is accepted by postgres and stored
 * as written by sqlite, but MySQL refuses it for a `TIMESTAMP` column
 * (`Incorrect datetime value`). The driver formats a `Date` for MySQL itself,
 * so that is what it is given.
 */
export const timestampParam = (db: Kysely<any>, at: Date = new Date()): Date =>
  isMysql(db) ? at : (at.toISOString() as unknown as Date)
