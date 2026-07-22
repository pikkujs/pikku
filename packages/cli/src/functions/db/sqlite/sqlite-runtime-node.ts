import type {
  SqliteRuntime,
  SyncSqliteChanges,
  SyncSqliteDatabase,
  SyncSqliteStatement,
} from './sqlite-runtime.js'

interface NodeSqliteStatementShape {
  reader?: boolean
  all(...parameters: unknown[]): unknown[]
  get(...parameters: unknown[]): unknown
  iterate(...parameters: unknown[]): IterableIterator<unknown>
  run(...parameters: unknown[]): {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }
}

interface NodeSqliteDatabaseShape {
  exec(sql: string): void
  prepare(sql: string): NodeSqliteStatementShape
  close(): void
}

interface NodeSqliteModule {
  DatabaseSync: new (filename?: string) => NodeSqliteDatabaseShape
}

class NodeSqliteStatement implements SyncSqliteStatement {
  readonly reader: boolean

  constructor(
    private readonly stmt: NodeSqliteStatementShape,
    sql: string
  ) {
    // node:sqlite StatementSync does not have a .reader property
    // (that's a better-sqlite3 API). Fall back to SQL inspection when absent.
    if (stmt.reader !== undefined) {
      this.reader = Boolean(stmt.reader)
    } else {
      const upper = sql.trimStart().toUpperCase()
      this.reader =
        upper.startsWith('SELECT') ||
        upper.startsWith('WITH') ||
        upper.startsWith('PRAGMA') ||
        upper.startsWith('EXPLAIN') ||
        upper.startsWith('VALUES') ||
        /\bRETURNING\b/.test(upper)
    }
  }

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

class NodeSqliteDatabase implements SyncSqliteDatabase {
  constructor(private readonly db: NodeSqliteDatabaseShape) {}

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): SyncSqliteStatement {
    return new NodeSqliteStatement(this.db.prepare(sql), sql)
  }

  close(): void {
    this.db.close()
  }
}

async function importNodeSqlite(): Promise<NodeSqliteModule> {
  const dynamicImport = new Function(
    'return import("node:sqlite")'
  ) as () => Promise<NodeSqliteModule>
  return dynamicImport()
}

export async function createNodeSqliteRuntime(): Promise<SqliteRuntime> {
  const { DatabaseSync } = await importNodeSqlite()
  return {
    open(filename) {
      return new NodeSqliteDatabase(new DatabaseSync(filename))
    },
  }
}
