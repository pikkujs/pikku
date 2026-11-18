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
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RateLimitService } from '@pikku/core/services'
import { defineServiceTests } from '@pikku/core/testing'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyRateLimitService } from './kysely-rate-limit-service.js'
import { applyPikkuSchemas, rateLimitSchema } from './schema/index.js'

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

const sqliteDb = () =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })

const pgliteDb = () => {
  const pg = new PGlite()
  return new Kysely<KyselyPikkuDB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => pgliteDriver(pg),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
}

const kyselyRateLimits = async (db: Kysely<KyselyPikkuDB>) => {
  await applyPikkuSchemas(db, [rateLimitSchema])
  const service = new KyselyRateLimitService(db)
  await service.init()
  return service
}

const databases: Record<string, () => Kysely<KyselyPikkuDB>> = {
  sqlite: sqliteDb,
  postgres: pgliteDb,
}

for (const [name, database] of Object.entries(databases)) {
  const create = (): Promise<RateLimitService> => kyselyRateLimits(database())
  defineServiceTests({ name, services: { rateLimitService: create } })

  test(`a new service on the same database sees the count [${name}]`, async () => {
    const db = database()
    await applyPikkuSchemas(db, [rateLimitSchema])
    const first = new KyselyRateLimitService(db)
    await first.init()
    await first.hit('k', 2, 60 * 60_000)
    await first.hit('k', 2, 60 * 60_000)

    const restarted = new KyselyRateLimitService(db)
    await restarted.init()
    const hit = await restarted.hit('k', 2, 60 * 60_000)
    assert.equal(hit.allowed, false)
    assert.equal(hit.count, 2)
  })

  test(`prune removes only windows that have ended [${name}]`, async () => {
    const db = database()
    await applyPikkuSchemas(db, [rateLimitSchema])
    const limiter = new KyselyRateLimitService(db)
    await limiter.init()
    await limiter.hit('short', 1, 1)
    await limiter.hit('long', 1, 60 * 60_000)
    await new Promise((r) => setTimeout(r, 20))
    await limiter.prune()
    const keys = (
      await db.selectFrom('pikkuRateLimit').select('key').execute()
    ).map((r) => r.key)
    assert.deepEqual(keys, ['long'])
  })
}
