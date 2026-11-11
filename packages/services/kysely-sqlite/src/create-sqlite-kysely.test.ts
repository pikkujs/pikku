import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { RecordingTracer } from '@pikku/core/testing'
import { createTrace } from '@pikku/core/trace'
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

describe('tracing', () => {
  // The statement path is the same driver the real-SQLite suites in @pikku/kysely
  // and the bun/node packages exercise; this proves the factory wires it.
  test('a query on the sqlite database is a db span', async () => {
    const tracer = new RecordingTracer()
    const parent = createTrace()
    const db = createSQLiteKysely(stubDatabase([{ id: 1 }]), {
      tracer,
      currentTrace: () => parent,
    })
    await db
      .selectFrom('workflow_runs' as never)
      .selectAll()
      .execute()
    assert.equal(tracer.spans[0]!.name, 'db.select')
    assert.equal(tracer.spans[0]!.parentSpanId, parent.spanId)
    assert.equal(tracer.spans[0]!.attributes['db.system'], 'sqlite')
  })
})
