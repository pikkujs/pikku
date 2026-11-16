/**
 * Adding, dropping and changing a `CHECK` on a column that already exists, on
 * postgres and MySQL. The probe that asks whether the rows already in
 * the table satisfy a new check is in `@pikku/migrator-sql`, since the runners
 * that apply migrations are what read it.
 *
 * SQLite cannot alter a constraint at all, so Pikku writes no CHECK there and
 * it is not here (see `sqlite-constraint-notice.ts`).
 */
import { checkProbeLine } from '@pikku/migrator-sql'
import type { ColumnCheck, ColumnInfo } from './db-introspector.js'
import { checkFingerprint, closingQuote } from './check-enums.js'

/** The oldest MySQL that enforces a `CHECK`; before it the clause is parsed and ignored. */
export const MYSQL_MIN_CHECK_VERSION = '8.0.16'

/** The databases whose `CHECK` syntax is written here. */
export type CheckDialect = 'postgres' | 'mysql'

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
 * The shape of a name `checkName` gives: `<readable front>_<8 hex>_<kind>_check`.
 * The hash is of the table and column the check was generated for, so after a
 * table or column is renamed by hand the check keeps a name that no longer
 * matches `checkName` for where it sits. Recognising the shape, rather than the
 * exact name, is what lets such a check be found and replaced; a name a person
 * chose that does not have this shape is never touched.
 */
const GENERATED_NAME =
  /_[0-9a-f]{8}_(?:enum|min|max|minlength|maxlength)_check$/

/** Whether `name` is one a declaration generated, for this column or for where it was before a rename. */
export const isGeneratedCheckName = (name: string): boolean =>
  GENERATED_NAME.test(name)

/**
 * How the constraints on an existing column differ from its declaration.
 *
 * A check counts as present when the migrations hold one of the same name and
 * condition, or the same condition under another name that stays, since a person
 * who hand-wrote a migration may have named it as they liked. A check this plan
 * drops never counts as present, so the declared bound is always left enforced
 * under its expected name.
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
  for (const check of held) {
    if (
      isGeneratedCheckName(check.name) &&
      !wanted.some((w) => w.name === check.name)
    ) {
      plan.drop.push(check.name)
      plan.reasons.push(
        wanted.some(
          (w) =>
            checkFingerprint(w.expression) ===
            checkFingerprint(check.expression)
        )
          ? `${check.name} (${check.expression}) is named for a table or column that has since been renamed`
          : `${check.name} (${check.expression}) is no longer declared`
      )
    }
  }
  // A check MySQL holds `NOT ENFORCED` is ignored by the server, so it never
  // stands in for a declared bound.
  const staying = held.filter(
    (h) => !plan.drop.includes(h.name) && h.enforced !== false
  )
  for (const check of wanted) {
    const sameName = held.find((h) => h.name === check.name)
    if (sameName?.enforced === false) {
      plan.drop.push(check.name)
      plan.add.push(check)
      plan.reasons.push(
        `${check.name} is NOT ENFORCED in the migrations, so the server ignores it`
      )
    } else if (sameName) {
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
      !staying.some(
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
      i = closingQuote(definition, i) - 1
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
      i = closingQuote(expression, i)
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
 * The statement that drops one named check. MySQL, from 8.0.16, spells it
 * `DROP CHECK` (it accepts `DROP CONSTRAINT` only from 8.0.19); postgres
 * `DROP CONSTRAINT`.
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

/** What Postgres keeps of an identifier (bytes); MySQL's 64 characters is never more than this. */
const MAX_CHECK_NAME_BYTES = 63

/**
 * The name a changed check is held under while its replacement goes in:
 * `pikku_next_` and the name, with the readable front of the name cut, by code
 * point, when that would not fit. The end of a generated name (its hash and
 * `_<kind>_check`) is what is kept, so the interim name stays unique and ends
 * the same way.
 */
export const interimCheckName = (name: string) => {
  const marker = 'pikku_next_'
  const chars = [...name]
  while (
    chars.length > 1 &&
    Buffer.byteLength(marker + chars.join('')) > MAX_CHECK_NAME_BYTES
  ) {
    chars.shift()
  }
  return marker + chars.join('')
}

/**
 * Every statement a column's constraint plan needs, in the order that is safe.
 *
 * Postgres runs the migration in one transaction, so dropping a check and
 * adding its replacement is atomic. MySQL commits each DDL
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
  // A bound is never left unenforced: what is added goes in before what is
  // dropped, so a replacement the rows refuse leaves the old check in place.
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
  for (const name of plan.drop) if (!changed.has(name)) out.push(drop(name))
  return out
}

/** The one sentence a MariaDB server is refused with. */
export const MARIADB_REFUSAL =
  'MariaDB is not supported; use MySQL 8.0.16+ or Postgres'

/**
 * What a MySQL-protocol server's `version()` string says about `CHECK`:
 * `'mariadb'` for a server this does not support, `'too-old'` for a MySQL that
 * parses a `CHECK` and ignores it, otherwise `'ok'`. `8.0.36` and
 * `8.0.36-0ubuntu1` and Aurora MySQL 3's `8.0.mysql_aurora.3.04.0` are understood.
 */
export function mysqlCheckSupport(
  version: string
): 'ok' | 'too-old' | 'mariadb' {
  if (/mariadb/i.test(version)) return 'mariadb'
  // Aurora MySQL 3 reports `8.0.mysql_aurora.3.04.0`: the engine is MySQL 8.0.23+
  // compatible (its first release, 3.01.0, is 8.0.23), so it enforces CHECK.
  // Aurora 2 is 5.7-compatible and reports `5.7.mysql_aurora.2.x`.
  const aurora = /^8\.0\.mysql_aurora\.(\d+)\.\d+\.\d+/.exec(version)
  if (aurora) return Number(aurora[1]) >= 3 ? 'ok' : 'too-old'
  const found = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!found) return 'too-old'
  const [a, b, c] = found.slice(1).map(Number) as [number, number, number]
  const [x, y, z] = MYSQL_MIN_CHECK_VERSION.split('.').map(Number) as [
    number,
    number,
    number,
  ]
  const enforces = a !== x ? a > x : b !== y ? b > y : c >= z
  return enforces ? 'ok' : 'too-old'
}

/**
 * The refusal for a MySQL server that would silently ignore (or, for MariaDB,
 * is not supported for) the constraints a declaration asks for, or `undefined`
 * when the server enforces them. Said up front from the declaration: an older
 * server reports no checks on either side, so nothing downstream would notice
 * that none were ever applied.
 */
export function mysqlCheckRefusal(
  support: ReturnType<typeof mysqlCheckSupport>,
  declared: readonly string[],
  tablesFile: string
): string | undefined {
  if (support === 'ok' || declared.length === 0) return undefined
  return (
    `${tablesFile} declares constraints (${declared.join(', ')}), ` +
    (support === 'mariadb'
      ? `${MARIADB_REFUSAL}.`
      : `but this MySQL server is older than ${MYSQL_MIN_CHECK_VERSION}, which parses a CHECK and ignores it, so generate will not write one. ` +
        `Upgrade the server, or take the constraints out of ${tablesFile}.`)
  )
}
