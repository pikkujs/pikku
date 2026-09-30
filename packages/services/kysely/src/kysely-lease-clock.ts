import { sql, type RawBuilder } from 'kysely'

/**
 * Now, in epoch milliseconds, as a SQL expression: the clock every lease in
 * this package is granted and judged on.
 *
 * A lease is compared by whichever worker reads it next, so judging it on each
 * worker's own clock lets a worker running ahead take a lease that is still
 * held. The dialect services read the database's clock instead, which every
 * worker shares. This default binds the process clock, for SQLite, where the
 * database lives in the process anyway.
 */
export const appNowMs = (): RawBuilder<number> =>
  sql<number>`cast(${Date.now()} as bigint)`

/** `now + ms`, for a lease that runs `ms` from the clock's now. */
export const leaseUntil = (now: RawBuilder<number>, ms: number) =>
  sql<number>`${now} + ${ms}`
