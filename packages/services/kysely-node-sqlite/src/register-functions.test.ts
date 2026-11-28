import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'kysely'
import { registerSqliteFunctions } from './register-functions.js'
import { createNodeSqliteKysely } from './create-node-sqlite-kysely.js'

describe('registerSqliteFunctions', () => {
  test('makes the function callable from SQL', () => {
    const db = new DatabaseSync(':memory:')
    registerSqliteFunctions(db, {
      shout: (value) => `${String(value).toUpperCase()}!`,
    })

    const row = db.prepare(`SELECT shout('hello') AS v`).get() as { v: string }
    assert.equal(row.v, 'HELLO!')
    db.close()
  })

  test('registers as deterministic, so it is usable in an index', () => {
    const db = new DatabaseSync(':memory:')
    registerSqliteFunctions(db, { half: (n) => Number(n) / 2 })

    db.exec('CREATE TABLE t (n INTEGER)')
    // SQLite rejects non-deterministic functions in an index outright, so this
    // statement succeeding IS the assertion about how they were registered.
    db.exec('CREATE INDEX t_half ON t (half(n))')
    db.close()
  })

  test('registers every entry in the map', () => {
    const db = new DatabaseSync(':memory:')
    registerSqliteFunctions(db, { a: () => 1, b: () => 2 })

    const row = db.prepare('SELECT a() + b() AS v').get() as { v: number }
    assert.equal(row.v, 3)
    db.close()
  })

  test('createNodeSqliteKysely registers them on the connection it builds', async () => {
    const db = createNodeSqliteKysely<{ t: { id: number } }>({
      filename: ':memory:',
      functions: { double: (n) => Number(n) * 2 },
    })

    const result = await sql<{
      v: number
    }>`SELECT double(21) AS v`.execute(db)
    assert.equal(result.rows[0]!.v, 42)
    await db.destroy()
  })
})
