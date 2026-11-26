import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Database } from 'bun:sqlite'
import { SqliteFunctionsUnsupportedError } from '@pikku/kysely-sqlite'
import { registerSqliteFunctions } from './register-functions.js'
import { createBunSqliteKysely } from './create-bun-sqlite-kysely.js'

describe('registerSqliteFunctions', () => {
  test('throws rather than silently skipping registration', () => {
    const db = new Database(':memory:')
    assert.throws(
      () => registerSqliteFunctions(db, { similarity: () => 0 }),
      SqliteFunctionsUnsupportedError
    )
    db.close()
  })

  test('names every requested function, so the error says what to port', () => {
    const db = new Database(':memory:')
    try {
      registerSqliteFunctions(db, {
        similarity: () => 0,
        levenshtein: () => 0,
      })
      assert.fail('expected a throw')
    } catch (error) {
      assert.ok(error instanceof SqliteFunctionsUnsupportedError)
      assert.deepEqual(error.functionNames, ['similarity', 'levenshtein'])
      assert.match(error.message, /similarity, levenshtein/)
      assert.match(error.message, /kysely-node-sqlite/)
    }
    db.close()
  })

  // The point of the whole change: the failure has to happen while the app is
  // wiring itself up, not on the first request that reaches a query using one.
  test('createBunSqliteKysely rejects `functions` at construction', () => {
    assert.throws(
      () =>
        createBunSqliteKysely({
          filename: ':memory:',
          functions: { similarity: () => 0 },
        }),
      SqliteFunctionsUnsupportedError
    )
  })

  test('omitting `functions` is unaffected', async () => {
    const db = createBunSqliteKysely<{ t: { id: number } }>({
      filename: ':memory:',
    })
    await db.destroy()
  })
})
