/**
 * Reading a schema source's own SQL back out, one table at a time.
 *
 * A source hands `db generate` both what must exist (`tables`) and what creates
 * it (`sql`). The column map is a comparison surface — it answers "is this
 * table there, and does it have these columns" — and it is deliberately lossy:
 * primary keys, foreign keys, uniqueness, check constraints and indexes are all
 * absent from it. So the moment the generator has to *create* something, the
 * only honest source is the SQL, and this is what pulls the relevant part of it
 * out.
 */

/**
 * Split a SQL script into its top-level statements, semicolons included.
 *
 * A naive `split(';')` is wrong in a way that only shows up later: a semicolon
 * inside a string literal, a quoted identifier or a comment is not a statement
 * boundary, and cutting there yields two fragments that are each valid-looking
 * and neither of which does what the original did.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let start = 0
  let i = 0

  const closeQuote = (quote: string) => {
    i++
    while (i < sql.length) {
      if (sql[i] === '\\' && quote === "'") {
        i += 2
        continue
      }
      if (sql[i] === quote) {
        // A doubled quote is an escaped one, not the end of the literal.
        if (sql[i + 1] === quote) {
          i += 2
          continue
        }
        i++
        return
      }
      i++
    }
  }

  while (i < sql.length) {
    const ch = sql[i]!

    if (ch === "'" || ch === '"' || ch === '`') {
      closeQuote(ch)
      continue
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end + 1
      continue
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      continue
    }

    // Postgres dollar quoting: everything between `$tag$` and its twin is a
    // literal, and a function body written that way is full of semicolons.
    if (ch === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length)
        i = end === -1 ? sql.length : end + tag[0].length
        continue
      }
    }

    if (ch === ';') {
      const statement = sql.slice(start, i + 1).trim()
      if (statement.length > 1) statements.push(statement)
      start = i + 1
    }

    i++
  }

  // A script whose last statement has no trailing semicolon still ran it.
  const tail = sql.slice(start).trim()
  if (tail.length > 0) statements.push(tail)

  return statements
}

/**
 * Reduce a written table name to the form two sources can be compared on.
 *
 * The same table is `two_factor` to one writer, `"two_factor"` to Kysely and
 * `public.two_factor` to Postgres introspection. Dropping the schema qualifier,
 * the quoting and the case is the only shape all three agree on.
 */
export function bareTableName(name: string): string {
  const last = name.split('.').pop() ?? name
  return last.replace(/^["'`[]|["'`\]]$/g, '').toLowerCase()
}

const CREATE_TABLE =
  /^CREATE\s+(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i

const CREATE_INDEX =
  /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+ON\s+(?:ONLY\s+)?([^\s(]+)/i

const ALTER_TABLE = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([^\s(]+)/i

/**
 * Every statement in `sql` that builds `table`, in the order the source wrote
 * them.
 *
 * The `CREATE TABLE` and its indexes, plus any `ALTER TABLE` the source uses to
 * hang a constraint on it afterwards — which together are what the column list
 * cannot express. Source order is preserved because it is load-bearing: an
 * index cannot precede its table, and a table cannot precede one it references.
 *
 * An empty result means the source's SQL does not visibly create the table.
 * That is a real answer rather than a failure — a source may create a table
 * from something other than a literal `CREATE TABLE` — and the caller is
 * expected to fall back rather than emit nothing.
 */
export function tableCreationSql(sql: string, table: string): string[] {
  const wanted = bareTableName(table)
  const statements: string[] = []
  let creates = false

  for (const statement of splitStatements(sql)) {
    const create = CREATE_TABLE.exec(statement)
    if (create && bareTableName(create[1]!) === wanted) {
      creates = true
      statements.push(statement)
      continue
    }

    const index = CREATE_INDEX.exec(statement)
    if (index && bareTableName(index[1]!) === wanted) {
      statements.push(statement)
      continue
    }

    const alter = ALTER_TABLE.exec(statement)
    if (alter && bareTableName(alter[1]!) === wanted) {
      statements.push(statement)
    }
  }

  // Indexes and alters without the table they belong to would fail on their own,
  // and their presence says the table came from somewhere this cannot read.
  return creates ? statements : []
}
