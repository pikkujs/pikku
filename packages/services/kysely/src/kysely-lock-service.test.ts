import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
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
import { InMemoryLockService, type LockService } from '@pikku/core/services'
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
  'in-memory': async () => new InMemoryLockService(),
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

const HOUR = 60 * 60 * 1000
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

for (const [name, create] of Object.entries(backends)) {
  describe(`LockService (${name})`, () => {
    test('one holder at a time', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', HOUR)
      assert.equal(a?.holder, 'a')
      assert.equal(a?.token, 1)
      assert.equal(await locks.acquire('stage', 'b', HOUR), null)
      assert.equal((await locks.get('stage'))?.holder, 'a')
    })

    test('keys are independent', async () => {
      const locks = await create()
      await locks.acquire('one', 'a', HOUR)
      assert.equal((await locks.acquire('two', 'b', HOUR))?.holder, 'b')
    })

    test('the holder re-acquires under the same token', async () => {
      const locks = await create()
      const first = await locks.acquire('stage', 'a', 50)
      const again = await locks.acquire('stage', 'a', HOUR)
      assert.equal(again?.token, first?.token)
      assert.ok(again!.expiresAt > first!.expiresAt)
    })

    test('a lapsed lease passes to the next holder with a higher token', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', 20)
      await wait(40)
      const b = await locks.acquire('stage', 'b', HOUR)
      assert.equal(b?.holder, 'b')
      assert.equal(b?.token, a!.token + 1)
      assert.equal(await locks.refresh(a!, HOUR), null)
    })

    test('release frees the key and the token keeps rising', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', HOUR)
      await locks.release(a!)
      assert.equal(await locks.get('stage'), null)
      const b = await locks.acquire('stage', 'b', HOUR)
      assert.equal(b?.token, a!.token + 1)
    })

    test('a stale lease cannot refresh or release the new holder', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', 20)
      await wait(40)
      await locks.acquire('stage', 'b', HOUR)
      await locks.release(a!)
      assert.equal((await locks.get('stage'))?.holder, 'b')
    })

    test('refresh extends a live lease', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', 50)
      const refreshed = await locks.refresh(a!, HOUR)
      assert.equal(refreshed?.token, a!.token)
      await wait(80)
      assert.equal(await locks.acquire('stage', 'b', HOUR), null)
    })

    test('concurrent acquires admit exactly one holder', async () => {
      const locks = await create()
      const results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((holder) =>
          locks.acquire('stage', holder, HOUR)
        )
      )
      assert.equal(results.filter(Boolean).length, 1)
    })
  })
}
