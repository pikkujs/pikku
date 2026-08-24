import type { DatabaseSync, StatementSync, SQLInputValue } from 'node:sqlite'
import type { SqliteDatabase, SqliteStatement } from 'kysely'

/**
 * Always-on write-side coercion: converts JS values that SQLite's node:sqlite
 * binding cannot accept into their storable equivalents.
 *   boolean  → 0 | 1
 *   Date     → ISO 8601 string
 *   object   → JSON string  (covers arrays and plain objects)
 */
function coerce(v: unknown): SQLInputValue {
  if (v === null || v === undefined) return null as unknown as SQLInputValue
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return v as SQLInputValue
}

/**
 * Whether a statement returns rows. node:sqlite's StatementSync has no `reader`
 * flag (better-sqlite3, which Kysely's SqliteDialect was written against, does),
 * so the value has to come from the SQL: a writer is run through `.run()` for
 * its `changes`/`lastInsertRowid`, a reader through `.all()` for its rows, and
 * getting it wrong silently drops whichever half the caller wanted.
 *
 * The list is wider than SELECT because Kysely's own SQLite introspector asks
 * for columns through a CTE over `pragma_table_info`, so a statement that opens
 * with WITH is a reader too — treating it as a writer reports every table as
 * having no columns.
 */
function isReaderSql(sql: string): boolean {
  return (
    /^\s*(select|with|pragma|values|explain)\b/i.test(sql) ||
    /\breturning\b/i.test(sql)
  )
}

/**
 * Wraps node:sqlite's DatabaseSync as Kysely's SqliteDatabase. The shapes
 * are close but not identical: node:sqlite's Statement methods take
 * variadic positional params and always return bigint counters; Kysely's
 * dialect passes parameters as a ReadonlyArray and expects number|bigint.
 */
class NodeSqliteStatement implements SqliteStatement {
  readonly reader: boolean

  constructor(
    private readonly stmt: StatementSync,
    reader: boolean
  ) {
    this.reader = reader
  }

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.stmt.all(...parameters.map(coerce)) as unknown[]
  }

  *iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    for (const row of this.stmt.iterate(...parameters.map(coerce))) {
      yield row
    }
  }

  run(parameters: ReadonlyArray<unknown>): {
    changes: number | bigint
    lastInsertRowid: number | bigint
  } {
    const result = this.stmt.run(...parameters.map(coerce))
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  }
}

export class NodeSqliteDatabase implements SqliteDatabase {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatement(this.db.prepare(sql), isReaderSql(sql))
  }

  close(): void {
    this.db.close()
  }
}
