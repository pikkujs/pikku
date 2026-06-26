import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Database } from 'bun:sqlite'
import { Kysely, SqliteDialect } from 'kysely'
import { BunSqliteDatabase } from './bun-sqlite-adapter.js'

interface TestDB {
  items: { id: number; name: string; active: number; score: number | null }
}

describe('BunSqliteDatabase', () => {
  let db: Database
  let kysely: Kysely<TestDB>

  beforeEach(() => {
    db = new Database(':memory:')
    kysely = new Kysely<TestDB>({
      dialect: new SqliteDialect({ database: new BunSqliteDatabase(db) }),
    })
  })

  afterEach(async () => {
    await kysely.destroy()
  })

  test('create table and insert a row', async () => {
    await kysely.schema
      .createTable('items')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('active', 'integer', (c) => c.notNull())
      .addColumn('score', 'real')
      .execute()

    await kysely
      .insertInto('items')
      .values({ name: 'alpha', active: 1, score: 3.14 })
      .execute()

    const rows = await kysely.selectFrom('items').selectAll().execute()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'alpha')
    assert.equal(rows[0].active, 1)
    assert.equal(rows[0].score, 3.14)
  })

  test('update and delete', async () => {
    await kysely.schema
      .createTable('items')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('active', 'integer', (c) => c.notNull())
      .addColumn('score', 'real')
      .execute()

    await kysely
      .insertInto('items')
      .values([
        { name: 'a', active: 1, score: null },
        { name: 'b', active: 0, score: null },
      ])
      .execute()

    await kysely
      .updateTable('items')
      .set({ active: 1 })
      .where('name', '=', 'b')
      .execute()
    const updated = await kysely
      .selectFrom('items')
      .where('name', '=', 'b')
      .selectAll()
      .executeTakeFirstOrThrow()
    assert.equal(updated.active, 1)

    await kysely.deleteFrom('items').where('name', '=', 'a').execute()
    const remaining = await kysely.selectFrom('items').selectAll().execute()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].name, 'b')
  })

  test('boolean coercion via coerce function', async () => {
    await kysely.schema
      .createTable('items')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('active', 'integer', (c) => c.notNull())
      .addColumn('score', 'real')
      .execute()

    await kysely
      .insertInto('items')
      .values({
        name: 'bool-test',
        active: true as unknown as number,
        score: null,
      })
      .execute()
    const row = await kysely
      .selectFrom('items')
      .selectAll()
      .executeTakeFirstOrThrow()
    assert.equal(row.active, 1)
  })

  test('null values round-trip', async () => {
    await kysely.schema
      .createTable('items')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('active', 'integer', (c) => c.notNull())
      .addColumn('score', 'real')
      .execute()

    await kysely
      .insertInto('items')
      .values({ name: 'nullable', active: 0, score: null })
      .execute()
    const row = await kysely
      .selectFrom('items')
      .selectAll()
      .executeTakeFirstOrThrow()
    assert.equal(row.score, null)
  })

  test('iterate returns rows lazily', async () => {
    await kysely.schema
      .createTable('items')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('active', 'integer', (c) => c.notNull())
      .addColumn('score', 'real')
      .execute()

    await kysely
      .insertInto('items')
      .values([
        { name: 'x', active: 1, score: null },
        { name: 'y', active: 1, score: null },
        { name: 'z', active: 1, score: null },
      ])
      .execute()

    const collected: string[] = []
    const stmt = new BunSqliteDatabase(db).prepare(
      'SELECT name FROM items ORDER BY id'
    )
    for (const row of stmt.iterate([])) {
      collected.push((row as any).name)
    }
    assert.deepEqual(collected, ['x', 'y', 'z'])
  })

  test('reader is false for writes so run() returns mutation metadata', async () => {
    await kysely.schema
      .createTable('items')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('active', 'integer', (c) => c.notNull())
      .addColumn('score', 'real')
      .execute()

    const inserted = await kysely
      .insertInto('items')
      .values({ name: 'meta', active: 1, score: null })
      .executeTakeFirstOrThrow()
    assert.equal(inserted.insertId, 1n)

    const updated = await kysely
      .updateTable('items')
      .set({ active: 0 })
      .where('name', '=', 'meta')
      .executeTakeFirstOrThrow()
    assert.equal(updated.numUpdatedRows, 1n)
  })
})
