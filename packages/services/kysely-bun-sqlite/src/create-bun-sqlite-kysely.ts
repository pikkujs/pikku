import { Database } from 'bun:sqlite'
import {
  Kysely,
  SqliteDialect,
  CamelCasePlugin,
  type KyselyPlugin,
} from 'kysely'
import type { SqliteFunctionMap } from '@pikku/kysely-sqlite'
import { BunSqliteDatabase } from './bun-sqlite-adapter.js'
import { registerSqliteFunctions } from './register-functions.js'

export interface CreateBunSqliteKyselyOptions {
  /** Path to the SQLite file. Use ':memory:' for an in-memory DB. */
  filename: string
  /** Apply CamelCasePlugin so DB columns map to camelCase TS fields. Default true. */
  camelCase?: boolean
  /** Extra plugins to layer on top. */
  plugins?: KyselyPlugin[]
  /**
   * Accepted only so that setting it fails loudly. bun:sqlite cannot register
   * user-defined SQL functions, so passing any throws
   * SqliteFunctionsUnsupportedError here rather than leaving the queries that
   * call them to fail with "no such function" later.
   *
   * The option is declared — instead of simply absent — so that code shared
   * with `createNodeSqliteKysely` still type-checks and the incompatibility
   * shows up as an error that explains itself.
   */
  functions?: SqliteFunctionMap
}

export function createBunSqliteKysely<DB>(
  options: CreateBunSqliteKyselyOptions
): Kysely<DB> {
  const db = new Database(options.filename)
  if (options.functions) registerSqliteFunctions(db, options.functions)
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new BunSqliteDatabase(db) }),
    plugins,
  })
}
