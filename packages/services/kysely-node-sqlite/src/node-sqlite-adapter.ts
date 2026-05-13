import type { DatabaseSync, StatementSync, SQLInputValue } from 'node:sqlite'
import type { SqliteDatabase, SqliteStatement } from 'kysely'

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
    return this.stmt.all(...(parameters as SQLInputValue[])) as unknown[]
  }

  *iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    for (const row of this.stmt.iterate(...(parameters as SQLInputValue[]))) {
      yield row
    }
  }

  run(parameters: ReadonlyArray<unknown>): {
    changes: number | bigint
    lastInsertRowid: number | bigint
  } {
    const result = this.stmt.run(...(parameters as SQLInputValue[]))
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
