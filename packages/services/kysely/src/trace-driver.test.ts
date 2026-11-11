import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect, sql, type Generated } from 'kysely'
import { addFunction, runPikkuFunc } from '@pikku/core/function'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { createTrace } from '@pikku/core/trace'
import type { Span, TraceContext, Tracer } from '@pikku/core/trace'
import { RecordingTracer } from '@pikku/core/testing'

import { traceDialect, SQL_TEXT_LIMIT } from './trace-driver.js'
import { collectTableNames } from './table-names.js'

interface TestDB {
  todos: { id: Generated<number>; title: string; secret: string | null }
  tags: { todoId: number; name: string }
}

const open: Kysely<TestDB>[] = []
afterEach(async () => {
  for (const db of open.splice(0)) await db.destroy()
  resetPikkuState()
})

/** A tracer whose current span lives in an AsyncLocalStorage, as the standalone runtime's will. */
class ScopedTracer extends RecordingTracer implements Tracer {
  readonly storage = new AsyncLocalStorage<TraceContext>()
  runInSpan<T>(span: Span, fn: () => T): T {
    return this.storage.run(span.context, fn)
  }
}

const make = async (
  options: {
    tracer?: Tracer
    currentTrace?: () => TraceContext | undefined
    recordSqlText?: boolean
  } = {}
) => {
  const dialect = new SqliteDialect({ database: new Database(':memory:') })
  const db = new Kysely<TestDB>({
    dialect: traceDialect(dialect, { system: 'sqlite', ...options }),
  })
  open.push(db)
  await sql`create table todos (id integer primary key, title text, secret text)`.execute(
    db
  )
  await sql`create table tags (todoId integer, name text)`.execute(db)
  return db
}

const here = (trace: TraceContext) => () => trace

describe('traceDialect with real SQLite', () => {
  test('a query is a client span: operation and first table, child of the current trace', async () => {
    const tracer = new RecordingTracer()
    const parent = createTrace()
    const db = await make({ tracer, currentTrace: here(parent) })
    tracer.spans.length = 0

    await db
      .insertInto('todos')
      .values({ title: 'a', secret: 'hunter2' })
      .execute()
    await db
      .selectFrom('todos')
      .innerJoin('tags', 'tags.todoId', 'todos.id')
      .selectAll()
      .execute()
    await db.updateTable('todos').set({ title: 'b' }).execute()
    await db.deleteFrom('todos').execute()

    const names = tracer.spans.map((s) => s.name)
    assert.deepEqual(names, [
      'db.insert',
      'db.select',
      'db.update',
      'db.delete',
    ])
    for (const span of tracer.spans) {
      assert.equal(span.kind, 'client')
      assert.equal(span.traceId, parent.traceId)
      assert.equal(span.parentSpanId, parent.spanId)
      assert.notEqual(span.spanId, parent.spanId)
      assert.equal(span.attributes['db.system'], 'sqlite')
      assert.deepEqual(span.status, { code: 'ok' })
      assert.ok(span.endTimeUnixNano >= span.startTimeUnixNano)
    }
    assert.deepEqual(
      tracer.spans.map((s) => s.attributes['db.collection.name']),
      ['todos', 'todos', 'todos', 'todos']
    )
    assert.equal(tracer.spans[1]!.attributes['db.operation.name'], 'select')
  })

  test('raw sql is operation other with no table', async () => {
    const tracer = new RecordingTracer()
    const db = await make({ tracer, currentTrace: here(createTrace()) })
    tracer.spans.length = 0
    await sql`select 1`.execute(db)
    assert.equal(tracer.spans[0]!.name, 'db.other')
    assert.equal(tracer.spans[0]!.attributes['db.collection.name'], undefined)
  })

  test('sql text is absent by default and carries no parameter value', async () => {
    const tracer = new RecordingTracer()
    const db = await make({ tracer, currentTrace: here(createTrace()) })
    tracer.spans.length = 0
    await db
      .insertInto('todos')
      .values({ title: 'visible-title', secret: 'hunter2' })
      .execute()
    const json = JSON.stringify(tracer.spans, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )
    assert.equal(tracer.spans[0]!.attributes['db.query.text'], undefined)
    assert.ok(!json.includes('hunter2') && !json.includes('visible-title'))
  })

  test('with recordSqlText the text has placeholders, never values, and literals are masked', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    await db
      .insertInto('todos')
      .values({ title: 'visible-title', secret: 'hunter2' })
      .execute()
    await db
      .selectFrom('todos')
      .selectAll()
      .where(sql<boolean>`title = ${sql.lit('inline-literal')}`)
      .execute()
    const [insert, select] = tracer.spans
    assert.match(
      String(insert!.attributes['db.query.text']),
      /^insert into "todos" .* values \(\?, \?\)/
    )
    assert.ok(!String(insert!.attributes['db.query.text']).includes('hunter2'))
    const text = String(select!.attributes['db.query.text'])
    assert.ok(!text.includes('inline-literal'), text)
    assert.match(text, /title = \?/)
  })

  test('sql text is capped at 1024 characters', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const columns = Array.from({ length: 400 }, (_, i) => `1 as c${i}`).join(
      ', '
    )
    await sql.raw(`select ${columns}`).execute(db)
    const text = String(tracer.spans[0]!.attributes['db.query.text'])
    assert.equal(text.length, SQL_TEXT_LIMIT)
  })

  test('an error ends the span with exception.type only, never the message or values', async () => {
    const tracer = new RecordingTracer()
    const db = await make({ tracer, currentTrace: here(createTrace()) })
    tracer.spans.length = 0
    await assert.rejects(
      db
        .selectFrom('missing_table' as never)
        .selectAll()
        .execute(),
      /missing_table/
    )
    const [span] = tracer.spans
    assert.equal(span!.status.code, 'error')
    assert.ok(!/missing_table/.test(span!.status.message ?? ''))
    const event = span!.events!.find((e) => e.name === 'exception')!
    assert.deepEqual(Object.keys(event.attributes!), ['exception.type'])
    assert.equal(event.attributes!['exception.type'], 'SqliteError')
    assert.equal(span!.status.message, 'SqliteError: ')
    assert.ok(!span!.attributes['exception.message'])
  })

  test('no current trace records no span (never a wrong parent); unsampled records none', async () => {
    const tracer = new RecordingTracer()
    let trace: TraceContext | undefined
    const db = await make({ tracer, currentTrace: () => trace })
    tracer.spans.length = 0
    await sql`select 1`.execute(db)
    assert.equal(tracer.spans.length, 0)
    trace = { ...createTrace(), sampled: false }
    await sql`select 1`.execute(db)
    assert.equal(tracer.spans.length, 0)
    trace = createTrace()
    await sql`select 1`.execute(db)
    assert.equal(tracer.spans.length, 1)
  })

  test('no tracer, or no currentTrace: a pass-through that records nothing', async () => {
    const tracer = new RecordingTracer()
    const a = await make({ currentTrace: here(createTrace()) })
    const b = await make({ tracer })
    await sql`select 1`.execute(a)
    await sql`select 1`.execute(b)
    assert.equal(tracer.spans.length, 0)
  })

  test('a tracer that throws never breaks the query and is switched off', async () => {
    let starts = 0
    const tracer: Tracer = {
      startSpan: () => {
        starts++
        throw new Error('tracer down')
      },
    }
    const db = await make({ tracer, currentTrace: here(createTrace()) })
    const rows = await sql<{ one: number }>`select 1 as one`.execute(db)
    assert.equal(rows.rows[0]!.one, 1)
    await sql`select 1`.execute(db)
    assert.equal(starts, 1)
  })

  test('transactions work, queries inside are spanned, begin/commit are not', async () => {
    const tracer = new RecordingTracer()
    const db = await make({ tracer, currentTrace: here(createTrace()) })
    tracer.spans.length = 0
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('todos')
        .values({ title: 't', secret: null })
        .execute()
    })
    assert.deepEqual(
      tracer.spans.map((s) => s.name),
      ['db.insert']
    )
    const rows = await db.selectFrom('todos').selectAll().execute()
    assert.equal(rows.length, 1)
  })
})

describe('collectTableNames', () => {
  test('does not read inside parameter values', () => {
    const decoy = {
      kind: 'TableNode',
      table: { identifier: { name: 'decoy' } },
    }
    const out = new Set<string>()
    collectTableNames(
      {
        kind: 'SelectQueryNode',
        from: { kind: 'TableNode', table: { identifier: { name: 'real' } } },
        where: { kind: 'ValueNode', value: decoy },
      },
      out
    )
    assert.deepEqual([...out], ['real'])
  })
})

describe('end to end through the function runner (verifier style)', () => {
  test('the db span is a child of the function span, in the same trace', async () => {
    const tracer = new ScopedTracer()
    const db = await make({
      tracer,
      currentTrace: () => tracer.storage.getStore(),
    })
    tracer.spans.length = 0

    const funcName = 'listTodos'
    addFunction(funcName, {
      func: async () => {
        await db
          .insertInto('todos')
          .values({ title: 'x', secret: null })
          .execute()
        // concurrent work keeps its own context
        await Promise.all([
          db.selectFrom('todos').selectAll().execute(),
          db.selectFrom('tags').selectAll().execute(),
        ])
        return 'done'
      },
    } as any)
    pikkuState(null, 'function', 'meta')[funcName] = {
      pikkuFuncId: funcName,
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    } as any

    const trace = createTrace()
    const services = {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      tracer,
    } as any
    const result = await runPikkuFunc('rpc', 'wire-1', funcName, {
      singletonServices: services,
      getAllServices: () => services,
      data: () => ({}),
      auth: false,
      wire: { trace },
    } as any)
    assert.equal(result, 'done')

    const fn = tracer.spans.find((s) => s.name === funcName)!
    const dbSpans = tracer.spans.filter((s) => s.name.startsWith('db.'))
    assert.equal(fn.spanId, trace.spanId)
    assert.equal(dbSpans.length, 3)
    for (const span of dbSpans) {
      assert.equal(span.parentSpanId, fn.spanId)
      assert.equal(span.traceId, fn.traceId)
      assert.equal(span.kind, 'client')
    }
    assert.deepEqual(
      dbSpans
        .map((s) => s.attributes['db.collection.name'])
        .sort((a, b) => String(a).localeCompare(String(b))),
      ['tags', 'todos', 'todos']
    )

    // outside the function there is no current span: no span, no wrong parent
    tracer.spans.length = 0
    await sql`select 1`.execute(db)
    assert.equal(tracer.spans.length, 0)
  })
})
