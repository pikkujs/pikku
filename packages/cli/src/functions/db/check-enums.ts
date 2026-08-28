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
function closingQuote(sql: string, start: number): number {
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
