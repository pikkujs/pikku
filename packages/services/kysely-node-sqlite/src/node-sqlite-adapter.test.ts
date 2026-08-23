import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createNodeSqliteKysely } from './create-node-sqlite-kysely.js'

interface DB {
  widget: { id: number; name: string }
}

const withDb = async (fn: (db: ReturnType<typeof create>) => Promise<void>) => {
  const db = create()
  try {
    await fn(db)
  } finally {
    await db.destroy()
  }
}

const create = () =>
  createNodeSqliteKysely<DB>({ filename: ':memory:', camelCase: false })

describe('NodeSqliteDatabase', () => {
  test('an insert reports its changes and row id', () =>
    withDb(async (db) => {
      await db.schema
        .createTable('widget')
        .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
        .addColumn('name', 'text')
        .execute()

      const result = await db
        .insertInto('widget')
        .values({ name: 'first' })
        .executeTakeFirstOrThrow()

      assert.equal(result.numInsertedOrUpdatedRows, 1n)
      assert.equal(result.insertId, 1n)
    }))

  test('an insert with RETURNING gives the row back', () =>
    withDb(async (db) => {
      await db.schema
        .createTable('widget')
        .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
        .addColumn('name', 'text')
        .execute()

      const row = await db
        .insertInto('widget')
        .values({ name: 'second' })
        .returningAll()
        .executeTakeFirstOrThrow()

      assert.equal(row.name, 'second')
    }))

  // Kysely's SQLite introspector reads columns through a CTE over
  // pragma_table_info, so a WITH statement that is treated as a writer reports
  // every table as having no columns at all.
  test('introspection sees the columns of a table', () =>
    withDb(async (db) => {
      await db.schema
        .createTable('widget')
        .addColumn('id', 'integer', (c) => c.primaryKey())
        .addColumn('name', 'text')
        .execute()

      const [table] = await db.introspection.getTables()
      assert.equal(table?.name, 'widget')
      assert.deepEqual(
        table?.columns.map((column) => column.name),
        ['id', 'name']
      )
    }))
})
