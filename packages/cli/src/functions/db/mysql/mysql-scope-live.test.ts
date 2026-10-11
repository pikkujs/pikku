import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  desiredRuntimeSchema,
  resolveDb,
  type ResolvedMysqlDb,
} from '../local-db.js'
import { withMysqlClient } from './mysql-client.js'

/**
 * A project whose Better Auth `user` model lives on a legacy `users` table
 * (a Rails app, `bigint` id). The scope schema used to read as unmet because
 * it looked for a table called `user`, and `db generate` left it out. It has to
 * be emitted, pointing at `users`, with the key typed like `users.id`.
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
      database: { db: services.kysely, type: 'mysql' },
      user: { modelName: 'users' },
      emailAndPassword: { enabled: true },
    }),
  { [PIKKU_BETTER_AUTH]: true }
)
`

describe('scope schema on a mapped users table', { skip: !SERVER_URL }, () => {
  let root: string
  let database: string
  let resolved: ResolvedMysqlDb
  const admin = { connectionString: SERVER_URL! } as ResolvedMysqlDb

  before(async () => {
    root = mkdtempSync(resolve(import.meta.dirname, '../../../../.scope-live-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'db/mysql'), { recursive: true })
    writeFileSync(join(root, 'src/auth.ts'), AUTH)
    writeFileSync(
      join(root, 'db/mysql/0001-rails.sql'),
      'create table `users` (`id` bigint not null auto_increment primary key, `email` varchar(255));\n'
    )
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

  test('emits the scope tables with the key typed like users.id', async () => {
    const runtime = await desiredRuntimeSchema(resolved, root, ['src'], {
      error: (m) => assert.fail(m),
    })
    assert.deepEqual(runtime.skipped, [])
    assert.ok(runtime.tables.has('pikku_user_role'))
    assert.ok(runtime.tables.has('pikku_user_scope'))
    assert.match(runtime.sql, /`user_id` bigint not null/i)
    assert.match(
      runtime.sql,
      /foreign key \(`user_id`\) references `users` \(`id`\)/i
    )
    assert.doesNotMatch(runtime.sql, /references `user` /i)
  })
})
