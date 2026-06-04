import { Database } from 'bun:sqlite'
import type {
  SqliteRuntime,
  SyncSqliteChanges,
  SyncSqliteDatabase,
  SyncSqliteStatement,
} from './sqlite-runtime.js'

class BunSqliteStatement implements SyncSqliteStatement {
  constructor(private readonly stmt: ReturnType<Database['prepare']>) {}

  all(...parameters: unknown[]): unknown[] {
    return this.stmt.all(...parameters) as unknown[]
  }

  get(...parameters: unknown[]): unknown | null {
    return (this.stmt.get(...parameters) as unknown) ?? null
  }

  iterate(...parameters: unknown[]): IterableIterator<unknown> {
    return this.stmt.iterate(...parameters) as IterableIterator<unknown>
  }

  run(...parameters: unknown[]): SyncSqliteChanges {
    const result = this.stmt.run(...parameters)
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  }
}

class BunSqliteDatabase implements SyncSqliteDatabase {
  constructor(private readonly db: Database) {}

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): SyncSqliteStatement {
    return new BunSqliteStatement(this.db.prepare(sql))
  }

  close(): void {
    this.db.close()
  }
}

export const bunSqliteRuntime: SqliteRuntime = {
  open(filename) {
    return new BunSqliteDatabase(new Database(filename))
  },
}
