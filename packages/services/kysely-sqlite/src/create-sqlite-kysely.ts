import {
  Kysely,
  SqliteDialect,
  type KyselyPlugin,
  type SqliteDatabase,
} from 'kysely'
import {
  SerializePlugin,
  traceDialect,
  type TraceDriverOptions,
} from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'

export interface CreateSQLiteKyselyOptions extends Omit<
  TraceDriverOptions,
  'system'
> {
  /** Extra plugins to layer on, ahead of the always-last SerializePlugin. */
  plugins?: KyselyPlugin[]
}

export function createSQLiteKysely(
  database: SqliteDatabase | (() => Promise<SqliteDatabase>),
  options: CreateSQLiteKyselyOptions = {}
): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: traceDialect(new SqliteDialect({ database }), {
      tracer: options.tracer,
      currentTrace: options.currentTrace,
      recordSqlText: options.recordSqlText,
      system: 'sqlite',
    }),
    plugins: [...(options.plugins ?? []), new SerializePlugin()],
  })
}
