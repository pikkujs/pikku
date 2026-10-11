import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  computeAuthDrift,
  desiredAuthSchema,
  resolveDb,
  type ResolvedMysqlDb,
} from '../local-db.js'
import { withMysqlClient } from './mysql-client.js'

/**
 * An auth factory names its own dialect, and the starter template says
 * `sqlite`. On a MySQL project that used to send SQLite's introspection queries
 * (`pragma index_list`) to the server. The resolved database decides.
 * Needs PIKKU_TEST_MYSQL_URL, as mysql-live does.
 */
const SERVER_URL = process.env.PIKKU_TEST_MYSQL_URL

const AUTH = `import { betterAuth } from 'better-auth'
const PIKKU_BETTER_AUTH = Symbol.for('pikku.betterAuth')
// Marker for the source scan: pikkuBetterAuth(
export const auth = Object.assign(
  (services: any) =>
    betterAuth({
      secret: 'x'.repeat(40),
      baseURL: 'http://localhost:3000',
      database: { db: services.kysely, type: 'sqlite' },
      emailAndPassword: { enabled: true },
    }),
  { [PIKKU_BETTER_AUTH]: true }
)
`

describe('Better Auth on mysql', { skip: !SERVER_URL }, () => {
  let root: string
  let database: string
  let resolved: ResolvedMysqlDb
  const admin = { connectionString: SERVER_URL! } as ResolvedMysqlDb

  before(async () => {
    // Under the package so `better-auth` resolves from the factory file.
    root = mkdtempSync(resolve(import.meta.dirname, '../../../../.auth-live-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'db/mysql'), { recursive: true })
    writeFileSync(join(root, 'src/auth.ts'), AUTH)
    database = `pikku_t_${randomBytes(5).toString('hex')}`
    await withMysqlClient(admin, (c) =>
      c.exec(`CREATE DATABASE \`${database}\``)
    )
    const url = new URL(SERVER_URL!)
    url.pathname = `/${database}`
    resolved = resolveDb(
      { mysqlUrl: url.toString() },
      root,
      join(root, '.pikku')
    ) as ResolvedMysqlDb
  })

  after(async () => {
    await withMysqlClient(admin, (c) =>
      c.exec(`DROP DATABASE IF EXISTS \`${database}\``)
    )
    rmSync(root, { recursive: true, force: true })
  })

  const logger = { error: (m: string) => assert.fail(m) }

  test('derives the auth schema in MySQL types though the factory says sqlite', async () => {
    const desired = await desiredAuthSchema(resolved, root, ['src'], logger)
    assert.ok(desired)
    assert.ok(desired.tables.has('user'))
    assert.ok(desired.tables.has('session'))
    assert.ok(desired.tables.has('account'))
    assert.match(desired.sql, /create table `user`/i)
    assert.doesNotMatch(desired.sql, /pragma/i)
  })

  test('drift against an empty database reports the missing tables', async () => {
    const drift = await computeAuthDrift(resolved, root, ['src'], logger)
    assert.equal(drift.hasAuth, true)
    assert.equal(drift.inSync, false)
    assert.ok(drift.missingTables.includes('user'))
  })
})
