/**
 * The question a migration that adds a `CHECK` to a table that has rows asks
 * first: do the rows already there satisfy it?
 *
 * `db generate` writes the question into the migration, one
 * `-- pikku:check-probe {json}` line above each added check. A runner that
 * applies the migration reads those lines and asks before it applies anything,
 * through `checkProbeHook` on `migrate`; the standalone bundle's `db migrate`
 * and a local `pikku db migrate` both do. The answer is one of: fine, a row
 * breaks it, the table is too large to scan on the spot, or the scan did not
 * finish in time. Only the first lets the migration run.
 *
 * It is a guard in front of an `ADD CONSTRAINT`, not a replacement for it: on
 * Postgres the migration's single transaction still holds the table's lock
 * through the validating scan (see `docs/db-tables.md`), and MySQL cannot
 * cancel a running `SELECT` from here. What the probe buys is refusing before
 * any of that starts.
 */

/** How long the probe's scan runs before it counts as a failure. */
export const CHECK_PROBE_TIMEOUT_MS = 30_000

/**
 * Above this many rows the probe will not scan, and declines: validating a check
 * reads the whole table, and how to do that on a big one is a person's decision.
 */
export const CHECK_PROBE_MAX_ROWS = 10_000_000

/** The comment a migration carries above each added check, followed by one JSON object. */
export const CHECK_PROBE_MARKER = '-- pikku:check-probe '

export type CheckProbeDialect = 'postgres' | 'mysql'

export interface CheckProbe {
  /** Schema (postgres) or database (mysql); omitted means the connection's own. */
  schema?: string
  table: string
  /** A `SELECT` that returns a row only if one breaks the check. */
  sql: string
}

/** The marker line for `probe`. One line: JSON escapes every newline in the SQL. */
export const checkProbeLine = (probe: CheckProbe): string =>
  `${CHECK_PROBE_MARKER}${JSON.stringify(probe)}`

/**
 * The probes a migration body carries, one per added check. A marker line that
 * is not what `checkProbeLine` writes is an error, not a line to skip: skipping
 * it would apply a check nobody asked about.
 */
export function probesIn(migration: string): CheckProbe[] {
  return migration
    .split('\n')
    .filter((line) => line.startsWith(CHECK_PROBE_MARKER))
    .map((line) => {
      let parsed: Partial<CheckProbe>
      try {
        parsed = JSON.parse(line.slice(CHECK_PROBE_MARKER.length))
      } catch {
        throw new Error(`Unreadable check probe: ${line}`)
      }
      if (typeof parsed.table !== 'string' || typeof parsed.sql !== 'string') {
        throw new Error(`Unreadable check probe: ${line}`)
      }
      return {
        ...(typeof parsed.schema === 'string' ? { schema: parsed.schema } : {}),
        table: parsed.table,
        sql: parsed.sql,
      }
    })
}

const pgIdent = (name: string) => `"${name.replace(/"/g, '""')}"`
const myIdent = (name: string) => `\`${name.replace(/`/g, '``')}\``
const pgLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`
const myLiteral = (value: string) =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`

const qualified = (dialect: CheckProbeDialect, probe: CheckProbe) => {
  const ident = dialect === 'postgres' ? pgIdent : myIdent
  return probe.schema
    ? `${ident(probe.schema)}.${ident(probe.table)}`
    : ident(probe.table)
}

/** The planner's row estimate for the table; no row at all means it does not exist. */
export function rowEstimateSql(
  dialect: CheckProbeDialect,
  probe: CheckProbe
): string {
  return dialect === 'postgres'
    ? `SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = to_regclass(${pgLiteral(qualified('postgres', probe))})`
    : `SELECT table_rows AS estimate FROM information_schema.tables WHERE table_schema = ${probe.schema ? myLiteral(probe.schema) : 'DATABASE()'} AND table_name = ${myLiteral(probe.table)}`
}

/**
 * How many rows there are, counted only as far as `maxRows + 1`. For a table
 * whose estimate says nothing: Postgres reports `-1` (or `0` before 14) for one
 * never analysed, and InnoDB's `table_rows` is a guess that may be NULL.
 */
export function boundedCountSql(
  dialect: CheckProbeDialect,
  probe: CheckProbe,
  maxRows: number
): string {
  return `SELECT count(*) AS estimate FROM (SELECT 1 FROM ${qualified(dialect, probe)} LIMIT ${maxRows + 1}) AS probe_rows`
}

export interface CheckProbeOptions {
  timeoutMs?: number
  maxRows?: number
}

export type CheckProbeResult =
  | { ok: true }
  | { ok: false; reason: 'too-large'; estimate: number }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'violations' }

/** Runs `sql` on the target database and returns its rows. */
export type ProbeExecutor = (
  sql: string,
  timeoutMs: number
) => Promise<Record<string, unknown>[]>

const isTimeout = (error: unknown) => {
  const e = error as { code?: unknown; message?: unknown }
  return (
    String(e?.code) === '57014' ||
    /statement timeout|canceling statement|max_execution_time|maximum statement execution time/i.test(
      String(e?.message)
    )
  )
}

/**
 * Whether the rows a table holds satisfy a check about to be added to it.
 *
 * A table estimated larger than `maxRows` is declined without a scan. One whose
 * estimate is unusable (never analysed) is counted up to the cap instead of
 * waved through. A table that does not exist yet has nothing that could break
 * the check. The scan itself runs under `timeoutMs`, and one that does not
 * finish counts as a failure, since the `ADD CONSTRAINT` after it would scan
 * just as long.
 */
export async function runCheckProbe(
  dialect: CheckProbeDialect,
  probe: CheckProbe,
  execute: ProbeExecutor,
  {
    timeoutMs = CHECK_PROBE_TIMEOUT_MS,
    maxRows = CHECK_PROBE_MAX_ROWS,
  }: CheckProbeOptions = {}
): Promise<CheckProbeResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const run = async (sql: string) => {
    try {
      return await Promise.race([execute(sql, timeoutMs), timedOut])
    } catch (error) {
      if (isTimeout(error)) return 'timeout' as const
      throw error
    }
  }

  try {
    const estimated = await run(rowEstimateSql(dialect, probe))
    if (estimated === 'timeout') return { ok: false, reason: 'timeout' }
    if (estimated.length === 0) return { ok: true }

    let estimate = Number(estimated[0]!.estimate)
    if (!Number.isFinite(estimate) || estimate <= 0) {
      const counted = await run(boundedCountSql(dialect, probe, maxRows))
      if (counted === 'timeout') return { ok: false, reason: 'timeout' }
      estimate = Number(counted[0]?.estimate ?? 0)
    }
    if (estimate > maxRows) return { ok: false, reason: 'too-large', estimate }

    const result = await run(probe.sql)
    if (result === 'timeout') return { ok: false, reason: 'timeout' }
    return result.length > 0
      ? { ok: false, reason: 'violations' }
      : { ok: true }
  } finally {
    clearTimeout(timer)
  }
}

export class CheckProbeError extends Error {
  constructor(
    public readonly migration: string,
    public readonly probe: CheckProbe,
    public readonly result: Exclude<CheckProbeResult, { ok: true }>
  ) {
    const table = probe.schema ? `${probe.schema}.${probe.table}` : probe.table
    const why =
      result.reason === 'violations'
        ? `rows in ${table} already break the check being added`
        : result.reason === 'too-large'
          ? `${table} has about ${result.estimate} rows, more than the ${CHECK_PROBE_MAX_ROWS} the probe will scan; add the constraint by hand (NOT VALID, then VALIDATE) in a window that suits it`
          : `the scan of ${table} did not finish in time`
    super(`[PKU-DB-CHECK-PROBE] ${migration}: ${why}. Nothing was applied.`)
    this.name = 'CheckProbeError'
  }
}

/**
 * The `beforeMigration` hook for `migrate` that runs a migration's probes
 * against the live database and refuses the migration if any fails.
 */
export const checkProbeHook =
  (
    dialect: CheckProbeDialect,
    execute: ProbeExecutor,
    options?: CheckProbeOptions
  ) =>
  async (name: string, sql: string): Promise<void> => {
    for (const probe of probesIn(sql)) {
      const result = await runCheckProbe(dialect, probe, execute, options)
      if (!result.ok) throw new CheckProbeError(name, probe, result)
    }
  }

interface QueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  begin?<T>(handler: (client: QueryClient) => Promise<T>): Promise<T>
}

/**
 * A `ProbeExecutor` over a Postgres migration client. The scan runs in a
 * transaction of its own under `SET LOCAL statement_timeout`, so the server
 * cancels it rather than leaving it running after the probe has given up.
 */
export const postgresProbeExecutor =
  (client: QueryClient): ProbeExecutor =>
  async (sql, timeoutMs) => {
    const run = async (tx: QueryClient) => {
      await tx.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`)
      return (await tx.query<Record<string, unknown>>(sql)).rows
    }
    if (typeof client.begin === 'function') return client.begin(run)
    await client.query('BEGIN')
    try {
      return await run(client)
    } finally {
      await client.query('ROLLBACK')
    }
  }

/**
 * A `ProbeExecutor` over a MySQL migration client. MySQL gives a plain client
 * no way to cancel a running `SELECT` from outside, so a probe that times out is
 * abandoned, not stopped; the connection is closed when the run ends.
 */
export const mysqlProbeExecutor =
  (client: QueryClient): ProbeExecutor =>
  async (sql) =>
    (await client.query<Record<string, unknown>>(sql)).rows
