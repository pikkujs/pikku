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
} from '@pikku/db-migrator/sqlite'

/**
 * Whether a value is a JSON column's worth of data rather than some other
 * object that merely happens to be one. A `Map`, a `RegExp` or a class
 * instance stringifies to `"{}"` or to a partial view of itself, which would
 * silently persist an empty JSON blob where the caller meant something.
 *
 * Kept in lockstep with `isJsonEncodable` in `@pikku/kysely-sqlite`'s
 * LibsqlWebDialect: whatever binds here under `pikku dev` has to bind the same
 * way once the app is deployed, or the dev and deployed runtimes disagree
 * about what a query may do.
 */
function isJsonEncodable(v: object): boolean {
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function coerce(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) return v
  if (typeof v === 'object') {
    if (isJsonEncodable(v)) return JSON.stringify(v)
    throw new Error(
      `sqlite: unsupported argument type ${v.constructor?.name ?? 'object'}`
    )
  }
  return v
}

// A statement returns rows when it is a SELECT or carries a RETURNING clause.
// node:sqlite's StatementSync has no `reader` flag (always undefined), so without
// this kysely would run INSERT ... RETURNING via `.run()` and drop the returned
// rows — which breaks better-auth sign-up (it inserts and expects the row back).
function isReaderSql(sql: string): boolean {
  return /^\s*select/i.test(sql) || /\breturning\b/i.test(sql)
}

class RuntimeSqliteStatement implements SqliteStatement {
  readonly reader: boolean

  constructor(
    private readonly stmt: SyncSqliteStatement,
    reader: boolean
  ) {
    this.reader = reader
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
    const stmt = this.db.prepare(sql)
    return new RuntimeSqliteStatement(
      stmt,
      Boolean(stmt.reader) || isReaderSql(sql)
    )
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
