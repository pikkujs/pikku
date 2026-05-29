import type { Database, Statement } from 'bun:sqlite'
import type { SqliteDatabase, SqliteStatement } from 'kysely'

function coerce(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

class BunSqliteStatement implements SqliteStatement {
  readonly reader = true

  constructor(private readonly stmt: Statement) {}

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.stmt.all(...(parameters.map(coerce) as any))
  }

  *iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    for (const row of this.stmt.iterate(...(parameters.map(coerce) as any))) {
      yield row
    }
  }

  run(parameters: ReadonlyArray<unknown>): {
    changes: number | bigint
    lastInsertRowid: number | bigint
  } {
    const result = this.stmt.run(...(parameters.map(coerce) as any))
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  }
}

export class BunSqliteDatabase implements SqliteDatabase {
  constructor(private readonly db: Database) {}

  prepare(sql: string): SqliteStatement {
    return new BunSqliteStatement(this.db.prepare(sql))
  }

  close(): void {
    this.db.close()
  }
}
