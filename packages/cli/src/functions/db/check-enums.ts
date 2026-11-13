/**
 * A `CHECK (col IN ('a','b',…))` constraint is an enum by another name, and
 * both introspectors read one back as SQL text: SQLite stores the `CREATE
 * TABLE` verbatim, Postgres hands back a normalised `pg_get_constraintdef`.
 * The parsing they need differs, but the quoting rules do not, so both go
 * through here.
 */

/**
 * Blank out `--` line comments and `/* … *\/` block comments, leaving a string
 * of the same shape so offsets and line breaks still line up.
 *
 * Quoted text is skipped rather than scanned: `'a--b'` is a value, not a
 * comment. The reverse — reading a comment as SQL — is what makes this
 * necessary at all: an apostrophe in `-- the clinician's copy` opens a string
 * that runs to the next quote in the real list, and a bracket in `-- (see
 * below)` closes the list early. Either way the CHECK survives as a union that
 * is wrong, which is worse than no union.
 */
export function stripSqlComments(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]!
    if (c === "'" || c === '"') {
      const end = closingQuote(sql, i)
      out += sql.slice(i, end)
      i = end
      continue
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2)
      const end = close === -1 ? sql.length : close + 2
      for (let k = i; k < end; k++) out += sql[k] === '\n' ? '\n' : ' '
      i = end
      continue
    }
    out += c
    i++
  }
  return out
}

/** Index just past the quoted run starting at `start`, doubled quotes included. */
export function closingQuote(sql: string, start: number): number {
  const quote = sql[start]!
  let i = start + 1
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  return sql.length
}

/** The single-quoted literals in `text`, with doubled quotes unescaped. */
export function quotedValues(text: string): string[] {
  return [...text.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1]!.replace(/''/g, "'")
  )
}

/**
 * Map each column constrained by a `CHECK (col IN (…))` in a `CREATE TABLE`
 * statement to its allowed values. Only the positive `col IN (…)` form is
 * recognised (the convention); `NOT IN`, ranges and boolean expressions are
 * left for the column to stay a plain string.
 */
export function parseCheckEnumsFromDdl(ddl: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const sql = stripSqlComments(ddl)
  const checkIn = /CHECK\s*\(\s*"?(\w+)"?\s+IN\s*\(([^)]*)\)/gi
  let m: RegExpExecArray | null
  while ((m = checkIn.exec(sql))) {
    const values = quotedValues(m[2]!)
    if (values.length > 0) out.set(m[1]!, values)
  }
  return out
}

/**
 * The allowed values in a Postgres check constraint, or `undefined` when the
 * constraint is not an enumeration.
 *
 * Postgres does not store the `IN (…)` you wrote — `pg_get_constraintdef`
 * rewrites it as `= ANY (ARRAY[…])`, with each element cast to the column's
 * type. Matching that shape is deliberate: `NOT IN` normalises to `<> ALL
 * (ARRAY[…])` and a range to `>`/`<`, and neither is an enum.
 */
export function parseCheckEnumValues(
  constraintDef: string
): string[] | undefined {
  const any = /=\s*ANY\s*\(\s*\(?\s*ARRAY\s*\[([^\]]*)\]/i.exec(constraintDef)
  if (!any) return undefined
  const values = quotedValues(any[1]!)
  return values.length > 0 ? values : undefined
}

/**
 * A check's condition in one spelling, so two readings of the same constraint
 * compare equal: whitespace collapsed, and any parentheses wrapping the whole
 * condition removed.
 */
export function normaliseCheck(expression: string): string {
  let text = expression.replace(/\s+/g, ' ').trim()
  while (text.startsWith('(') && closingParen(text, 0) === text.length - 1) {
    text = text.slice(1, -1).trim()
  }
  return text
}

/** Index of the parenthesis closing the one at `open`, or -1. Quoted text is skipped. */
function closingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]!
    if (c === "'" || c === '"' || c === '`') {
      i = closingQuote(text, i) - 1
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** A condition from Postgres's `pg_get_constraintdef`: `CHECK ((a >= 0))` → `a >= 0`. */
export function postgresCheckExpression(constraintDef: string): string {
  const open = constraintDef.indexOf('(')
  const close = open === -1 ? -1 : closingParen(constraintDef, open)
  return normaliseCheck(
    open === -1 || close === -1
      ? constraintDef
      : constraintDef.slice(open + 1, close)
  )
}

const unquoteIdentifier = (name: string): string =>
  /^["`[]/.test(name) ? name.slice(1, -1).replace(/""/g, '"') : name

/** Top-level pieces of a parenthesised list, split on commas outside quotes and brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === "'" || c === '"' || c === '`') {
      i = closingQuote(text, i) - 1
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
    } else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** Every `[CONSTRAINT name] CHECK (…)` in `text`, outside quotes. */
function findChecks(text: string): { name: string; expression: string }[] {
  const found: { name: string; expression: string }[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === "'" || c === '"' || c === '`') {
      i = closingQuote(text, i) - 1
      continue
    }
    const match = /^check\s*\(/i.exec(text.slice(i))
    if (!match || /\w/.test(text[i - 1] ?? ' ')) continue
    const open = i + match[0].length - 1
    const close = closingParen(text, open)
    if (close === -1) break
    const named =
      /constraint\s+("(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|\w+)\s*$/i.exec(
        text.slice(0, i)
      )
    found.push({
      name: named ? unquoteIdentifier(named[1]!) : '',
      expression: normaliseCheck(text.slice(open + 1, close)),
    })
    i = close
  }
  return found
}

/**
 * The `CHECK` constraints on each column of a SQLite `CREATE TABLE`, read from
 * the statement SQLite stores verbatim.
 *
 * A check written on a column definition belongs to that column. A table-level
 * one belongs to a column only when its condition names exactly one of the
 * table's columns; a check across several belongs to none.
 */
export function parseSqliteChecks(
  ddl: string,
  columns: readonly string[]
): Map<string, { name: string; expression: string }[]> {
  const out = new Map<string, { name: string; expression: string }[]>()
  const add = (column: string, check: { name: string; expression: string }) =>
    out.set(column, [...(out.get(column) ?? []), check])

  const sql = stripSqlComments(ddl)
  const open = sql.indexOf('(')
  const close = open === -1 ? -1 : closingParen(sql, open)
  if (close === -1) return out

  for (const part of splitTopLevel(sql.slice(open + 1, close))) {
    const definition = part.trim()
    const first = /^("(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|\w+)/.exec(definition)
    if (!first) continue
    const keyword = first[1]!.toLowerCase()
    if (['primary', 'unique', 'foreign'].includes(keyword)) continue
    if (keyword === 'constraint' || keyword === 'check') {
      for (const check of findChecks(definition)) {
        const named = new Set(
          [
            ...stripStrings(check.expression).matchAll(
              /"((?:[^"]|"")+)"|`([^`]+)`|\[([^\]]+)\]|\b(\w+)\b/g
            ),
          ]
            .map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!.replace(/""/g, '"'))
            .filter((name) => columns.includes(name))
        )
        if (named.size === 1) add([...named][0]!, check)
      }
      continue
    }
    for (const check of findChecks(definition)) {
      add(unquoteIdentifier(first[1]!), check)
    }
  }
  return out
}

/**
 * The column a MySQL check condition restricts, when it names exactly one of
 * the table's columns. MySQL keeps no link between a check and a column, only
 * the condition, with every identifier backtick-quoted.
 */
export function mysqlCheckColumn(
  clause: string,
  columns: readonly string[]
): string | undefined {
  const named = new Set(
    [...stripStrings(clause).matchAll(/`([^`]+)`/g)]
      .map((m) => m[1]!)
      .filter((name) => columns.includes(name))
  )
  return named.size === 1 ? [...named][0] : undefined
}

/** `text` with every quoted string blanked, so a value that looks like a column is not read as one. */
function stripStrings(text: string): string {
  return text.replace(/'(?:[^']|'')*'/g, "''")
}

/** The allowed values of a MySQL `` `col` in ('a', 'b') `` check, or `undefined` when it is not one. */
export function mysqlCheckEnumValues(clause: string): string[] | undefined {
  const match = /^\(?\s*`[^`]+`\s+in\s*\(([^)]*)\)\s*\)?$/i.exec(clause.trim())
  if (!match) return undefined
  const values = quotedValues(match[1]!)
  return values.length > 0 ? values : undefined
}

/**
 * A check's condition reduced to what it means, for telling a constraint the
 * declaration generated from the same one written by hand under another name:
 * identifier quotes gone, keywords and names lower-cased, whitespace dropped.
 * String values are kept exactly, since `'A'` and `'a'` are different values.
 */
export function checkFingerprint(expression: string): string {
  return normaliseCheck(expression)
    .split(/('(?:[^']|'')*')/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/["`]/g, '').replace(/\s+/g, '').toLowerCase()
    )
    .join('')
}
