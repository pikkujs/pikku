export interface SyncSqliteChanges {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

export interface SyncSqliteStatement {
  reader: boolean
  all(...parameters: unknown[]): unknown[]
  get(...parameters: unknown[]): unknown | null
  iterate(...parameters: unknown[]): IterableIterator<unknown>
  run(...parameters: unknown[]): SyncSqliteChanges
}

export interface SyncSqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SyncSqliteStatement
  close(): void
}

export interface SqliteOpenOptions {
  /**
   * Absolute paths of loadable SQLite extensions (sqlite-vec's `vec0`, say) to
   * load into the connection before it is handed back. They are loaded through
   * the C API; SQL's own `load_extension()` stays refused either way.
   */
  extensions?: string[]
}

export interface SqliteRuntime {
  open(filename: string, options?: SqliteOpenOptions): SyncSqliteDatabase
}

let runtimePromise: Promise<SqliteRuntime> | undefined

export async function loadSqliteRuntime(): Promise<SqliteRuntime> {
  runtimePromise ??= (async () => {
    const isBunRuntime =
      typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

    if (isBunRuntime) {
      const { bunSqliteRuntime } = await import('./sqlite-runtime-bun.js')
      return bunSqliteRuntime
    }

    const { createNodeSqliteRuntime } = await import('./sqlite-runtime-node.js')
    return createNodeSqliteRuntime()
  })()

  return runtimePromise
}
