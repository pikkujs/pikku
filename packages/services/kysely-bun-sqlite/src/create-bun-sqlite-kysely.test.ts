import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'kysely'
import { createBunSqliteKysely } from './create-bun-sqlite-kysely.js'

interface TestDB {
  widgets: { id: number; displayName: string }
}

describe('createBunSqliteKysely', () => {
  test('creates a working in-memory Kysely with camelCase mapping by default', async () => {
    const db = createBunSqliteKysely<TestDB>({ filename: ':memory:' })

    await sql`CREATE TABLE widgets (id INTEGER PRIMARY KEY, display_name TEXT)`.execute(
      db
    )
    await db
      .insertInto('widgets')
      .values({ id: 1, displayName: 'hello' })
      .execute()

    const row = await db
      .selectFrom('widgets')
      .selectAll()
      .executeTakeFirstOrThrow()

    assert.equal(row.displayName, 'hello')
    await db.destroy()
  })

  test('can disable camelCase and layer extra plugins', async () => {
    const db = createBunSqliteKysely<{ t: { snake_col: string } }>({
      filename: ':memory:',
      camelCase: false,
      plugins: [],
    })

    await sql`CREATE TABLE t (snake_col TEXT)`.execute(db)
    await db.insertInto('t').values({ snake_col: 'raw' }).execute()
    const row = await db.selectFrom('t').selectAll().executeTakeFirstOrThrow()

    assert.equal(row.snake_col, 'raw')
    await db.destroy()
  })
})
