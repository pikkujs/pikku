import { sql } from 'kysely'

/**
 * Now, in epoch milliseconds, on the database's clock. `clock_timestamp()`
 * rather than `now()`, which stands still for the length of a transaction.
 */
export const pgNowMs = () =>
  sql<number>`(extract(epoch from clock_timestamp()) * 1000)::bigint`
