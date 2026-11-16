/**
 * The two scans every statement reader in this package starts with: stepping
 * over a comment and stepping over a quoted run, so a `;` or a keyword inside
 * either is never read as SQL.
 */

/** Index just past the comment that starts at `i`, or -1 when none starts there. */
export function endOfComment(sql: string, i: number): number {
  if (sql[i] === '-' && sql[i + 1] === '-') {
    const end = sql.indexOf('\n', i)
    return end === -1 ? sql.length : end + 1
  }
  if (sql[i] === '/' && sql[i + 1] === '*') {
    const end = sql.indexOf('*/', i + 2)
    return end === -1 ? sql.length : end + 2
  }
  return -1
}

/**
 * Index just past the quoted run that starts at `start`. A doubled quote is an
 * escaped one, not the end; with `backslash`, so is `\` inside a `'` literal.
 */
export function endOfQuoted(
  sql: string,
  start: number,
  backslash = false
): number {
  const quote = sql[start]
  let i = start + 1
  while (i < sql.length) {
    if (backslash && sql[i] === '\\' && quote === "'") {
      i += 2
      continue
    }
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
