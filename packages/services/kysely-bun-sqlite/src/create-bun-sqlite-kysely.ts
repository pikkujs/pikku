import { Database } from 'bun:sqlite'
import {
  Kysely,
  SqliteDialect,
  CamelCasePlugin,
  type KyselyPlugin,
} from 'kysely'
import { BunSqliteDatabase } from './bun-sqlite-adapter.js'

export interface CreateBunSqliteKyselyOptions {
  /** Path to the SQLite file. Use ':memory:' for an in-memory DB. */
  filename: string
  /** Apply CamelCasePlugin so DB columns map to camelCase TS fields. Default true. */
  camelCase?: boolean
  /** Extra plugins to layer on top. */
  plugins?: KyselyPlugin[]
}

export function createBunSqliteKysely<DB>(
  options: CreateBunSqliteKyselyOptions
): Kysely<DB> {
  const db = new Database(options.filename)
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new BunSqliteDatabase(db) }),
    plugins,
  })
}
