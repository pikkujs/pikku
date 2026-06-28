import { Database, type SQLQueryBindings } from 'bun:sqlite'
import type {
  SqliteRuntime,
  SyncSqliteChanges,
  SyncSqliteDatabase,
  SyncSqliteStatement,
} from './sqlite-runtime.js'

class BunSqliteStatement implements SyncSqliteStatement {
  readonly reader: boolean

  constructor(
    private readonly stmt: ReturnType<Database['prepare']>,
    reader: boolean
  ) {
    this.reader = reader
  }

  all(...parameters: unknown[]): unknown[] {
    return this.stmt.all(...(parameters as SQLQueryBindings[])) as unknown[]
  }

  get(...parameters: unknown[]): unknown | null {
    return (
      (this.stmt.get(...(parameters as SQLQueryBindings[])) as unknown) ?? null
    )
  }

  iterate(...parameters: unknown[]): IterableIterator<unknown> {
    return this.stmt.iterate(
      ...(parameters as SQLQueryBindings[])
    ) as IterableIterator<unknown>
  }

  run(...parameters: unknown[]): SyncSqliteChanges {
    const result = this.stmt.run(...(parameters as SQLQueryBindings[]))
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  }
}

class BunSqliteDatabase implements SyncSqliteDatabase {
  constructor(private readonly db: Database) {}

  exec(sql: string): void {
    // bun:sqlite throws "no valid SQL statement" on comment-only/empty input
    // (e.g. a placeholder seed.sql); node:sqlite silently no-ops. Match node's
    // tolerance by skipping when nothing executable remains after stripping
    // comments. The original `sql` is still exec'd verbatim when non-empty.
    const executable = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    if (executable.length === 0) return
    this.db.exec(sql)
  }

  prepare(sql: string): SyncSqliteStatement {
    return new BunSqliteStatement(this.db.prepare(sql), isReaderSql(sql))
  }

  close(): void {
    this.db.close()
  }
}

function isReaderSql(sql: string): boolean {
  const normalized = sql.trimStart().toUpperCase()
  return (
    normalized.startsWith('SELECT') ||
    normalized.startsWith('WITH') ||
    normalized.startsWith('PRAGMA') ||
    normalized.startsWith('EXPLAIN')
  )
}

export const bunSqliteRuntime: SqliteRuntime = {
  open(filename) {
    return new BunSqliteDatabase(new Database(filename))
  },
}
