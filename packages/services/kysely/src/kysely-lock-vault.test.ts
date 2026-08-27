import { describe, test, before, after } from 'node:test'
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
  type QueryResult,
} from 'kysely'
import { PGlite } from '@electric-sql/pglite'
import Database from 'better-sqlite3'
import { DataLock } from '@pikku/core/classification'
import type { LockRecord } from '@pikku/core/classification'
import { unsafeAsWrapped } from '@pikku/core/classification'
import {
  ClassificationCrypto,
  createDataLockResolver,
} from './classification-crypto.js'
import { KyselyLockVault } from './kysely-lock-vault.js'
import { dataLockSchema } from './schema/index.js'
import type { KyselyPikkuDB } from './kysely-tables.js'

class PGliteConnection implements DatabaseConnection {
  constructor(private readonly db: PGlite) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.db.query<R>(query.sql, [...query.parameters])
    return { rows: result.rows as R[] }
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('not supported')
  }
}

const pgliteDialect = (db: PGlite) => ({
  createAdapter: () => new PostgresAdapter(),
  createIntrospector: (kysely: Kysely<any>) => new PostgresIntrospector(kysely),
  createQueryCompiler: () => new PostgresQueryCompiler(),
  createDriver: (): Driver => {
    const connection = new PGliteConnection(db)
    return {
      init: async () => {},
      acquireConnection: async () => connection,
      beginTransaction: async (conn) =>
        void (await conn.executeQuery({
          sql: 'begin',
          parameters: [],
          query: {} as any,
          queryId: {} as any,
        })),
      commitTransaction: async (conn) =>
        void (await conn.executeQuery({
          sql: 'commit',
          parameters: [],
          query: {} as any,
          queryId: {} as any,
        })),
      rollbackTransaction: async (conn) =>
        void (await conn.executeQuery({
          sql: 'rollback',
          parameters: [],
          query: {} as any,
          queryId: {} as any,
        })),
      releaseConnection: async () => {},
      destroy: async () => {},
    }
  },
})

const passphrase = 'a-passphrase-long-enough-to-be-real-key-material'

/**
 * The vault has to behave the same on both engines, so every case runs twice
 * rather than being written once against whichever was convenient.
 */
type Engine = {
  name: string
  open: () => Promise<Kysely<KyselyPikkuDB>>
  close: (db: Kysely<KyselyPikkuDB>) => Promise<void>
}

const engines: Engine[] = [
  {
    name: 'sqlite',
    open: async () =>
      new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new CamelCasePlugin()],
      }),
    close: async (db) => db.destroy(),
  },
  {
    name: 'postgres',
    open: async () => {
      const pg = new PGlite()
      await pg.waitReady
      return new Kysely<KyselyPikkuDB>({
        dialect: pgliteDialect(pg) as any,
        plugins: [new CamelCasePlugin()],
      })
    },
    close: async (db) => db.destroy(),
  },
]

const dropTable = async (db: Kysely<KyselyPikkuDB>) => {
  await db.schema.dropTable('dataLocks').ifExists().execute()
}

const createTable = async (db: Kysely<KyselyPikkuDB>) => {
  for (const statement of dataLockSchema.statements) {
    await statement(db as Kysely<any>, {}, {
      table: (name: string) => ({ sql: `"${name}"` }) as any,
    } as any).execute()
  }
}

const record = (keyId: string): LockRecord => ({
  keyId,
  keyVersion: 1,
  salt: 'c2FsdHktc2FsdA',
  verifier: unsafeAsWrapped(`verifier-for-${keyId}`),
})

for (const engine of engines) {
  describe(`KyselyLockVault on ${engine.name}`, () => {
    let db: Kysely<KyselyPikkuDB>

    before(async () => {
      db = await engine.open()
    })

    after(async () => {
      await engine.close(db)
    })

    test('a database with no table yet reads as uninitialized, not an error', async () => {
      await dropTable(db)
      // First run reaches the vault before any migration has: returning [] is
      // what lets the server come up and offer to initialize, where throwing
      // would make a brand new install look like a broken one.
      assert.deepEqual(await new KyselyLockVault(db).read(), [])
    })

    test('records survive a round trip through the database', async () => {
      await dropTable(db)
      await createTable(db)
      const vault = new KyselyLockVault(db)

      await vault.write([record('default'), record('recovery-codes')])
      const read = await vault.read()

      assert.deepEqual(read.map((r) => r.keyId).sort(), [
        'default',
        'recovery-codes',
      ])
      assert.equal(read[0]!.keyVersion, 1)
      assert.equal(typeof read[0]!.keyVersion, 'number')
      assert.equal(
        read.find((r) => r.keyId === 'default')!.salt,
        'c2FsdHktc2FsdA'
      )
    })

    test('writing replaces the record set rather than appending to it', async () => {
      await dropTable(db)
      await createTable(db)
      const vault = new KyselyLockVault(db)

      await vault.write([record('default'), record('recovery-codes')])
      await vault.write([record('default')])

      assert.deepEqual(
        (await vault.read()).map((r) => r.keyId),
        ['default']
      )
    })

    test('a real error is not mistaken for a missing table', async () => {
      const fresh = await engine.open()
      await createTable(fresh)
      await fresh.destroy()

      // The table exists; the connection is gone. Swallowing this as "no
      // records yet" would report a dead database as a fresh install and
      // invite the user to re-initialize over their own data.
      await assert.rejects(() => new KyselyLockVault(fresh).read())
    })

    test('salts persist, so a sealed value reopens after a restart', async () => {
      await dropTable(db)
      await createTable(db)

      const first = new DataLock(new KyselyLockVault(db))
      await first.init()
      assert.equal(first.state, 'uninitialized')
      await first.initialize(passphrase, ['default'])
      assert.equal(first.state, 'unlocked')

      const sealed = await new ClassificationCrypto({
        resolveKEK: createDataLockResolver(first),
      }).encryptColumn('default', 'survives-a-restart')

      // A second lock over the same database is what a restart looks like:
      // nothing in memory carries over, so only the persisted salt can open it.
      const second = new DataLock(new KyselyLockVault(db))
      assert.equal(await second.init(), 'locked')
      await second.unlock(passphrase)

      assert.equal(
        await new ClassificationCrypto({
          resolveKEK: createDataLockResolver(second),
        }).decryptColumn(sealed),
        'survives-a-restart'
      )
    })

    test('the records are readable while the store is locked', async () => {
      await dropTable(db)
      await createTable(db)

      const lock = new DataLock(new KyselyLockVault(db))
      await lock.init()
      await lock.initialize(passphrase, ['default'])
      lock.lock()

      // Nothing in a lock record is key material, so finding out how to unlock
      // must never itself require being unlocked.
      assert.equal((await new KyselyLockVault(db).read()).length, 1)
      assert.equal(lock.state, 'locked')
    })
  })
}
