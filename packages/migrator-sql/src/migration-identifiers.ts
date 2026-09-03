/**
 * Catching camelCase columns at migrate time, before they can half-work.
 *
 * Pikku's Kysely runs with `CamelCasePlugin`, so `priceCents` in TypeScript is
 * `price_cents` in SQL and nothing else. A migration that declares the column
 * *as* `priceCents` is not merely unconventional — it is broken in the one way
 * that hides itself: `.selectAll()` compiles to `SELECT *` and never names an
 * identifier, so the table reads back perfectly, while the first query that
 * names the column (`.select(['animal.priceCents'])`) asks for `price_cents`
 * and gets `no such column`. The usual conclusion is that the plugin is broken,
 * and the usual response is a raw `sql` template or a retreat to `.selectAll()`
 * — both of which keep the real cause alive.
 *
 * There is no exception to escape. Even the Better Auth schema `db generate`
 * writes is snake_case (`email_verified`, `user_id`), because Better Auth is
 * handed the app's own Kysely and its camelCase field names compile the same
 * way everyone else's do.
 */

import { splitStatements } from './schema-sql.js'

/** A camelCase identifier a migration declares, and what it should have said. */
export interface CamelCaseIdentifier {
  file: string
  table: string
  /** `null` when the table name itself is the offender. */
  column: string | null
  suggestion: string
}

export class CamelCaseIdentifierError extends Error {
  constructor(public readonly offenders: CamelCaseIdentifier[]) {
    const lines = offenders.map(
      (o) =>
        `  ${o.file}  ${o.column === null ? o.table : `${o.table}.${o.column}`}  →  ${o.suggestion}`
    )
    super(
      `[PKU-DB-CAMEL] Migrations declare camelCase identifiers.\n\n` +
        `Pikku's Kysely runs with CamelCasePlugin, which maps camelCase in TypeScript\n` +
        `to snake_case in SQL. A camelCase column half-works: \`.selectAll()\` emits\n` +
        `\`SELECT *\` so the table reads fine, but naming the column compiles it to\n` +
        `snake_case and the database answers \`no such column\`.\n\n` +
        `${lines.join('\n')}\n\n` +
        `Fix the column definition in the migration file itself and replay your dev\n` +
        `database from scratch. Do not write a RENAME COLUMN migration — that leaves\n` +
        `the banned identifier in a SQL file forever.`
    )
    this.name = 'CamelCaseIdentifierError'
  }
}

/**
 * Strip comments so a word in prose can never be read as an identifier.
 *
 * `splitStatements` already skips over comments when it looks for a boundary,
 * but it hands back the statement with them still in it, and `-- the userId
 * column` would otherwise be flagged. Quoting rules are honoured for the same
 * reason they are there: `'a -- b'` is a string, not a comment.
 */
export function stripSqlComments(sql: string): string {
  let out = ''
  let i = 0

  while (i < sql.length) {
    const ch = sql[i]!

    if (ch === "'" || ch === '"' || ch === '`') {
      const start = i
      i++
      while (i < sql.length) {
        if (sql[i] === '\\' && ch === "'") {
          i += 2
          continue
        }
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      out += sql.slice(start, i)
      continue
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
      continue
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      // A block comment can span lines, and removing it outright would join two
      // statements onto one line. A space keeps the tokens either side apart.
      out += ' '
      continue
    }

    out += ch
    i++
  }

  return out
}

const IDENTIFIER = String.raw`"[^"]*"|\`[^\`]*\`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9$]*`

const CREATE_TABLE = new RegExp(
  String.raw`^CREATE\s+(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+?)\s*\(`,
  'i'
)

const ALTER_TABLE = new RegExp(
  String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(\S+)`,
  'i'
)

const ADD_COLUMN = new RegExp(
  String.raw`^\s*ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENTIFIER})`,
  'i'
)

const COLUMN_NAME = new RegExp(String.raw`^\s*(${IDENTIFIER})`)

/**
 * The words that open a table-level constraint rather than a column.
 *
 * Only consulted for an unquoted first token: `"check"` in quotes is a column
 * named check, however unwise, and skipping it would let `"checkedAt"`'s
 * neighbours hide behind it.
 */
const CONSTRAINT_KEYWORDS = new Set([
  'constraint',
  'primary',
  'foreign',
  'unique',
  'check',
  'exclude',
  'index',
  'key',
  'like',
  'period',
  'fulltext',
  'spatial',
])

/** Drop the quoting a dialect happens to use, leaving the identifier itself. */
const unquote = (name: string): string =>
  /^["`[]/.test(name) ? name.slice(1, -1) : name

const isCamelCase = (name: string): boolean => /[a-z][A-Z]/.test(name)

const toSnakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/**
 * Walk `sql` from `from` and return the offsets just inside and just outside
 * the parenthesised group that starts there, or `null` if it never closes.
 *
 * Quote-aware, because a `)` inside `DEFAULT ')'` closes nothing.
 */
function parenSpan(
  sql: string,
  from: number
): { start: number; end: number } | null {
  let depth = 0
  let i = from

  while (i < sql.length) {
    const ch = sql[i]!

    if (ch === "'" || ch === '"' || ch === '`') {
      i++
      while (i < sql.length && sql[i] !== ch) i++
      i++
      continue
    }

    if (ch === '(') {
      depth++
      if (depth === 1) from = i + 1
    } else if (ch === ')') {
      depth--
      if (depth === 0) return { start: from, end: i }
    }

    i++
  }

  return null
}

/**
 * Split a definition list on the commas that separate its items.
 *
 * The commas inside `NUMERIC(10,2)`, a `CHECK (x IN ('a','b'))` or a compound
 * `PRIMARY KEY (a, b)` belong to those and not to the list, so only depth zero
 * counts.
 */
function splitTopLevel(list: string): string[] {
  const items: string[] = []
  let depth = 0
  let start = 0
  let i = 0

  while (i < list.length) {
    const ch = list[i]!

    if (ch === "'" || ch === '"' || ch === '`') {
      i++
      while (i < list.length && list[i] !== ch) i++
      i++
      continue
    }

    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      items.push(list.slice(start, i))
      start = i + 1
    }

    i++
  }

  items.push(list.slice(start))
  return items.filter((item) => item.trim().length > 0)
}

/**
 * Every camelCase identifier one migration file declares.
 *
 * Only declarations are read — a `CREATE TABLE` column list and an `ALTER TABLE
 * … ADD COLUMN`. Everywhere else an identifier merely refers to something that
 * was declared somewhere, and reporting those would name the same mistake once
 * per reference while adding nothing to the fix.
 */
export function findCamelCaseIdentifiers(
  file: string,
  sql: string
): CamelCaseIdentifier[] {
  const offenders: CamelCaseIdentifier[] = []

  for (const statement of splitStatements(stripSqlComments(sql))) {
    const create = CREATE_TABLE.exec(statement)
    if (create) {
      const table = unquote(create[1]!.split('.').pop()!)
      if (isCamelCase(table)) {
        offenders.push({
          file,
          table,
          column: null,
          suggestion: toSnakeCase(table),
        })
      }

      const span = parenSpan(statement, create.index + create[0]!.length - 1)
      if (!span) continue

      for (const item of splitTopLevel(statement.slice(span.start, span.end))) {
        const name = COLUMN_NAME.exec(item)?.[1]
        if (!name) continue
        if (CONSTRAINT_KEYWORDS.has(name.toLowerCase())) continue
        const column = unquote(name)
        if (isCamelCase(column)) {
          offenders.push({
            file,
            table,
            column,
            suggestion: toSnakeCase(column),
          })
        }
      }
      continue
    }

    const alter = ALTER_TABLE.exec(statement)
    if (!alter) continue

    const table = unquote(alter[1]!.split('.').pop()!)
    // Postgres lets one ALTER carry several actions, and only the ADDs declare.
    for (const action of splitTopLevel(
      statement.slice(alter[0]!.length).replace(/;\s*$/, '')
    )) {
      const name = ADD_COLUMN.exec(action)?.[1]
      if (!name) continue
      if (CONSTRAINT_KEYWORDS.has(name.toLowerCase())) continue
      const column = unquote(name)
      if (isCamelCase(column)) {
        offenders.push({
          file,
          table,
          column,
          suggestion: toSnakeCase(column),
        })
      }
    }
  }

  return offenders
}

/**
 * Bail unless every migration on disk is snake_case throughout.
 *
 * Reports all of them at once: a camelCase column is rarely alone, and a
 * one-at-a-time failure turns a single edit into one migrate run per column.
 */
export function assertSnakeCaseIdentifiers(
  migrations: Array<{ name: string; sql: string }>
): void {
  const offenders = migrations.flatMap(({ name, sql }) =>
    findCamelCaseIdentifiers(name, sql)
  )
  if (offenders.length > 0) throw new CamelCaseIdentifierError(offenders)
}
