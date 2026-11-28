import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCRATCH_SERVER_ENV,
  scratchServerUrl,
  withScratchServerDatabase,
} from './scratch-server.js'
import { desiredRuntimeSchema, type ResolvedDb } from '../local-db.js'

/**
 * These run against a real Postgres server whose role may CREATE and DROP
 * databases: set PIKKU_TEST_POSTGRES_URL, e.g.
 * postgres://postgres:password@127.0.0.1:5432/postgres
 */
const SERVER_URL = process.env.PIKKU_TEST_POSTGRES_URL

describe('scratchServerUrl', () => {
  const before = process.env[SCRATCH_SERVER_ENV]
  afterEach(() => {
    if (before === undefined) delete process.env[SCRATCH_SERVER_ENV]
    else process.env[SCRATCH_SERVER_ENV] = before
  })

  test('is only set by its own variable, never by DATABASE_URL', () => {
    delete process.env[SCRATCH_SERVER_ENV]
    const database = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgres://app@localhost/app'
    try {
      assert.equal(scratchServerUrl(), undefined)
    } finally {
      if (database === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = database
    }
  })
})

describe('scratch databases on a server', { skip: !SERVER_URL }, () => {
  const before = process.env[SCRATCH_SERVER_ENV]
  afterEach(() => {
    if (before === undefined) delete process.env[SCRATCH_SERVER_ENV]
    else process.env[SCRATCH_SERVER_ENV] = before
  })

  const exists = (name: string) =>
    withScratchServerDatabase(SERVER_URL!, async (client) => {
      const { rows } = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [name]
      )
      return rows.length > 0
    })

  const currentDatabase = async (client: {
    query: (sql: string) => Promise<{ rows: any[] }>
  }): Promise<string> =>
    (await client.query('SELECT current_database() AS name')).rows[0].name

  test('the database is dropped after use', async () => {
    const name = await withScratchServerDatabase(SERVER_URL!, currentDatabase)
    assert.match(name, /^pikku_scratch_/)
    assert.equal(await exists(name), false)
  })

  test('the database is dropped when the work throws', async () => {
    let name = ''
    await assert.rejects(
      withScratchServerDatabase(SERVER_URL!, async (client) => {
        name = await currentDatabase(client)
        throw new Error('boom')
      }),
      /boom/
    )
    assert.match(name, /^pikku_scratch_/)
    assert.equal(await exists(name), false)
  })

  test('computes the same runtime schema as the embedded database', async () => {
    const resolved = {
      dialect: 'postgres',
      mode: 'url',
      connectionString: 'postgres://unused@127.0.0.1:1/unused',
      rootDir: process.cwd(),
      pgliteExtensions: [],
    } as unknown as ResolvedDb

    const logger = { error: (message: string) => assert.fail(message) }

    delete process.env[SCRATCH_SERVER_ENV]
    const embedded = await desiredRuntimeSchema(
      resolved,
      process.cwd(),
      [],
      logger
    )
    process.env[SCRATCH_SERVER_ENV] = SERVER_URL
    const external = await desiredRuntimeSchema(
      resolved,
      process.cwd(),
      [],
      logger
    )

    assert.deepEqual(external, embedded)
  })
})
