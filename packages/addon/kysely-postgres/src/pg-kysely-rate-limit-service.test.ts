import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
} from 'kysely'
import { PGlite } from '@electric-sql/pglite'
import { defineServiceTests } from '@pikku/core/testing'
import {
  applyPikkuSchemas,
  rateLimitSchema,
  type KyselyPikkuDB,
} from '@pikku/addon-kysely'
import { PgKyselyRateLimitService } from './pg-kysely-rate-limit-service.js'

/** An in-process Postgres, so the window arithmetic runs on a real Postgres clock. */
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

defineServiceTests({
  name: 'postgres clock',
  services: {
    rateLimitService: async () => {
      const pg = new PGlite()
      const db = new Kysely<KyselyPikkuDB>({
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => pgliteDriver(pg),
          createIntrospector: (kysely) => new PostgresIntrospector(kysely),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        },
        plugins: [new CamelCasePlugin()],
      })
      await applyPikkuSchemas(db, [rateLimitSchema])
      const service = new PgKyselyRateLimitService(db)
      await service.init()
      return service
    },
  },
})
