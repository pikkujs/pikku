import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult,
  type UnknownRow,
} from 'kysely'
import type { ClassificationManifest } from '@pikku/core/classification'
import { deriveKEK, generateKEKSalt } from '@pikku/core/crypto-utils'
import {
  ClassificationCrypto,
  type KEKResolver,
} from './classification-crypto.js'
import { createClassificationPlugin } from './classification-plugin.js'

interface TestDB {
  users: {
    id: string
    email: string
    ssn: string
    tokenHash: string
    recovery: string
  }
}

const manifest: ClassificationManifest = {
  version: 1,
  tables: {
    users: {
      id: { classification: 'public', anonymize_strategy: null },
      email: { classification: 'pii', anonymize_strategy: 'fake:email' },
      ssn: {
        classification: 'secret',
        anonymize_strategy: null,
        form: 'wrapped',
      },
      token_hash: {
        classification: 'secret',
        anonymize_strategy: null,
        form: 'hashed',
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

let crypto: ClassificationCrypto

/** A key source with nothing to give, the way an unconfigured one behaves. */
class NoKeyError extends Error {}
const noKey: KEKResolver = async () => {
  throw new NoKeyError('no key for this column')
}

before(async () => {
  const keks = new Map<string, Promise<CryptoKey>>()
  const resolveKEK: KEKResolver = async (keyId) => {
    let kek = keks.get(keyId)
    if (!kek) {
      kek = deriveKEK(
        'a-passphrase-long-enough-to-be-real-key-material',
        generateKEKSalt()
      )
      keks.set(keyId, kek)
    }
    return { kek: await kek, keyVersion: 1 }
  }
  crypto = new ClassificationCrypto({ resolveKEK })
})

const plugin = () => createClassificationPlugin({ manifest, crypto })

const selectFrom = (tables: string[]) => ({
  kind: 'SelectQueryNode',
  from: {
    kind: 'FromNode',
    froms: tables.map((table) => ({
      kind: 'TableNode',
      table: {
        kind: 'SchemableIdentifierNode',
        identifier: { kind: 'IdentifierNode', name: table },
      },
    })),
  },
})

const readRows = async (
  rows: UnknownRow[],
  tables: string[] = ['users']
): Promise<UnknownRow[]> => {
  const p = plugin()
  const queryId = {} as { queryId: string }
  p.transformQuery({ queryId, node: selectFrom(tables) } as any)
  const out = await p.transformResult({
    queryId,
    result: { rows } as QueryResult<UnknownRow>,
  } as any)
  return out.rows as UnknownRow[]
}

const writeDb = () =>
  new Kysely<TestDB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin(), plugin()],
  })

describe('reading classified columns', () => {
  test('a wrapped column decrypts transparently', async () => {
    const ssn = await crypto.encryptColumn('default', '123-45-6789')
    const [row] = await readRows([{ id: 'u1', ssn }])
    assert.equal(row!.ssn, '123-45-6789')
  })

  test('a column with its own keyId decrypts under that key', async () => {
    const recovery = await crypto.encryptColumn('recovery-codes', 'abc-def')
    const [row] = await readRows([{ id: 'u1', recovery }])
    assert.equal(row!.recovery, 'abc-def')
  })

  test('plain and pii columns are left alone', async () => {
    const [row] = await readRows([{ id: 'u1', email: 'a@b.c' }])
    assert.equal(row!.email, 'a@b.c')
    assert.equal(row!.id, 'u1')
  })

  test('a hashed column is never decrypted — the hash is the lookup key', async () => {
    const tokenHash = 'sha256:deadbeef'
    const [row] = await readRows([{ id: 'u1', tokenHash }])
    assert.equal(row!.tokenHash, tokenHash)
  })

  test('a null wrapped column stays null', async () => {
    const [row] = await readRows([{ id: 'u1', ssn: null }])
    assert.equal(row!.ssn, null)
  })

  test('columns of a table the query never touched are left alone', async () => {
    const [row] = await readRows([{ ssn: 'not-an-envelope' }], ['audit'])
    assert.equal(row!.ssn, 'not-an-envelope')
  })

  test('plain and hashed columns still read without any key at all', async () => {
    const p = createClassificationPlugin({
      manifest,
      crypto: new ClassificationCrypto({ resolveKEK: noKey }),
    })
    const queryId = {} as { queryId: string }
    p.transformQuery({ queryId, node: selectFrom(['users']) } as any)

    // A sign-in that checks a token hash has to work on a deployment whose key
    // source is unavailable, so a query touching no wrapped column must never
    // reach the resolver at all.
    const out = await p.transformResult({
      queryId,
      result: {
        rows: [{ id: 'u1', email: 'a@b.c', tokenHash: 'sha256:deadbeef' }],
      } as QueryResult<UnknownRow>,
    } as any)

    assert.deepEqual(out.rows[0], {
      id: 'u1',
      email: 'a@b.c',
      tokenHash: 'sha256:deadbeef',
    })
  })

  test('a wrapped column read without its key fails loudly', async () => {
    const stored = await crypto.encryptColumn('default', 'ssn')

    const p = createClassificationPlugin({
      manifest,
      crypto: new ClassificationCrypto({ resolveKEK: noKey }),
    })
    const queryId = {} as { queryId: string }
    p.transformQuery({ queryId, node: selectFrom(['users']) } as any)

    await assert.rejects(
      () =>
        p.transformResult({
          queryId,
          result: {
            rows: [{ id: 'u1', ssn: stored }],
          } as QueryResult<UnknownRow>,
        } as any),
      (error: unknown) => error instanceof NoKeyError,
      'handing back an unopened envelope as if it were the value would be worse'
    )
  })

  test('decrypts under CamelCasePlugin, which renames the column first', async () => {
    const value = await crypto.encryptColumn('default', 'x')
    const [snake] = await readRows([{ token_hash: 'h', ssn: value }])
    assert.equal(snake!.ssn, 'x')
  })
})

describe('writing classified columns', () => {
  test('plaintext into a wrapped column is refused', async () => {
    await assert.rejects(
      () =>
        writeDb()
          .insertInto('users')
          .values({ id: 'u1', ssn: '123-45-6789' as never })
          .execute(),
      /ssn/,
      'a forgotten encryption must not reach the database'
    )
  })

  test('a real envelope is accepted', async () => {
    const ssn = await crypto.encryptColumn('default', '123-45-6789')
    await writeDb()
      .insertInto('users')
      .values({ id: 'u1', ssn: ssn as never })
      .execute()
  })

  test('an update with plaintext is refused too', async () => {
    await assert.rejects(
      () =>
        writeDb()
          .updateTable('users')
          .set({ ssn: 'oops' as never })
          .where('id', '=', 'u1')
          .execute(),
      /ssn/
    )
  })

  test('unclassified columns are written without complaint', async () => {
    await writeDb()
      .insertInto('users')
      .values({ id: 'u1', email: 'a@b.c' })
      .execute()
  })

  test('a hashed column takes its hash as-is', async () => {
    await writeDb()
      .insertInto('users')
      .values({ id: 'u1', tokenHash: 'sha256:deadbeef' as never })
      .execute()
  })

  test('a null wrapped column is allowed', async () => {
    await writeDb()
      .insertInto('users')
      .values({ id: 'u1', ssn: null as never })
      .execute()
  })
})
