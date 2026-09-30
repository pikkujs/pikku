import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteDialect,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
} from 'kysely'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import type { LockService } from '@pikku/core/services'
import { defineServiceTests } from '@pikku/core/testing'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyLockService } from './kysely-lock-service.js'
import { applyPikkuSchemas, lockSchema } from './schema/index.js'

const pgliteDriver = (pg: PGlite): Driver => {
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery) => {
      const result = await pg.query<R>(query.sql, [...query.parameters])
      return {
        rows: result.rows,
        numAffectedRows:
          result.affectedRows !== undefined
            ? BigInt(result.affectedRows)
            : undefined,
      }
    },
    streamQuery: async function* () {},
  }
  return {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => void (await pg.exec('BEGIN')),
    commitTransaction: async () => void (await pg.exec('COMMIT')),
    rollbackTransaction: async () => void (await pg.exec('ROLLBACK')),
    releaseConnection: async () => {},
    destroy: async () => {},
  }
}

const kyselyLocks = async (db: Kysely<KyselyPikkuDB>) => {
  await applyPikkuSchemas(db, [lockSchema])
  const service = new KyselyLockService(db)
  await service.init()
  return service
}

const backends: Record<string, () => Promise<LockService>> = {
  sqlite: () =>
    kyselyLocks(
      new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new CamelCasePlugin(), new SerializePlugin()],
      })
    ),
  postgres: () => {
    const pg = new PGlite()
    return kyselyLocks(
      new Kysely<KyselyPikkuDB>({
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => pgliteDriver(pg),
          createIntrospector: (db) => new PostgresIntrospector(db),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        },
        plugins: [new CamelCasePlugin(), new SerializePlugin()],
      })
    )
  },
}

for (const [name, create] of Object.entries(backends)) {
  defineServiceTests({ name, services: { lockService: create } })
}
