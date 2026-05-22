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
 * Wraps node:sqlite's DatabaseSync as Kysely's SqliteDatabase. The shapes
 * are close but not identical: node:sqlite's Statement methods take
 * variadic positional params and always return bigint counters; Kysely's
 * dialect passes parameters as a ReadonlyArray and expects number|bigint.
 */
class NodeSqliteStatement implements SqliteStatement {
  readonly reader = true

  constructor(private readonly stmt: StatementSync) {}

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
    return new NodeSqliteStatement(this.db.prepare(sql))
  }

  close(): void {
    this.db.close()
  }
}
