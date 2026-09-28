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
    // (e.g. a placeholder dev-seed.sql); node:sqlite silently no-ops. Match node's
    // tolerance by skipping when nothing executable remains after stripping
    // comments. The original `sql` is still exec'd verbatim when non-empty.
    const executable = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    if (executable.length === 0) return
    this.assertModulesExist(executable)
    this.db.exec(sql)
  }

  /**
   * bun:sqlite's exec drops a "no such module" error whenever anything — even a
   * trailing newline — follows the failing statement, so a migration creating a
   * virtual table over an extension that is not loaded (vec0, say) is recorded
   * as applied without the table ever existing. node:sqlite reports it. Check
   * the modules up front and fail the way SQLite itself would.
   */
  private assertModulesExist(sql: string): void {
    const used = [
      ...sql.matchAll(
        /\bcreate\s+virtual\s+table\s+(?:if\s+not\s+exists\s+)?\S+?\s+using\s+(\w+)/gi
      ),
    ].map(([, module]) => module!)
    if (used.length === 0) return
    const known = new Set(
      (
        this.db.query('PRAGMA module_list').all() as Array<{ name: string }>
      ).map((row) => row.name.toLowerCase())
    )
    for (const module of used) {
      if (!known.has(module.toLowerCase())) {
        throw new Error(`no such module: ${module}`)
      }
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
