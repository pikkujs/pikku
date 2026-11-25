import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from 'kysely'
import { PGlite } from '@electric-sql/pglite'

import { jsonbMerge, jsonbValue } from './jsonb.js'

/**
 * PGlite alone cannot reproduce this bug. The double-encoding happens in the
 * postgres.js *client*, which describes each parameter, learns the OID implied
 * by the cast that follows it, and re-serializes anything it believes is jsonb
 * with `JSON.stringify`. PGlite hands parameters straight to the server as
 * text, so both the safe and the unsafe form round-trip correctly there.
 *
 * This driver reinstates the one postgres.js behaviour that matters: a
 * parameter written as `$n::jsonb` is JSON-encoded before it is sent. Under it
 * a bare `${json}::jsonb` reproduces the reported corruption exactly, and the
 * `(${json}::text)::jsonb` hop the helpers emit does not.
 */
class PostgresJsEmulatingDriver implements Driver {
  #connection: DatabaseConnection
  #queue: Promise<void> = Promise.resolve()

  constructor(private readonly pglite: PGlite) {
    this.#connection = {
      executeQuery: async <R>(compiled: {
        sql: string
        parameters: readonly unknown[]
      }): Promise<QueryResult<R>> => {
        const parameters = [...compiled.parameters]
        for (const match of compiled.sql.matchAll(/\$(\d+)::jsonb\b/g)) {
          const index = Number(match[1]) - 1
          parameters[index] = JSON.stringify(parameters[index])
        }
        const result = await this.pglite.query<R>(compiled.sql, parameters)
        return {
          rows: result.rows,
          numAffectedRows: BigInt(result.affectedRows ?? 0),
        }
      },
      streamQuery(): never {
        throw new Error('streaming is not supported by this test driver')
      },
    }
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const mine = this.#queue.then(() => this.#connection)
    this.#queue = this.#queue.then(() => held)
    const connection = await mine
    releases.set(connection, [...(releases.get(connection) ?? []), release])
    return connection
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: 'begin', parameters: [] } as any)
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: 'commit', parameters: [] } as any)
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: 'rollback', parameters: [] } as any)
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    releases.get(connection)?.shift()?.()
  }

  async destroy(): Promise<void> {
    await this.pglite.close()
  }
}

const releases = new Map<DatabaseConnection, Array<() => void>>()

class EmulatingDialect implements Dialect {
  constructor(private readonly pglite: PGlite) {}
  createAdapter() {
    return new PostgresAdapter()
  }
  createDriver() {
    return new PostgresJsEmulatingDriver(this.pglite)
  }
  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db)
  }
  createQueryCompiler() {
    return new PostgresQueryCompiler()
  }
}

interface TestDB {
  doc: { id: number; metadata: unknown }
}

let db: Kysely<TestDB>

beforeEach(async () => {
  db = new Kysely<TestDB>({
    dialect: new EmulatingDialect(new PGlite()),
    plugins: [new CamelCasePlugin()],
  })
  await sql`create table doc (id int primary key, metadata jsonb)`.execute(db)
  await sql`insert into doc values (1, '{"role":"user"}'::jsonb)`.execute(db)
})

afterEach(async () => {
  await db.destroy()
})

const readMetadata = async () => {
  const row = await db
    .selectFrom('doc')
    .select('metadata')
    .where('id', '=', 1)
    .executeTakeFirstOrThrow()
  return row.metadata
}

describe('jsonb helpers', () => {
  test('jsonbMerge produces a merged object, not a two-element array', async () => {
    await db
      .updateTable('doc')
      .set((eb) => ({
        metadata: jsonbMerge(eb.ref('metadata'), { plan: 'pro' }) as any,
      }))
      .where('id', '=', 1)
      .execute()

    assert.deepEqual(await readMetadata(), { role: 'user', plan: 'pro' })
  })

  test('jsonbMerge keeps scalar values typed rather than stringified', async () => {
    await db
      .updateTable('doc')
      .set((eb) => ({
        metadata: jsonbMerge(eb.ref('metadata'), {
          seats: 1,
          active: true,
        }) as any,
      }))
      .where('id', '=', 1)
      .execute()

    assert.deepEqual(await readMetadata(), {
      role: 'user',
      seats: 1,
      active: true,
    })
  })

  test('jsonbValue lands as a JSON object rather than a JSON string', async () => {
    await db
      .updateTable('doc')
      .set({ metadata: jsonbValue({ role: 'admin' }) as any })
      .where('id', '=', 1)
      .execute()

    assert.deepEqual(await readMetadata(), { role: 'admin' })
  })

  /**
   * Guards the emulation itself: if this ever stops corrupting, the driver has
   * drifted from postgres.js and the tests above no longer prove anything.
   */
  test('a patch bound directly against ::jsonb is the reported corruption', async () => {
    const patch = JSON.stringify({ plan: 'pro' })
    await db
      .updateTable('doc')
      .set((eb) => ({
        metadata:
          sql`coalesce(${eb.ref('metadata')}, '{}'::jsonb) || ${patch}::jsonb` as any,
      }))
      .where('id', '=', 1)
      .execute()

    assert.deepEqual(await readMetadata(), [{ role: 'user' }, '{"plan":"pro"}'])
  })

  test('jsonbValue refuses a value with no JSON representation', () => {
    for (const value of [undefined, () => {}, Symbol('nope')]) {
      assert.throws(() => jsonbValue(value), TypeError)
    }
  })

  test('jsonbMerge refuses a patch with no JSON representation', () => {
    assert.throws(() => jsonbMerge(sql`metadata` as any, undefined), TypeError)
  })

  test('jsonbValue still binds null and false, which are valid JSON', () => {
    assert.doesNotThrow(() => jsonbValue(null))
    assert.doesNotThrow(() => jsonbValue(false))
  })
})
