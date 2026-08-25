import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely'
import { PGlite } from '@electric-sql/pglite'
import type { ClassificationManifest } from '@pikku/core/classification'
import { DataLock } from '@pikku/core/classification'
import { DataLockedError } from '@pikku/core/errors'
import {
  ClassificationCrypto,
  createDataLockResolver,
  createMemoryLockVault,
} from './classification-crypto.js'
import { createClassificationPlugin } from './classification-plugin.js'

interface AccountsDB {
  accounts: {
    id: string
    email: string
    ssn: string
    recovery: string
  }
}

const manifest: ClassificationManifest = {
  version: 1,
  tables: {
    accounts: {
      id: { classification: 'public', anonymize_strategy: null },
      email: { classification: 'pii', anonymize_strategy: 'fake:email' },
      ssn: {
        classification: 'secret',
        anonymize_strategy: null,
        form: 'wrapped',
      },
      recovery: {
        classification: 'secret',
        anonymize_strategy: null,
        form: 'wrapped',
        keyId: 'recovery-codes',
      },
    },
  },
}

class PGliteConnection implements DatabaseConnection {
  constructor(private readonly db: PGlite) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.db.query<R>(query.sql, [...query.parameters])
    return {
      rows: result.rows,
      numAffectedRows:
        result.affectedRows !== undefined
          ? BigInt(result.affectedRows)
          : undefined,
    }
  }

  async *streamQuery<R>(
    query: CompiledQuery
  ): AsyncIterableIterator<QueryResult<R>> {
    yield await this.executeQuery<R>(query)
  }
}

class PGliteDriver implements Driver {
  private readonly connection: PGliteConnection
  constructor(private readonly db: PGlite) {
    this.connection = new PGliteConnection(db)
  }
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection
  }
  async beginTransaction(): Promise<void> {
    await this.db.exec('BEGIN')
  }
  async commitTransaction(): Promise<void> {
    await this.db.exec('COMMIT')
  }
  async rollbackTransaction(): Promise<void> {
    await this.db.exec('ROLLBACK')
  }
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

const PASSPHRASE = 'a-passphrase-long-enough-to-be-real-key-material'

let pglite: PGlite
let db: Kysely<AccountsDB>
let crypto: ClassificationCrypto
let lock: DataLock

before(async () => {
  lock = new DataLock(createMemoryLockVault())
  await lock.init()
  await lock.initialize(PASSPHRASE, ['default', 'recovery-codes'])
  crypto = new ClassificationCrypto({
    resolveKEK: createDataLockResolver(lock),
  })

  pglite = new PGlite()
  db = new Kysely<AccountsDB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new PGliteDriver(pglite),
      createIntrospector: (i) => new PostgresIntrospector(i),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [
      new CamelCasePlugin(),
      createClassificationPlugin({
        manifest,
        crypto,
      }),
    ],
  })

  await pglite.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      ssn TEXT,
      recovery TEXT
    )
  `)
})

after(async () => {
  await pglite.close()
})

describe('against a real postgres', () => {
  test('a wrapped column round-trips through the database', async () => {
    await db
      .insertInto('accounts')
      .values({
        id: 'a1',
        email: 'a@b.c',
        ssn: (await crypto.encryptColumn('default', '123-45-6789')) as never,
        recovery: (await crypto.encryptColumn(
          'recovery-codes',
          'zzz-999'
        )) as never,
      })
      .execute()

    const row = await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', 'a1')
      .executeTakeFirstOrThrow()

    assert.equal(row.ssn, '123-45-6789')
    assert.equal(row.recovery, 'zzz-999')
    assert.equal(row.email, 'a@b.c')
  })

  test('what is actually on disk is ciphertext', async () => {
    const raw = await pglite.query<{ ssn: string }>(
      `SELECT ssn FROM accounts WHERE id = 'a1'`
    )
    const stored = raw.rows[0]!.ssn
    assert.ok(stored.startsWith('pikku1.'))
    assert.ok(!stored.includes('123-45-6789'))
  })

  test('a pii column is still queryable, which is the point', async () => {
    const row = await db
      .selectFrom('accounts')
      .select('id')
      .where('email', '=', 'a@b.c')
      .executeTakeFirst()
    assert.equal(row?.id, 'a1')
  })

  test('a forgotten encryption never reaches the database', async () => {
    await assert.rejects(
      () =>
        db
          .insertInto('accounts')
          .values({ id: 'a2', email: 'x@y.z', ssn: 'raw-ssn' as never })
          .execute(),
      /ssn/
    )
    const found = await db
      .selectFrom('accounts')
      .select('id')
      .where('id', '=', 'a2')
      .executeTakeFirst()
    assert.equal(found, undefined)
  })

  test('a rewrapped value still reads back through the plugin', async () => {
    const raw = await pglite.query<{ ssn: string }>(
      `SELECT ssn FROM accounts WHERE id = 'a1'`
    )
    const rewrapped = await crypto.rewrapColumn(
      raw.rows[0]!.ssn,
      'recovery-codes'
    )
    await sql`UPDATE accounts SET ssn = ${rewrapped} WHERE id = 'a1'`.execute(
      db
    )

    const row = await db
      .selectFrom('accounts')
      .select('ssn')
      .where('id', '=', 'a1')
      .executeTakeFirstOrThrow()
    assert.equal(row.ssn, '123-45-6789')
  })

  test('locking shuts a column that was readable a moment ago, and unlocking opens it again', async () => {
    // The whole point of the passphrase gate: the rows are already on disk and
    // the process is already running, so what changes when someone walks away
    // has to be the key alone — not the services, the connection or the plugin.
    const before = await db
      .selectFrom('accounts')
      .select('ssn')
      .where('id', '=', 'a1')
      .executeTakeFirstOrThrow()
    assert.equal(before.ssn, '123-45-6789')

    lock.lock()

    await assert.rejects(
      () =>
        db
          .selectFrom('accounts')
          .select('ssn')
          .where('id', '=', 'a1')
          .executeTakeFirstOrThrow(),
      DataLockedError
    )

    // A locked store must not accept a write either. Failing loudly here is
    // what stops a value being stored in the clear because nobody could reach
    // the key to wrap it.
    await assert.rejects(
      () => crypto.encryptColumn('default', 'never-written'),
      DataLockedError
    )

    await lock.unlock(PASSPHRASE)

    const after = await db
      .selectFrom('accounts')
      .select('ssn')
      .where('id', '=', 'a1')
      .executeTakeFirstOrThrow()
    assert.equal(after.ssn, '123-45-6789')
  })
})
