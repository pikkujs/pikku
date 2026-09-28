import {
  Kysely,
  SqliteDialect,
  type KyselyPlugin,
  type SqliteDatabase,
} from 'kysely'
import { SerializePlugin } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'

export interface CreateSQLiteKyselyOptions {
  /** Extra plugins to layer on, ahead of the always-last SerializePlugin. */
  plugins?: KyselyPlugin[]
}

export function createSQLiteKysely(
  database: SqliteDatabase | (() => Promise<SqliteDatabase>),
  options: CreateSQLiteKyselyOptions = {}
): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database }),
    plugins: [...(options.plugins ?? []), new SerializePlugin()],
  })
}
