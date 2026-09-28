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
  /**
   * Absolute paths of loadable SQLite extensions (sqlite-vec's `vec0`, say) to
   * load before the database is handed to Kysely. Loaded through the C API;
   * SQL's own `load_extension()` stays refused. On macOS this throws unless
   * the process pointed bun at a SQLite that allows it first
   * (`Database.setCustomSQLite`), since Apple's system one does not.
   */
  extensions?: string[]
}

export function createBunSqliteKysely<DB>(
  options: CreateBunSqliteKyselyOptions
): Kysely<DB> {
  const db = new Database(options.filename)
  for (const path of options.extensions ?? []) db.loadExtension(path)
  if (options.functions) registerSqliteFunctions(db, options.functions)
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new BunSqliteDatabase(db) }),
    plugins,
  })
}
