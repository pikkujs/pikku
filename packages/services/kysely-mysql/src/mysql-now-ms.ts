import { sql } from 'kysely'

/**
 * Now, in epoch milliseconds, on the database's clock. Counted from
 * `utc_timestamp` rather than `unix_timestamp(now())`, which goes through the
 * session time zone and repeats an hour when that zone falls back.
 */
export const mysqlNowMs = () =>
  sql<number>`cast(timestampdiff(microsecond, '1970-01-01 00:00:00', utc_timestamp(6)) div 1000 as signed)`
