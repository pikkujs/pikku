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
    super(`[PKU-DB-CHECK-PROBE] ${migration}: ${why}.`)
    this.name = 'CheckProbeError'
  }
}

const DATA_CHANGE = new Set(['update', 'delete', 'insert', 'truncate', 'merge'])

/**
 * Statements that start with a word of their own and change data all the same:
 * MySQL's `REPLACE` and `LOAD DATA`, and `CALL` (a procedure can do anything).
 */
const DATA_CHANGE_FIRST_WORD = new Set(['replace', 'call', 'load'])

/** A word anywhere in the body of a `DO` block that could be a data change. */
const DO_BODY_CHANGE =
  /\b(?:update|delete|insert|truncate|merge|replace|call|copy|execute)\b/i

/** `body` with comments, string literals and quoted names blanked, so a word in one is not read as a statement. */
const withoutQuotedText = (body: string): string =>
  body.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"/g, ' ')

/** Whether the text of a `DO` block could change data. */
const doBodyChangesData = (body: string): boolean =>
  DO_BODY_CHANGE.test(withoutQuotedText(body))

/**
 * Where the first statement that can change data starts, or -1. Read as SQL
 * rather than as lines: a statement need not start a line, a `WITH` can carry a
 * data-changing CTE (`WITH f AS (UPDATE ... RETURNING *) SELECT ...`) or end in
 * one (`WITH s AS (...) UPDATE ...`), and `ON DELETE`, `FOR UPDATE`, strings,
 * comments, quoted names and `$$` bodies are not statements.
 *
 * Also read as a data change: `REPLACE`, `CALL` and `LOAD DATA` as a statement,
 * `COPY ... FROM` (not `COPY ... TO`), a `DO` block whose body has an `UPDATE`,
 * `DELETE`, `INSERT`, `TRUNCATE`, `MERGE`, `REPLACE`, `CALL`, `COPY` or `EXECUTE`
 * anywhere in it, and `EXPLAIN` of a statement that changes data (which runs it
 * under `ANALYZE`). The last two over-read on purpose: a `FOR UPDATE` in a `DO`
 * body, or a plain `EXPLAIN UPDATE`, stops the probes, which is a probe that
 * does not run, never a probe that ran on rows a statement had changed. What no
 * scan can see is a function with side effects called from a `SELECT`.
 */
function firstDataChange(sql: string): number {
  let statement = -1 // the first word of the statement being read
  let isWith = false
  let isCopy = false
  let isExplain = false
  let isDo = false
  let depth = 0
  let previous = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]!
    const next = sql[i + 1]
    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl + 1
      continue
    }
    if (ch === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? sql.length : close + 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const opened = i
      i++
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            i += 2
            continue
          }
          break
        }
        i++
      }
      i++
      // `DO '...'`: the body is the string itself, with `''` for a quote.
      if (
        isDo &&
        ch === "'" &&
        doBodyChangesData(
          sql.slice(opened + 1, Math.max(opened + 1, i - 1)).replace(/''/g, "'")
        )
      ) {
        return statement
      }
      previous = ch
      continue
    }
    if (ch === '$') {
      // A dollar tag may hold digits, but not start with one: $f1$ is a tag, $1 a parameter.
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length)
        if (
          isDo &&
          doBodyChangesData(
            sql.slice(i + tag[0].length, close === -1 ? sql.length : close)
          )
        ) {
          return statement
        }
        i = close === -1 ? sql.length : close + tag[0].length
        previous = '$'
        continue
      }
    }
    if (/[A-Za-z_]/.test(ch)) {
      const from = i
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i]!)) i++
      const word = sql.slice(from, i).toLowerCase()
      if (statement === -1) {
        statement = from
        isWith = word === 'with'
        isCopy = word === 'copy'
        isExplain = word === 'explain'
        isDo = word === 'do'
        if (DATA_CHANGE.has(word) || DATA_CHANGE_FIRST_WORD.has(word)) {
          return from
        }
      } else if (
        isWith &&
        DATA_CHANGE.has(word) &&
        (previous === '(' || previous === ')')
      ) {
        return statement
      } else if (isCopy && depth === 0 && word === 'from') {
        return statement
      } else if (isExplain && DATA_CHANGE.has(word)) {
        return statement
      }
      previous = word
      continue
    }
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ';') {
      statement = -1
      isWith = false
      isCopy = false
      isExplain = false
      isDo = false
      depth = 0
    }
    if (!/\s/.test(ch)) previous = ch
    i++
  }
  return -1
}

/**
 * The part of a migration the probes can speak for: everything ahead of its
 * first statement that can change data (`UPDATE`, `DELETE`, `INSERT`,
 * `TRUNCATE`, `MERGE`, including one inside a `WITH`). The probe looks at the
 * rows as they are before the file runs; a data fix earlier in the same file
 * changes them, so a check added after one is left to the database to enforce
 * (it does, and a failure rolls the migration back on Postgres), not refused on
 * rows the fix is about to change.
 */
export function beforeDataChanges(migration: string): string {
  const at = firstDataChange(migration)
  return at === -1 ? migration : migration.slice(0, at)
}

/**
 * The `beforeMigration` hook for `migrate` that runs a migration's probes
 * against the live database, as it is just before that file runs (earlier
 * migrations in the same run have applied), and refuses the migration if any
 * fails. Probes after a data change in the same file are not run.
 */
export const checkProbeHook =
  (
    dialect: CheckProbeDialect,
    execute: ProbeExecutor,
    options?: CheckProbeOptions
  ) =>
  async (name: string, sql: string): Promise<void> => {
    for (const probe of probesIn(beforeDataChanges(sql))) {
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
 * A `ProbeExecutor` over a MySQL migration client. The scan runs under
 * `SET SESSION max_execution_time`, so the server cancels a `SELECT` that runs
 * past the limit instead of leaving it running after the probe has given up.
 * The session's previous value is put back afterwards: the connection is the migration's.
 */
export const mysqlProbeExecutor =
  (client: QueryClient): ProbeExecutor =>
  async (sql, timeoutMs) => {
    // Read before it is changed, so the connection ends as it began: a session
    // that had its own limit keeps it, and one that had none (0) has none.
    const { rows: before } = await client.query<{ previous: unknown }>(
      'SELECT @@SESSION.max_execution_time AS previous'
    )
    const previous =
      Math.max(0, Math.floor(Number(before[0]?.previous ?? 0))) || 0
    await client.query(
      `SET SESSION max_execution_time = ${Math.max(1, Math.floor(timeoutMs))}`
    )
    try {
      return (await client.query<Record<string, unknown>>(sql)).rows
    } finally {
      await client.query(`SET SESSION max_execution_time = ${previous}`)
    }
  }
