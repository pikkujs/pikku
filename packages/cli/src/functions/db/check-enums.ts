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

/**
 * The text inside the parenthesis that opens at `open`, or `undefined` when it
 * never closes. Quoted text is skipped, so a `)` inside a value does not end it.
 */
function parenthesised(
  text: string,
  open: number
): { inside: string; end: number } | undefined {
  const close = closingParen(text, open)
  return close === -1
    ? undefined
    : { inside: text.slice(open + 1, close), end: close + 1 }
}

/** The single-quoted literals in `text`, with doubled quotes unescaped. */
export function quotedValues(text: string): string[] {
  return [...text.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1]!.replace(/''/g, "'")
  )
}

/**
 * The values of a list that holds nothing but string literals (each optionally
 * cast, `'a'::text`), or `undefined` when any element is anything else: a call
 * such as `concat('dr', 'aft')`, a `||`, a column. The literals inside such an
 * element are not the values the column allows.
 */
function literalList(list: string): string[] | undefined {
  const values: string[] = []
  for (const element of splitTopLevel(list)) {
    const literal =
      /^\s*'((?:[^']|'')*)'(?:\s*::\s*[\w."\s]+(?:\[\])?)?\s*$/.exec(element)
    if (!literal) return undefined
    values.push(literal[1]!.replace(/''/g, "'"))
  }
  return values.length > 0 ? values : undefined
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
  const checkIn = /CHECK\s*\(\s*"?(\w+)"?\s+IN\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = checkIn.exec(sql))) {
    const list = parenthesised(sql, m.index + m[0].length - 1)
    if (!list) continue
    const values = literalList(list.inside)
    if (values) out.set(m[1]!, values)
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
  const any = /=\s*ANY\s*\(\s*\(?\s*ARRAY\s*\[/i.exec(constraintDef)
  if (!any) return undefined
  // To the `]` that closes the array, skipping quoted values: one may hold `]`.
  const from = any.index + any[0].length
  let i = from
  while (i < constraintDef.length && constraintDef[i] !== ']') {
    i = constraintDef[i] === "'" ? closingQuote(constraintDef, i) : i + 1
  }
  return literalList(constraintDef.slice(from, i))
}

/** A string, `"identifier"` or `` `identifier` ``, as one capturing group for `split`. */
const QUOTED = /('(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`)/

/**
 * A check's condition in one spelling, so two readings of the same constraint
 * compare equal: whitespace collapsed, and any parentheses wrapping the whole
 * condition removed.
 */
export function normaliseCheck(expression: string): string {
  let text = expression
    .split(QUOTED)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\s+/g, ' ')))
    .join('')
    .trim()
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

/** The table's own spelling of the column `name` is, or `undefined`: identifiers are not case-sensitive in SQLite and MySQL. */
const columnNamed = (
  name: string,
  columns: readonly string[]
): string | undefined => {
  const lower = name.toLowerCase()
  return columns.find((column) => column.toLowerCase() === lower)
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
    const own =
      keyword === 'constraint' || keyword === 'check'
        ? undefined
        : columnNamed(unquoteIdentifier(first[1]!), columns)
    if (keyword !== 'constraint' && keyword !== 'check' && !own) continue
    for (const check of findChecks(definition)) {
      const named = new Set(
        [
          ...stripStrings(check.expression).matchAll(
            /"((?:[^"]|"")+)"|`([^`]+)`|\[([^\]]+)\]|\b(\w+)\b/g
          ),
        ]
          .map((m) =>
            columnNamed(
              (m[1] ?? m[2] ?? m[3] ?? m[4])!.replace(/""/g, '"'),
              columns
            )
          )
          .filter((name): name is string => name !== undefined)
      )
      // The column a check names is the one it restricts, wherever it is
      // written: a column-level check on `qty` that names only `other` is
      // `other`'s. One that names several belongs to none.
      if (named.size === 1) add([...named][0]!, check)
      else if (named.size === 0 && own) add(own, check)
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
    [...stripStrings(mysqlCheckClause(clause)).matchAll(/`([^`]+)`/g)]
      .map((m) => columnNamed(m[1]!, columns))
      .filter((name): name is string => name !== undefined)
  )
  return named.size === 1 ? [...named][0] : undefined
}

/** `text` with every quoted string blanked, so a value that looks like a column is not read as one. */
function stripStrings(text: string): string {
  return text.replace(/'(?:[^']|'')*'/g, "''")
}

/**
 * The text of a MySQL check, as `information_schema.check_constraints` hands it
 * back, rewritten as the SQL Pikku writes: no charset introducers, each string
 * literal single-quoted with `'` and `\\` doubled.
 *
 * What a real MySQL 8.4 returns for `` `color` IN ('red','blue') `` is
 * `` (`color` in (_utf8mb4\'red\',_utf8mb4\'blue\')) ``: the clause is stored
 * as escaped text, so every literal is wrapped in `\'`, a quote or a backslash
 * inside a value is escaped a second time (`it's` is `it\\\'s`), a charset
 * introducer sits in front of each literal, and non-ASCII text comes back as
 * latin1 mojibake. `SHOW CREATE TABLE`'s form (`_utf8mb4'it\'s'`) and a plain
 * one with doubled quotes are read as well.
 */
export function mysqlCheckClause(raw: string): string {
  return lexMysqlClause(raw).text
}

/** Undo the latin1-read-as-utf8 mangling of non-ASCII text, when that is what this is. */
function repairMojibake(text: string): string {
  // Only the bytes a latin1 read can produce, and only when they decode.
  // eslint-disable-next-line no-control-regex
  if (/^[\u0000-\u007f]*$/.test(text) || /[^\u0000-\u00ff]/.test(text)) {
    return text
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(text, (c) => c.charCodeAt(0))
    )
  } catch {
    return text
  }
}

const MYSQL_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  '0': '\0',
  Z: '\x1a',
}

function lexMysqlClause(raw: string): { text: string; values: string[] } {
  let clause = repairMojibake(raw)
  // The first quote of the stored form is the `\'` that opens a literal; in
  // `SHOW CREATE TABLE`'s and a hand-written form it is a bare `'`.
  const firstQuote = clause.indexOf("'")
  if (firstQuote > 0 && clause[firstQuote - 1] === '\\') {
    clause = clause.replace(/\\(["'\\])/g, '$1')
  }
  let text = ''
  const values: string[] = []
  let i = 0
  while (i < clause.length) {
    const c = clause[i]!
    if (c === '`') {
      const end = closingQuote(clause, i)
      text += clause.slice(i, end)
      i = end
      continue
    }
    if (c !== "'") {
      text += c
      i++
      continue
    }
    // A literal. Drop the charset introducer that stands in front of it.
    text = text.replace(/(^|[^\w`$])_[a-z0-9]+$/i, '$1')
    let value = ''
    i++
    while (i < clause.length) {
      const d = clause[i]!
      if (d === '\\' && i + 1 < clause.length) {
        const next = clause[i + 1]!
        value += MYSQL_ESCAPES[next] ?? next
        i += 2
      } else if (d === "'" && clause[i + 1] === "'") {
        value += "'"
        i += 2
      } else if (d === "'") {
        i++
        break
      } else {
        value += d
        i++
      }
    }
    values.push(value)
    text += `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  }
  return { text, values }
}

/** The allowed values of a MySQL `` `col` in ('a', 'b') `` check, or `undefined` when it is not one. */
export function mysqlCheckEnumValues(clause: string): string[] | undefined {
  const { text, values } = lexMysqlClause(clause)
  // Nothing but `col in ('a', 'b', …)`: the list holds only literals and commas.
  const shape =
    /^\(?\s*`[^`]+`\s+in\s*\(\s*('(?:[^'\\]|\\.|'')*'\s*,?\s*)+\)\s*\)?$/i
  return values.length > 0 && shape.test(text.trim()) ? values : undefined
}

/**
 * A check's condition reduced to what it means, for telling a constraint the
 * declaration generated from the same one written by hand under another name:
 * identifier quotes gone, keywords and names lower-cased, whitespace dropped.
 * String values are kept exactly, since `'A'` and `'a'` are different values.
 */
export function checkFingerprint(expression: string): string {
  return normaliseCheck(expression)
    .split(QUOTED)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/\s+/g, '').toLowerCase()
      // A string value, and a `"quoted"` identifier, are exact: `'A'` is not
      // `'a'`, and on postgres `"Qty"` is not `qty`. Backticks are MySQL's and
      // sqlite's, whose identifiers do not distinguish case.
      if (part.startsWith('`')) return part.slice(1, -1).toLowerCase()
      if (!part.startsWith('"')) return part
      // `"qty"` is what unquoted `qty` folds to, so the two are one name.
      const name = part.slice(1, -1)
      return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : part
    })
    .join('')
}
