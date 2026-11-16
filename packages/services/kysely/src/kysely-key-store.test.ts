import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteDialect,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
} from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import type { KeyRecord } from '@pikku/core/keypair'
import { defineServiceTests } from '@pikku/core/testing'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyKeyStore } from './kysely-key-store.js'
import { KyselySecretService } from './kysely-secret-service.js'
import {
  applyPikkuSchemas,
  keySchema,
  pikkuSchemas,
  requiredPikkuSchemas,
} from './schema/index.js'

type DB = Kysely<KyselyPikkuDB>

/**
 * A PGlite is one connection. Kysely instances sharing it would interleave their
 * transactions on it, so a connection is held from acquire to release: two
 * stores then queue for it the way two clients queue for a row lock.
 */
const sharedPglite = (pg: PGlite) => {
  let tail: Promise<void> = Promise.resolve()
  const releases = new WeakMap<DatabaseConnection, () => void>()
  return (): Driver => ({
    init: async () => {},
    acquireConnection: async () => {
      const previous = tail
      let release!: () => void
      tail = new Promise<void>((resolve) => (release = resolve))
      await previous
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
      releases.set(connection, release)
      return connection
    },
    beginTransaction: async () => void (await pg.exec('BEGIN')),
    commitTransaction: async () => void (await pg.exec('COMMIT')),
    rollbackTransaction: async () => void (await pg.exec('ROLLBACK')),
    releaseConnection: async (connection) => releases.get(connection)?.(),
    destroy: async () => {},
  })
}

const plugins = () => [new CamelCasePlugin(), new SerializePlugin()]

const sqliteDb = (file: string): DB =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(file) }),
    plugins: plugins(),
  })

const pgliteDb = (makeDriver: () => Driver): DB =>
  new Kysely<KyselyPikkuDB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: makeDriver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: plugins(),
  })

interface Backend {
  /** One empty ledger; `open` is a new store on a new connection to it. */
  create(): Promise<{
    db: DB
    open(): Promise<KyselyKeyStore>
    close(): Promise<void>
  }>
}

const dirs: string[] = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const sqlite: Backend = {
  create: async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-key-store-'))
    dirs.push(dir)
    const file = join(dir, 'keys.db')
    await applyPikkuSchemas(sqliteDb(file), [keySchema])
    const opened: DB[] = []
    const open = async () => {
      const db = sqliteDb(file)
      opened.push(db)
      const store = new KyselyKeyStore(db)
      await store.init()
      return store
    }
    const db = sqliteDb(file)
    opened.push(db)
    return {
      db,
      open,
      close: async () => {
        for (const each of opened) await each.destroy()
      },
    }
  },
}

// PGlite starts slowly, so one instance serves every test and each test begins
// by emptying the table.
let pglite: Promise<{ pg: PGlite; driver: () => Driver }> | undefined
const pgliteBackend: Backend = {
  create: async () => {
    pglite ??= (async () => {
      const pg = new PGlite()
      const driver = sharedPglite(pg)
      await applyPikkuSchemas(pgliteDb(driver), [keySchema])
      return { pg, driver }
    })()
    const { pg, driver } = await pglite
    await pg.exec('delete from pikku_key')
    return {
      db: pgliteDb(driver),
      open: async () => {
        const store = new KyselyKeyStore(pgliteDb(driver))
        await store.init()
        return store
      },
      close: async () => {},
    }
  },
}

// A real server, for true concurrent connections: set PIKKU_TEST_POSTGRES_URL
// to a database the tests may create and empty `pikku_key` in.
const postgresUrl = process.env.PIKKU_TEST_POSTGRES_URL
const realPostgres: Backend = {
  create: async () => {
    const clients: ReturnType<typeof postgres>[] = []
    const connect = (): DB => {
      const client = postgres(postgresUrl!, { max: 1, onnotice: () => {} })
      clients.push(client)
      return new Kysely<KyselyPikkuDB>({
        dialect: new PostgresJSDialect({ postgres: client }),
        plugins: [new CamelCasePlugin()],
      })
    }
    const admin = connect()
    await sql`drop table if exists pikku_key`.execute(admin)
    await applyPikkuSchemas(admin, [keySchema])
    return {
      db: admin,
      open: async () => {
        const store = new KyselyKeyStore(connect())
        await store.init()
        return store
      },
      close: async () => {
        for (const client of clients) await client.end()
      },
    }
  },
}

const backends: [string, Backend, { sharedWriters: boolean }][] = [
  ['sqlite', sqlite, { sharedWriters: true }],
  ['postgres (pglite)', pgliteBackend, { sharedWriters: true }],
  ...(postgresUrl
    ? ([['postgres (server)', realPostgres, { sharedWriters: true }]] as const)
    : []),
]

for (const [name, backend, options] of backends) {
  defineServiceTests({
    name: `kysely ${name}`,
    services: {
      keyStore: async () => {
        const { open, close } = await backend.create()
        return { open, close }
      },
      keyStoreOptions: options,
    },
  })
}

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-02-01T00:00:00.000Z'

let n = 0
const rec = (over: Partial<KeyRecord> = {}): KeyRecord => {
  n += 1
  return {
    kid: `kid-${n}`,
    name: 'audit',
    scopeKey: 'default',
    version: n,
    algorithm: 'ed25519',
    purpose: 'signing',
    publicKey: `public-${n}`,
    status: 'pending',
    createdAt: T0,
    custody: 'secret',
    privateRef: `KEY_AUDIT_${n}`,
    rev: 0,
    ...over,
  }
}

const slots = async (db: DB) =>
  (
    await db
      .selectFrom('pikkuKey')
      .select(['kid', 'status', 'activeSlot', 'pendingSlot', 'retiredAt'])
      .orderBy('kid')
      .execute()
  ).map((r) => [
    r.kid,
    r.status,
    r.activeSlot,
    r.pendingSlot,
    r.retiredAt == null ? null : new Date(r.retiredAt as never).toISOString(),
  ])

for (const [name, backend] of backends) {
  describe(`KyselyKeyStore [${name}]`, () => {
    const run = async (
      fn: (ctx: {
        db: DB
        store: KyselyKeyStore
        open: () => Promise<KyselyKeyStore>
      }) => Promise<void>
    ) => {
      const { db, open, close } = await backend.create()
      try {
        await fn({ db, store: await open(), open })
      } finally {
        await close()
      }
    }

    test('status, slots and retiredAt move together on every transition', () =>
      run(async ({ db, store }) => {
        await store.firstActivate(rec({ kid: 'a', version: 1 }))
        await store.insertPending(rec({ kid: 'p', version: 2 }))
        await store.insertPending(
          rec({ kid: 'm', version: 3, status: 'minting' })
        )
        assert.deepEqual(await slots(db), [
          ['a', 'active', 1, null, null],
          ['m', 'minting', null, null, null],
          ['p', 'pending', null, 1, null],
        ])
        await store.promote({
          pendingKid: 'p',
          activeKid: 'a',
          verifyUntil: T1,
          now: T1,
        })
        await store.retire('a', T1)
        await store.markPlaced('m', 'spki', T1)
        assert.deepEqual(await slots(db), [
          ['a', 'retired', null, null, T1],
          ['m', 'pending', null, 1, null],
          ['p', 'active', 1, null, null],
        ])
      }))

    test('a retired row needs retiredAt and no other row may have one', () =>
      run(async ({ store }) => {
        await assert.rejects(
          store.importRecords([rec({ status: 'retired' })], { mode: 'insert' })
        )
        await assert.rejects(
          store.importRecords([rec({ status: 'active', retiredAt: T1 })], {
            mode: 'insert',
          })
        )
        await assert.rejects(
          store.insertPending(rec({ status: 'pending', retiredAt: T1 }))
        )
      }))

    test('an unknown status is refused', () =>
      run(async ({ store }) => {
        await assert.rejects(
          store.importRecords([rec({ status: 'bogus' as never })], {
            mode: 'insert',
          })
        )
      }))

    test('a derived wrapping row keeps free-text purpose, algorithm and custody', () =>
      run(async ({ store }) => {
        const wrapping = rec({
          kid: 'w',
          purpose: 'wrapping',
          algorithm: 'hkdf-sha256',
          custody: 'derived',
          publicKey: undefined,
          privateRef: null,
        })
        assert.equal(await store.firstActivate(wrapping), true)
        const got = (await store.get('w'))!
        assert.equal(got.purpose, 'wrapping')
        assert.equal(got.algorithm, 'hkdf-sha256')
        assert.equal(got.custody, 'derived')
        assert.equal(got.publicKey, undefined)
      }))

    test('ciphertext that looks like JSON comes back as the same string', () =>
      run(async ({ store }) => {
        const wrapped = '{"iv":"abc","ct":"def"}'
        await store.insertPending(rec({ kid: 'j', privateWrapped: wrapped }))
        assert.equal((await store.get('j'))!.privateWrapped, wrapped)
      }))

    test('importing more rows than one statement carries', () =>
      run(async ({ store }) => {
        const retired = Array.from({ length: 130 }, (_, i) =>
          rec({
            kid: `old-${i}`,
            version: i + 1,
            status: 'retired',
            retiredAt: T0,
          })
        )
        const active = rec({ kid: 'now', version: 200, status: 'active' })
        const result = await store.importRecords([active, ...retired], {
          mode: 'insert',
        })
        assert.deepEqual(result, { inserted: 131, updated: 0, skipped: 0 })
        assert.equal((await store.list('audit', 'default')).length, 131)
        assert.equal((await store.list('audit', 'default'))[0]!.kid, 'now')
      }))

    describe('inside a caller transaction', () => {
      test('writes join the transaction and roll back with it', () =>
        run(async ({ db, store }) => {
          await assert.rejects(
            db.transaction().execute(async (tx) => {
              await store.insertPending(rec({ kid: 'in-tx', version: 1 }), {
                tx,
              })
              assert.ok(await store.get('in-tx', { tx }))
              throw new Error('abort')
            }),
            /abort/
          )
          assert.equal(await store.get('in-tx'), undefined)
        }))

      test('promote and importRecords run in it without opening their own', () =>
        run(async ({ db, store }) => {
          await store.firstActivate(rec({ kid: 'a', version: 1 }))
          await store.insertPending(rec({ kid: 'p', version: 2 }))
          await db.transaction().execute(async (tx) => {
            assert.equal(
              await store.promote(
                { pendingKid: 'p', activeKid: 'a', verifyUntil: T1, now: T1 },
                { tx }
              ),
              true
            )
            await store.importRecords(
              [
                rec({
                  kid: 'old',
                  version: 0,
                  status: 'retired',
                  retiredAt: T0,
                }),
              ],
              { mode: 'insert' },
              { tx }
            )
          })
          assert.equal((await store.get('p'))!.status, 'active')
          assert.equal((await store.get('old'))!.status, 'retired')
        }))

      test('a lost promote leaves the rest of the transaction intact and writes nothing itself', () =>
        run(async ({ db, store }) => {
          await store.firstActivate(rec({ kid: 'a', version: 1 }))
          await store.insertPending(rec({ kid: 'p', version: 2 }))
          await db.transaction().execute(async (tx) => {
            await store.insertPending(
              rec({ kid: 'kept', version: 3, scopeKey: 'x' }),
              {
                tx,
              }
            )
            // the pending key is stale: it is not the one that is pending
            assert.equal(
              await store.promote(
                { pendingKid: 'a', activeKid: 'a', verifyUntil: T1, now: T1 },
                { tx }
              ),
              false
            )
            // a promote that loses AFTER its demote was written must undo it
            await tx
              .updateTable('pikkuKey')
              .set({ status: 'retired', pendingSlot: null, retiredAt: T0 })
              .where('kid', '=', 'p')
              .execute()
            assert.equal(
              await store.promote(
                { pendingKid: 'p', activeKid: 'a', verifyUntil: T1, now: T1 },
                { tx }
              ),
              false
            )
          })
          assert.ok(await store.get('kept'))
          assert.equal((await store.get('a'))!.status, 'active')
          assert.equal((await store.get('a'))!.verifyUntil, undefined)
        }))

      test('a failed import leaves earlier writes of the transaction and none of its own', () =>
        run(async ({ db, store }) => {
          await store.firstActivate(rec({ kid: 'a', version: 1 }))
          await db.transaction().execute(async (tx) => {
            await store.insertPending(
              rec({ kid: 'kept', version: 9, scopeKey: 'x' }),
              {
                tx,
              }
            )
            await assert.rejects(
              store.importRecords(
                [
                  rec({
                    kid: 'fine',
                    version: 5,
                    scopeKey: 'y',
                    status: 'active',
                  }),
                  rec({ kid: 'clash', version: 6, status: 'active' }),
                ],
                { mode: 'insert' },
                { tx }
              )
            )
          })
          assert.ok(await store.get('kept'))
          assert.equal(await store.get('fine'), undefined)
          assert.equal(await store.get('clash'), undefined)
        }))
    })
  })
}

describe('KyselyKeyStore.init', () => {
  test('refuses to start when the table is missing, and creates nothing', async () => {
    const db = sqliteDb(':memory:')
    await assert.rejects(
      new KyselyKeyStore(db).init(),
      /pikku db generate[\s\S]*|'key' schema/
    )
    const tables = await db.introspection.getTables()
    assert.equal(tables.length, 0)
  })

  test('starts once the table exists, and is idempotent', async () => {
    const db = sqliteDb(':memory:')
    await applyPikkuSchemas(db, [keySchema])
    const store = new KyselyKeyStore(db)
    await store.init()
    await store.init()
  })
})

describe('keySchema', () => {
  test('is gated on keyService, never on keyStore', () => {
    assert.deepEqual(keySchema.ownedBy, ['keyService'])
    assert.ok(
      requiredPikkuSchemas(new Set(['keyService'])).some(
        (s) => s.name === 'key'
      )
    )
    assert.ok(
      !requiredPikkuSchemas(new Set(['keyStore'])).some((s) => s.name === 'key')
    )
  })

  test('an app that does not use keyService gets none, and every other schema is as before', () => {
    const without = requiredPikkuSchemas(
      new Set(['workflowService', 'leaseService', 'audit'])
    )
    assert.ok(!without.some((s) => s.name === 'key'))
    const withKeys = requiredPikkuSchemas(
      new Set(['workflowService', 'leaseService', 'audit', 'keyService'])
    )
    assert.deepEqual(
      withKeys.filter((s) => s.name !== 'key').map((s) => s.name),
      without.map((s) => s.name)
    )
  })

  test('is in the schema list every project can ask from', () => {
    assert.ok(pikkuSchemas.includes(keySchema))
  })

  test('private_wrapped is classified secret and already ciphertext', () => {
    const column = keySchema.tables.pikkuKey!.columns.privateWrapped!
    assert.equal(column.security, 'secret')
    assert.equal(column.form, 'plain')
  })

  test('has no check vocabulary and no partial index (MySQL cannot)', () => {
    const table = keySchema.tables.pikkuKey!
    assert.ok(!table.indexes?.some((index) => index.where))
  })
})

describe('KyselySecretService', () => {
  test('is durable: its secrets outlive a restart', () => {
    const service = new KyselySecretService(sqliteDb(':memory:'), {
      key: 'k'.repeat(32),
    })
    assert.equal(service.durable, true)
  })
})
