import {
  Kysely,
  SqliteDialect,
  CamelCasePlugin,
  type KyselyPlugin,
  type SqliteDatabase,
  type SqliteStatement,
} from 'kysely'
import type {
  SyncSqliteDatabase,
  SyncSqliteStatement,
} from './sqlite-runtime.js'

function coerce(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) return v
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

class RuntimeSqliteStatement implements SqliteStatement {
  readonly reader: boolean

  constructor(private readonly stmt: SyncSqliteStatement) {
    this.reader = Boolean(stmt.reader)
  }

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.stmt.all(...parameters.map(coerce))
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

class RuntimeSqliteDatabase implements SqliteDatabase {
  constructor(private readonly db: SyncSqliteDatabase) {}

  prepare(sql: string): SqliteStatement {
    return new RuntimeSqliteStatement(this.db.prepare(sql))
  }

  close(): void {
    this.db.close()
  }
}

export interface CreateSqliteKyselyOptions {
  db: SyncSqliteDatabase
  camelCase?: boolean
  plugins?: KyselyPlugin[]
}

export function createSqliteKysely<DB>(
  options: CreateSqliteKyselyOptions
): Kysely<DB> {
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({
      database: new RuntimeSqliteDatabase(options.db),
    }),
    plugins,
  })
}
