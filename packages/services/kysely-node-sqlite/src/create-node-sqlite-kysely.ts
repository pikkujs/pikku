import { DatabaseSync } from 'node:sqlite'
import {
  Kysely,
  SqliteDialect,
  CamelCasePlugin,
  type KyselyPlugin,
} from 'kysely'
import { NodeSqliteDatabase } from './node-sqlite-adapter.js'

export interface CreateNodeSqliteKyselyOptions {
  /** Path to the SQLite file. Use ':memory:' for an in-memory DB. */
  filename: string
  /** Apply CamelCasePlugin so DB columns map to camelCase TS fields. Default true. */
  camelCase?: boolean
  /** Extra plugins to layer on top. */
  plugins?: KyselyPlugin[]
}

export function createNodeSqliteKysely<DB>(
  options: CreateNodeSqliteKyselyOptions
): Kysely<DB> {
  const db = new DatabaseSync(options.filename)
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabase(db) }),
    plugins,
  })
}
