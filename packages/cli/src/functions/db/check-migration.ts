/**
 * Adding, dropping and changing a `CHECK` on a column that already exists, on
 * postgres, MySQL and MariaDB. The probe that asks whether the rows already in
 * the table satisfy a new check is in `@pikku/migrator-sql`, since the runners
 * that apply migrations are what read it.
 *
 * SQLite cannot alter a constraint at all, so it is not here (see
 * `sqlite-rebuild.ts`).
 */
import { checkProbeLine } from '@pikku/migrator-sql'
import type { ColumnCheck, ColumnInfo } from './db-introspector.js'
import { checkFingerprint } from './check-enums.js'

/** The oldest MySQL that enforces a `CHECK`; before it the clause is parsed and ignored. */
export const MYSQL_MIN_CHECK_VERSION = '8.0.16'

/** MariaDB has enforced `CHECK` since 10.2.1. */
const MARIADB_MIN_CHECK_VERSION = [10, 2] as const

/** What a server's `version()` says it is, as far as `CHECK` syntax goes. */
export type CheckDialect = 'postgres' | 'mysql' | 'mariadb'

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

/**
 * `expression` made single-spaced where it is code, and untouched inside a
 * string or a quoted identifier, where a run of spaces is part of the value.
 * A comment in it is refused: it would swallow whatever follows on its line.
 */
export function singleSpaced(expression: string): string {
  let out = ''
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]!
    if (ch === "'" || ch === '"' || ch === '`') {
      const from = i
      i++
      while (i < expression.length) {
        if (expression[i] === ch) {
          if (expression[i + 1] === ch) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      out += expression.slice(from, i)
    } else if (
      (ch === '-' && expression[i + 1] === '-') ||
      (ch === '/' && expression[i + 1] === '*')
    ) {
      throw new Error(
        `a comment in the check ${JSON.stringify(expression)} cannot be probed`
      )
    } else if (/\s/.test(ch)) {
      while (/\s/.test(expression[i] ?? '') && i < expression.length) i++
      out += ' '
    } else {
      out += ch
      i++
    }
  }
  return out.trim()
}

/** The `SELECT` that finds a row breaking `expression`, if the table has one. */
export function checkProbeSql(qualifiedTable: string, expression: string) {
  return `SELECT 1 FROM ${qualifiedTable} WHERE NOT (${singleSpaced(expression)}) LIMIT 1`
}

/** Where a check is added: the names for the probe, the quoted form for the SQL. */
export interface CheckTable {
  schema?: string
  table: string
  qualified: string
}

/**
 * The statements that add one check to a table that exists, and the probe line
 * that comes first.
 *
 * Postgres adds it `NOT VALID` and validates it in a second statement. That
 * split only shortens the time writes are blocked when the two run in separate
 * transactions; the migrator runs a whole migration in one, so there the table
 * stays locked from the add to the commit, validating scan included. It is kept
 * because it is the form a runner that does apply statements one at a time
 * benefits from, and costs nothing otherwise. MySQL has no such split.
 */
export function addCheckStatements(
  dialect: CheckDialect,
  where: CheckTable,
  name: string,
  expression: string,
  quote: Quote
): string[] {
  const probe = checkProbeLine({
    ...(where.schema ? { schema: where.schema } : {}),
    table: where.table,
    sql: checkProbeSql(where.qualified, expression),
  })
  const add = `ALTER TABLE ${where.qualified} ADD CONSTRAINT ${quote(name)} CHECK (${expression})`
  return dialect === 'postgres'
    ? [
        `${probe}\n${add} NOT VALID;`,
        `ALTER TABLE ${where.qualified} VALIDATE CONSTRAINT ${quote(name)};`,
      ]
    : [`${probe}\n${add};`]
}

/**
 * The statement that drops one named check. MariaDB spells it `DROP
 * CONSTRAINT`; MySQL, from 8.0.16, `DROP CHECK` (it accepts `DROP CONSTRAINT`
 * only from 8.0.19); postgres `DROP CONSTRAINT`.
 */
export function dropCheckStatement(
  dialect: CheckDialect,
  qualifiedTable: string,
  name: string,
  quote: Quote
): string {
  return dialect === 'mysql'
    ? `ALTER TABLE ${qualifiedTable} DROP CHECK ${quote(name)};`
    : `ALTER TABLE ${qualifiedTable} DROP CONSTRAINT ${quote(name)};`
}

/** The name a changed check is held under while its replacement goes in. */
export const interimCheckName = (name: string) =>
  `pikku_next_${name}`.slice(0, 64)

/**
 * Every statement a column's constraint plan needs, in the order that is safe.
 *
 * Postgres runs the migration in one transaction, so dropping a check and
 * adding its replacement is atomic. MySQL and MariaDB commit each DDL
 * statement, so doing the same there would leave the column with no check if
 * the replacement is refused by rows that break it, and a rerun would then fail
 * on the drop. A changed check therefore goes in first under an interim name
 * (the step rows can fail), the old one is dropped, the final name added (it
 * cannot fail: the interim check has held every row to it), and the interim one
 * dropped. A rerun after any of the later steps still fails; the first leaves
 * the table untouched.
 */
export function checkChangeStatements(
  dialect: CheckDialect,
  where: CheckTable,
  plan: { drop: string[]; add: { name: string; expression: string }[] },
  quote: Quote
): string[] {
  const drop = (name: string) =>
    dropCheckStatement(dialect, where.qualified, name, quote)
  const add = (name: string, expression: string) =>
    addCheckStatements(dialect, where, name, expression, quote)
  const changed = new Set(
    plan.add.filter((c) => plan.drop.includes(c.name)).map((c) => c.name)
  )
  const out: string[] = []
  if (dialect === 'postgres') {
    for (const name of plan.drop) out.push(drop(name))
    for (const check of plan.add) out.push(...add(check.name, check.expression))
    return out
  }
  for (const name of plan.drop) if (!changed.has(name)) out.push(drop(name))
  for (const check of plan.add) {
    if (!changed.has(check.name)) {
      out.push(...add(check.name, check.expression))
      continue
    }
    const interim = interimCheckName(check.name)
    out.push(
      ...add(interim, check.expression),
      drop(check.name),
      `ALTER TABLE ${where.qualified} ADD CONSTRAINT ${quote(check.name)} CHECK (${check.expression});`,
      drop(interim)
    )
  }
  return out
}

/**
 * What a server's `version()` string says it is, or `undefined` when it is too
 * old to enforce a `CHECK` (the clause is parsed and ignored there).
 * `8.0.36`, `8.0.36-0ubuntu1`, `11.4.2-MariaDB`, and the `5.5.5-10.11.6-MariaDB`
 * a MariaDB reports to a client that predates it, are all understood.
 */
export function mysqlCheckDialect(
  version: string
): 'mysql' | 'mariadb' | undefined {
  if (/mariadb/i.test(version)) {
    const found = /(?:^5\.5\.5-)?(\d+)\.(\d+)\.\d+/.exec(version)
    if (!found) return undefined
    const [major, minor] = [Number(found[1]), Number(found[2])]
    const [needMajor, needMinor] = MARIADB_MIN_CHECK_VERSION
    return major > needMajor || (major === needMajor && minor >= needMinor)
      ? 'mariadb'
      : undefined
  }
  const found = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!found) return undefined
  const [a, b, c] = found.slice(1).map(Number) as [number, number, number]
  const [x, y, z] = MYSQL_MIN_CHECK_VERSION.split('.').map(Number) as [
    number,
    number,
    number,
  ]
  const enforces = a !== x ? a > x : b !== y ? b > y : c >= z
  return enforces ? 'mysql' : undefined
}

/** Whether `version` enforces `CHECK`. */
export const mysqlEnforcesChecks = (version: string): boolean =>
  mysqlCheckDialect(version) !== undefined
