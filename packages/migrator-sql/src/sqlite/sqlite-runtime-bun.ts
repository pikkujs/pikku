import { Database, type SQLQueryBindings } from 'bun:sqlite'
import type {
  SqliteRuntime,
  SyncSqliteChanges,
  SyncSqliteDatabase,
  SyncSqliteStatement,
} from './sqlite-runtime.js'
import { splitSqliteStatements } from './sqlite-statements.js'

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

  /**
   * One statement at a time. bun:sqlite's exec drops a statement's runtime
   * error (a failed CHECK, a missing module) whenever anything, even a newline
   * or a comment, follows it, so a migration that fails partway would carry on
   * and be recorded as applied. node:sqlite reports it; a lone statement with
   * nothing after it is reported here too. Splitting also covers what bun
   * rejects outright, a script of nothing but comments, which node:sqlite
   * runs as a no-op.
   */
  exec(sql: string): void {
    for (const statement of splitSqliteStatements(sql)) {
      this.db.exec(statement)
    }
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
  open(filename, options) {
    const db = new Database(filename)
    // Loaded through the C API; SQL's own load_extension() stays refused. On
    // macOS this throws unless the process pointed bun at a SQLite that allows
    // extensions first (Database.setCustomSQLite) — Apple's system one does not.
    for (const path of options?.extensions ?? []) db.loadExtension(path)
    // node:sqlite's DatabaseSync enforces foreign keys by default; bun:sqlite
    // leaves sqlite's own default of off, which turns every ON DELETE CASCADE
    // into a silent no-op. Both runtimes have to agree about what a delete does.
    db.exec('PRAGMA foreign_keys = ON')
    return new BunSqliteDatabase(db)
  },
}
