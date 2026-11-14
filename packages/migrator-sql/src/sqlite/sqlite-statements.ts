/**
 * SQLite's own statement boundaries.
 *
 * Not the Postgres/MySQL splitter: SQLite has no backslash escapes (`'C:\'` is
 * a complete literal and `ESCAPE '\'` is ordinary), no dollar quoting, and
 * quotes identifiers three ways (`"x"`, `` `x` ``, `[x]`). A trigger's body is
 * a run of statements of its own, so its `;`s do not end it; only the `END`
 * that closes its `BEGIN` does, and a `CASE ... END` inside must not be taken
 * for that one.
 */

const isWordChar = (ch: string | undefined) =>
  ch !== undefined && /[A-Za-z0-9_$\u0080-\uffff]/.test(ch)

/**
 * `sql` as single statements. Each ends at its own `;` (or at the last token
 * when the script ends without one), so no comment or whitespace trails it:
 * bun:sqlite only reports a statement's runtime error when nothing follows it.
 * Comments between statements are dropped, and a script of nothing but
 * comments yields no statements.
 */
export function splitSqliteStatements(sql: string): string[] {
  const out: string[] = []
  let start = -1 // first token of the statement being read
  let end = -1 // just past its last token
  let words: string[] = []
  let trigger = false
  let inBody = false
  let caseDepth = 0
  let previous = '' // the last token read, lower-cased; a quoted one is its first character
  let i = 0

  const finish = () => {
    if (start !== -1) out.push(sql.slice(start, end))
    start = -1
    end = -1
    words = []
    trigger = false
    inBody = false
    caseDepth = 0
    previous = ''
  }

  const token = (from: number, to: number) => {
    if (start === -1) start = from
    end = to
  }

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
    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const from = i
      const closer = ch === '[' ? ']' : ch
      i++
      while (i < sql.length) {
        if (sql[i] === closer) {
          // A doubled quote is an escaped one; `[x]` has no escape.
          if (closer !== ']' && sql[i + 1] === closer) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      token(from, i)
      previous = ch
      continue
    }

    if (isWordChar(ch)) {
      const from = i
      while (isWordChar(sql[i])) i++
      const word = sql.slice(from, i).toLowerCase()
      token(from, i)
      const before = previous
      previous = word
      // `EXPLAIN [QUERY PLAN]` ahead of a statement does not change what it is.
      const explained =
        words.length === 0 &&
        (word === 'explain' || word === 'query' || word === 'plan')
      if (!explained && words.length < 4) {
        words.push(word)
        if (
          !trigger &&
          words[0] === 'create' &&
          (words[1] === 'trigger' ||
            ((words[1] === 'temp' || words[1] === 'temporary') &&
              words[2] === 'trigger'))
        ) {
          trigger = true
        }
      }
      if (trigger) {
        // `of begin`, `, begin` and `new.begin` name a column, not the body.
        if (word === 'begin') {
          if (before !== 'of' && before !== ',' && before !== '.') inBody = true
        } else if (word === 'case') caseDepth++
        else if (word === 'end') {
          if (caseDepth > 0) caseDepth--
          // A body's own END always follows the `;` ending its last statement;
          // an `end` anywhere else in it is a column.
          else if (before === ';') inBody = false
        }
      }
      continue
    }

    if (ch === ';') {
      token(i, i + 1)
      i++
      previous = ';'
      if (!inBody) finish()
      continue
    }

    token(i, i + 1)
    previous = ch
    i++
  }
  finish()
  return out
}

/**
 * `sql` without its comments, literals and quoted identifiers kept as written.
 * A `--` comment ends at its newline, which stays; a block comment becomes a
 * space so the tokens either side of it do not join.
 */
export function stripSqliteComments(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]!
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl
    } else if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? sql.length : close + 2
      out += ' '
    } else if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const from = i
      const closer = ch === '[' ? ']' : ch
      i++
      while (i < sql.length) {
        if (sql[i] === closer) {
          if (closer !== ']' && sql[i + 1] === closer) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      out += sql.slice(from, i)
    } else {
      out += ch
      i++
    }
  }
  return out
}
