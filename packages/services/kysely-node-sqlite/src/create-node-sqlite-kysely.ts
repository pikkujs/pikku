import { DatabaseSync } from 'node:sqlite'
import {
  Kysely,
  SqliteDialect,
  CamelCasePlugin,
  type KyselyPlugin,
} from 'kysely'
import type { SqliteFunctionMap } from '@pikku/kysely-sqlite'
import { NodeSqliteDatabase } from './node-sqlite-adapter.js'
import { registerSqliteFunctions } from './register-functions.js'

export interface CreateNodeSqliteKyselyOptions {
  /** Path to the SQLite file. Use ':memory:' for an in-memory DB. */
  filename: string
  /** Apply CamelCasePlugin so DB columns map to camelCase TS fields. Default true. */
  camelCase?: boolean
  /** Extra plugins to layer on top. */
  plugins?: KyselyPlugin[]
  /**
   * Scalar user-defined SQL functions to register, keyed by the name SQL calls
   * them by. Registered as deterministic.
   *
   * Note that this is the one option with no bun equivalent:
   * `createBunSqliteKysely` throws if it is set, because bun:sqlite cannot
   * register functions. Using it is a decision to stay on Node.
   */
  functions?: SqliteFunctionMap
  /**
   * Absolute paths of loadable SQLite extensions (sqlite-vec's `vec0`, say) to
   * load before the database is handed to Kysely. Loaded through the C API;
   * SQL's own `load_extension()` stays refused.
   */
  extensions?: string[]
}

export function createNodeSqliteKysely<DB>(
  options: CreateNodeSqliteKyselyOptions
): Kysely<DB> {
  const extensions = options.extensions ?? []
  // node:sqlite refuses loadExtension on a connection not opened allowing it,
  // so allow it only when there is something to load, and shut it again after.
  const db = new DatabaseSync(options.filename, {
    allowExtension: extensions.length > 0,
  })
  if (extensions.length > 0) {
    for (const path of extensions) db.loadExtension(path)
    db.enableLoadExtension(false)
  }
  if (options.functions) registerSqliteFunctions(db, options.functions)
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabase(db) }),
    plugins,
  })
}
