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
import type { LeaseService } from '@pikku/core/services'
import { defineServiceTests } from '@pikku/core/testing'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyLeaseService } from './kysely-lease-service.js'
import { applyPikkuSchemas, leaseSchema } from './schema/index.js'

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

const kyselyLeases = async (db: Kysely<KyselyPikkuDB>) => {
  await applyPikkuSchemas(db, [leaseSchema])
  const service = new KyselyLeaseService(db)
  await service.init()
  return service
}

const backends: Record<string, () => Promise<LeaseService>> = {
  sqlite: () =>
    kyselyLeases(
      new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new CamelCasePlugin(), new SerializePlugin()],
      })
    ),
  postgres: () => {
    const pg = new PGlite()
    return kyselyLeases(
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
  defineServiceTests({ name, services: { leaseService: create } })
}
