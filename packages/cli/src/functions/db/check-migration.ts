/**
 * Adding and dropping a `CHECK` on a column that already exists, on postgres
 * and MySQL; and the probe a deploy runs first to learn whether the rows
 * already in the table satisfy a new one.
 *
 * SQLite cannot alter a constraint at all, so it is not here (see
 * `sqlite-rebuild.ts`).
 */
import type { ColumnCheck, ColumnInfo } from './db-introspector.js'
import { checkFingerprint } from './check-enums.js'

/** How long a deploy lets the probe run before it gives up. */
export const CHECK_PROBE_TIMEOUT_MS = 30_000

/**
 * Above this many estimated rows, `generate` will not write an `ADD CONSTRAINT`
 * on its own. Validating a check scans the table, and a person should decide how.
 */
export const CHECK_PROBE_MAX_ROWS = 10_000_000

/** The oldest MySQL that enforces a `CHECK`; before it the clause is parsed and ignored. */
export const MYSQL_MIN_CHECK_VERSION = '8.0.16'

/** The comment a migration carries above each added check, followed by the probe's SQL. */
export const CHECK_PROBE_MARKER = '-- pikku:check-probe '

type Quote = (name: string) => string

/**
 * What changing the constraints of one existing column takes: the checks to
 * drop (by name) and the ones to add.
 */
export interface ConstraintPlan {
  drop: string[]
  add: ColumnCheck[]
  /** One sentence for each difference, for a message that has to name them. */
  reasons: string[]
}

/**
 * A generated check's name is `<table>_<column>_<kind>_check`. One named like
 * this that the declaration no longer asks for was generated from it once, so
 * its removal is a constraint change; one named otherwise is a person's, and the
 * declaration says nothing about it.
 */
const GENERATED_CHECK = /_(enum|min|max|minlength|maxlength)_check$/

/**
 * How the constraints on an existing column differ from its declaration.
 *
 * A check counts as present when the migrations hold one of the same name and
 * condition, or the same condition under another name, since a person who
 * hand-wrote a migration may have named it as they liked.
 */
export function planConstraints(
  table: string,
  column: string,
  desired: ColumnInfo,
  actual: ColumnInfo
): ConstraintPlan {
  const wanted: ColumnCheck[] = desired.checks ?? []
  const held: ColumnCheck[] = actual.checks ?? []
  const plan: ConstraintPlan = { drop: [], add: [], reasons: [] }
  for (const check of wanted) {
    const sameName = held.find((h) => h.name === check.name)
    if (sameName) {
      if (
        checkFingerprint(sameName.expression) !==
        checkFingerprint(check.expression)
      ) {
        plan.drop.push(check.name)
        plan.add.push(check)
        plan.reasons.push(
          `${check.name} is (${sameName.expression}) in the migrations and (${check.expression}) in the declaration`
        )
      }
    } else if (
      !held.some(
        (h) =>
          checkFingerprint(h.expression) === checkFingerprint(check.expression)
      )
    ) {
      plan.add.push(check)
      plan.reasons.push(
        `${check.name} (${check.expression}) is not in the migrations`
      )
    }
  }
  for (const check of held) {
    if (
      check.name.startsWith(`${table}_${column}_`) &&
      GENERATED_CHECK.test(check.name) &&
      !wanted.some((w) => w.name === check.name)
    ) {
      plan.drop.push(check.name)
      plan.reasons.push(
        `${check.name} (${check.expression}) is no longer declared`
      )
    }
  }
  return plan
}

/**
 * The condition of `constraint "name" check (...)` as a definition wrote it, or
 * `undefined` when it holds no such check. Taken from the SQL that creates the
 * column in a new table rather than from the introspected text, because that is
 * what the engine was given.
 */
export function inlineCheckExpression(
  definition: string,
  name: string
): string | undefined {
  const header = new RegExp(
    `constraint\\s+["\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["\`]\\s+check\\s*\\(`,
    'i'
  ).exec(definition)
  if (!header) return undefined
  const start = header.index + header[0].length
  let depth = 1
  let i = start
  while (i < definition.length) {
    const c = definition[i]!
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < definition.length) {
        if (definition[i] === c) {
          if (definition[i + 1] === c) {
            i += 2
            continue
          }
          break
        }
        i++
      }
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) return definition.slice(start, i).trim()
    }
    i++
  }
  return undefined
}

/** The `SELECT` that finds a row breaking `expression`, if the table has one. */
export function checkProbeSql(qualifiedTable: string, expression: string) {
  return `SELECT 1 FROM ${qualifiedTable} WHERE NOT (${expression.replace(/\s+/g, ' ')}) LIMIT 1`
}

/**
 * The statements that add one check to a table that exists.
 *
 * Postgres adds it `NOT VALID` and validates it in a second statement, so the
 * long scan holds a lock that lets writes through; the add itself takes only a
 * brief one. MySQL has no such split and scans while it adds.
 */
export function addCheckStatements(
  dialect: 'postgres' | 'mysql',
  qualifiedTable: string,
  name: string,
  expression: string,
  quote: Quote
): string[] {
  const probe = `${CHECK_PROBE_MARKER}${checkProbeSql(qualifiedTable, expression)}`
  const add = `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quote(name)} CHECK (${expression})`
  return dialect === 'postgres'
    ? [
        `${probe}\n${add} NOT VALID;`,
        `ALTER TABLE ${qualifiedTable} VALIDATE CONSTRAINT ${quote(name)};`,
      ]
    : [`${probe}\n${add};`]
}

/** The statement that drops one check; MySQL spells it `DROP CHECK`, from 8.0.16. */
export function dropCheckStatement(
  dialect: 'postgres' | 'mysql',
  qualifiedTable: string,
  name: string,
  quote: Quote
): string {
  return dialect === 'postgres'
    ? `ALTER TABLE ${qualifiedTable} DROP CONSTRAINT ${quote(name)};`
    : `ALTER TABLE ${qualifiedTable} DROP CHECK ${quote(name)};`
}

/** Whether `version` (`8.0.36`, `8.0.36-0ubuntu1`, `11.4.2-MariaDB`) enforces `CHECK`. */
export function mysqlEnforcesChecks(version: string): boolean {
  if (/mariadb/i.test(version)) {
    const major = /^(\d+)\.(\d+)/.exec(version)
    // MariaDB has enforced CHECK since 10.2.1.
    return major ? Number(major[1]) > 10 || Number(major[2]) >= 2 : false
  }
  const found = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!found) return false
  const [a, b, c] = found.slice(1).map(Number) as [number, number, number]
  const [x, y, z] = MYSQL_MIN_CHECK_VERSION.split('.').map(Number) as [
    number,
    number,
    number,
  ]
  return a !== x ? a > x : b !== y ? b > y : c >= z
}

// ─── The deploy-time probe ───────────────────────────────────────────────────

export interface CheckProbeTarget {
  dialect: 'postgres' | 'mysql'
  /** Schema (postgres) or database (mysql); omitted means the connection's own. */
  schema?: string
  table: string
  /** The `SELECT` from `checkProbeSql`, as carried by the migration's marker. */
  probeSql: string
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

/** Runs `sql` on the target database and returns its rows. Cancelling on timeout is the runner's business. */
export type ProbeExecutor = (
  sql: string,
  timeoutMs: number
) => Promise<Record<string, unknown>[]>

/** The probes a migration body carries, one per added check. */
export function probesIn(migration: string): string[] {
  return migration
    .split('\n')
    .filter((line) => line.startsWith(CHECK_PROBE_MARKER))
    .map((line) => line.slice(CHECK_PROBE_MARKER.length).trim())
}

const rowEstimateSql = ({ dialect, schema, table }: CheckProbeTarget) =>
  dialect === 'postgres'
    ? `SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = '${(schema ? `"${schema}".` : '') + `"${table}"`}'::regclass`
    : `SELECT table_rows AS estimate FROM information_schema.tables WHERE table_schema = ${schema ? `'${schema}'` : 'DATABASE()'} AND table_name = '${table}'`

/**
 * Whether the rows a table holds satisfy a check about to be added to it.
 *
 * Declines without scanning when the table is estimated larger than
 * `maxRows`, which is a decision for a person. Otherwise runs the probe under
 * `timeoutMs`; a probe that does not finish counts as a failure, since the
 * `VALIDATE`/`ADD` that follows would scan just as long.
 */
export async function runCheckProbe(
  target: CheckProbeTarget,
  execute: ProbeExecutor,
  {
    timeoutMs = CHECK_PROBE_TIMEOUT_MS,
    maxRows = CHECK_PROBE_MAX_ROWS,
  }: CheckProbeOptions = {}
): Promise<CheckProbeResult> {
  const [row] = await execute(rowEstimateSql(target), timeoutMs)
  const estimate = Number(row?.estimate ?? 0)
  if (estimate > maxRows) return { ok: false, reason: 'too-large', estimate }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  try {
    const result = await Promise.race([
      execute(target.probeSql, timeoutMs),
      timedOut,
    ])
    if (result === 'timeout') return { ok: false, reason: 'timeout' }
    return result.length > 0
      ? { ok: false, reason: 'violations' }
      : { ok: true }
  } finally {
    clearTimeout(timer)
  }
}
