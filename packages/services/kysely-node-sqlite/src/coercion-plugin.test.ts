import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createNodeSqliteKysely, createCoercionPlugin } from './index.js'
import type { CoercionMap } from './index.js'
import { sql, type Kysely } from 'kysely'

interface TestDB {
  users: { id: number; settings: unknown }
  posts: { id: number; settings: unknown }
}

/**
 * The same map the CLI's local database builds from `coercion.gen.ts`: two
 * tables that disagree on the kind of a same-named column. Resolving it needs
 * the query's tables, which is what kept the CLI's copy and the runtime copies
 * from behaving identically.
 */
const map: CoercionMap = {
  users: { settings: 'json' },
  posts: { settings: 'bool' },
}

const seed = async (db: Kysely<TestDB>) => {
  await sql`create table users (id integer primary key, settings text)`.execute(
    db
  )
  await sql`create table posts (id integer primary key, settings integer)`.execute(
    db
  )
  await sql`insert into users (id, settings) values (1, '{"theme":"dark"}')`.execute(
    db
  )
  await sql`insert into posts (id, settings) values (1, 1)`.execute(db)
}

describe('node-sqlite coercion plugin', () => {
  test('resolves a colliding column against the queried table', async () => {
    const db = createNodeSqliteKysely<TestDB>({
      filename: ':memory:',
      plugins: [createCoercionPlugin({ map })],
    })
    await seed(db)

    const user = await db
      .selectFrom('users')
      .select('settings')
      .executeTakeFirstOrThrow()
    assert.deepEqual(user.settings, { theme: 'dark' })

    const post = await db
      .selectFrom('posts')
      .select('settings')
      .executeTakeFirstOrThrow()
    assert.equal(post.settings, true)

    await db.destroy()
  })

  test('coerces date, bool and json columns read back from SQLite', async () => {
    const db = createNodeSqliteKysely<{
      rows: { created_at: unknown; is_active: unknown; meta: unknown }
    }>({
      filename: ':memory:',
      camelCase: false,
      plugins: [
        createCoercionPlugin({
          map: {
            rows: { created_at: 'date', is_active: 'bool', meta: 'json' },
          },
        }),
      ],
    })
    await sql`create table rows (created_at text, is_active integer, meta text)`.execute(
      db
    )
    await sql`insert into rows values ('2026-06-26T00:00:00.000Z', 0, '{"a":1}')`.execute(
      db
    )

    const row = await db
      .selectFrom('rows')
      .selectAll()
      .executeTakeFirstOrThrow()
    assert.ok(row.created_at instanceof Date)
    assert.equal(row.is_active, false)
    assert.deepEqual(row.meta, { a: 1 })

    await db.destroy()
  })
})
