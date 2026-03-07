import { Kysely, SqliteDialect, type SqliteDatabase } from 'kysely'
import { SerializePlugin } from 'kysely-plugin-serialize'
import type { KyselyPikkuDB } from '@pikku/kysely'

export function createSQLiteKysely(
  database: SqliteDatabase | (() => Promise<SqliteDatabase>)
): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database }),
    plugins: [new SerializePlugin()],
  })
}
