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
}

export function createNodeSqliteKysely<DB>(
  options: CreateNodeSqliteKyselyOptions
): Kysely<DB> {
  const db = new DatabaseSync(options.filename)
  if (options.functions) registerSqliteFunctions(db, options.functions)
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabase(db) }),
    plugins,
  })
}
