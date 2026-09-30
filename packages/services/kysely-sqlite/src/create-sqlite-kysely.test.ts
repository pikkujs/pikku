import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql, type SqliteDatabase, type SqliteStatement } from 'kysely'
import { createSQLiteKysely, createCoercionPlugin } from './index.js'

class StubStatement implements SqliteStatement {
  readonly reader = true

  constructor(private readonly rows: unknown[]) {}

  all(): unknown[] {
    return this.rows
  }

  run() {
    return { changes: 0, lastInsertRowid: 0 }
  }

  *iterate(): IterableIterator<unknown> {
    yield* this.rows
  }
}

const stubDatabase = (rows: unknown[]): SqliteDatabase => ({
  close: () => {},
  prepare: () => new StubStatement(rows),
})

describe('createSQLiteKysely', () => {
  test('leaves an integer bool column alone when no plugin is passed', async () => {
    const db = createSQLiteKysely(stubDatabase([{ active: 1 }]))
    const { rows } = await sql`select active from garment`.execute(db)
    assert.equal(rows[0]!.active, 1)
    await db.destroy()
  })

  test('applies a coercion plugin passed through options', async () => {
    const db = createSQLiteKysely(stubDatabase([{ active: 1 }]), {
      plugins: [createCoercionPlugin({ map: { garment: { active: 'bool' } } })],
    })
    const { rows } = await sql`select active from garment`.execute(db)
    assert.equal(rows[0]!.active, true)
    await db.destroy()
  })

  test('still deserializes json with a coercion plugin layered on', async () => {
    const db = createSQLiteKysely(stubDatabase([{ sizes: '["S","M"]' }]), {
      plugins: [createCoercionPlugin({ map: { garment: { sizes: 'json' } } })],
    })
    const { rows } = await sql`select sizes from garment`.execute(db)
    assert.deepEqual(rows[0]!.sizes, ['S', 'M'])
    await db.destroy()
  })
})
