import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect, sql, type Generated } from 'kysely'
import { addFunction, runPikkuFunc } from '@pikku/core/function'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { createTrace, childTraceWire } from '@pikku/core/trace'
import type { Span, TraceContext, Tracer } from '@pikku/core/trace'
import { RecordingTracer, decodeTraces } from '@pikku/core/testing'
import { asContextStorage, createRuntimeTelemetry } from '@pikku/core/otlp'

import { traceDialect, SQL_TEXT_LIMIT } from './trace-driver.js'
import { collectTableNames, hasInlineSql } from './table-names.js'

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
    // sql.lit inlines the literal: such a query records no text.
    assert.equal(select!.attributes['db.query.text'], undefined)
    assert.equal(select!.attributes['db.operation.name'], 'select')
  })

  test('recordSqlText never leaks a marker from raw SQL, literals, comments or escapes', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const M = 'S3CR3T'
    const cases: Array<() => Promise<unknown>> = [
      () => sql.raw(`select 'it''s ${M}'`).execute(db),
      () => sql.raw(`select E'it\\'s ${M}'`).execute(db),
      () => sql.raw(`select 1 -- ${M}`).execute(db),
      () => sql.raw(`select 1 /* ${M} */`).execute(db),
      () =>
        sql
          .raw(`select "${M}"`)
          .execute(db)
          .catch(() => {}),
      () =>
        sql
          .raw(`select ${M}`)
          .execute(db)
          .catch(() => {}),
      () =>
        sql
          .raw(`select 'unterminated ${M}`)
          .execute(db)
          .catch(() => {}),
      () =>
        sql
          .raw(`select $x$ ${M}`)
          .execute(db)
          .catch(() => {}),
      () => sql`select ${sql.lit(M)}`.execute(db),
      () =>
        db
          .selectFrom('todos')
          .selectAll()
          .where(sql<boolean>`title = ${sql.lit(M)}`)
          .execute(),
      () =>
        db
          .selectFrom('todos')
          .selectAll()
          .where('title', '=', sql.lit(M) as never)
          .execute(),
      () =>
        db
          .selectFrom('todos')
          .select(sql.raw<string>(`'${M}'`).as('x'))
          .execute(),
      () => sql.raw(`select 1 ${' '.repeat(200000)}-- ${M}`).execute(db),
    ]
    for (const run of cases) await run().catch(() => {})
    const json = JSON.stringify(tracer.spans, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )
    assert.ok(tracer.spans.length >= cases.length)
    assert.ok(!json.includes(M), 'marker leaked into a span')
    for (const span of tracer.spans) {
      assert.equal(span.attributes['db.query.text'], undefined)
    }
  })

  test('a structured query with a bound marker records placeholders only', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    await db
      .selectFrom('todos')
      .selectAll()
      .where('title', '=', 'S3CR3T')
      .execute()
    const text = String(tracer.spans[0]!.attributes['db.query.text'])
    assert.match(text, /where "title" = \?/)
    assert.ok(!text.includes('S3CR3T'))
  })

  test('dynamic identifiers outside the safe pattern drop the text and the collection name', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const M = 'ZQX a b;--'
    const d = db as any
    const cases: Array<() => Promise<unknown>> = [
      () => d.selectFrom(M).selectAll().execute(),
      () =>
        d
          .selectFrom('todos')
          .select('id as ' + M)
          .execute(),
      () =>
        d
          .selectFrom('todos as ' + M)
          .selectAll()
          .execute(),
      () =>
        d
          .selectFrom('todos')
          .select((eb: any) => eb.fn(M, ['id']).as('x'))
          .execute(),
      () => d.insertInto(M).values({ a: 1 }).execute(),
      () => sql`select 1 from ${sql.table(M)}`.execute(db),
      () => db.schema.createTable(M).addColumn('a', 'integer').execute(),
    ]
    for (const run of cases) await run().catch(() => {})
    assert.ok(tracer.spans.length >= cases.length)
    const json = JSON.stringify(tracer.spans, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )
    assert.ok(!json.includes('ZQX'), 'identifier leaked into a span')
  })

  test('aggregate function names and other free-text node fields drop the text', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const M = 'LEAK-m@rk'
    const d = db as any
    const cases: Array<() => Promise<unknown>> = [
      () =>
        d
          .selectFrom('todos')
          .select((eb: any) => eb.fn.agg(M, ['id']).as('x'))
          .execute(),
      () =>
        d
          .selectFrom('todos')
          .select((eb: any) =>
            eb.fn
              .agg('count', ['id'])
              .over((ob: any) => ob.partitionBy(M))
              .as('x')
          )
          .execute(),
      () => d.selectFrom('todos').selectAll().where('id', M, 1).execute(),
      () => d.selectFrom('todos').selectAll().collate?.(M),
      () =>
        d
          .selectFrom('todos')
          .select(sql`cast(id as ${sql.raw(M)})`.as('x'))
          .execute(),
      () => d.selectFrom('todos').selectAll().modifyEnd(sql.raw(M)).execute(),
      () => d.selectFrom('todos').selectAll().orderBy('id', M).execute(),
      () => d.selectFrom('todos').selectAll().innerJoin(M, 'a', 'b').execute(),
      () => d.selectFrom('todos').selectAll().orderBy(M).execute(),
      () => d.selectFrom('todos').select(M).execute(),
      () => d.selectFrom('todos').select(`todos.${M}`).execute(),
      () => d.selectFrom('todos').select(`${M}.id`).execute(),
      () =>
        d
          .insertInto('todos')
          .values({ [M]: 1 })
          .execute(),
      () =>
        d
          .updateTable('todos')
          .set({ [M]: 1 })
          .execute(),
      () =>
        d
          .insertInto('todos')
          .values({ title: 'a' })
          .onConflict((oc: any) => oc.column(M).doNothing())
          .execute(),
    ]
    for (const run of cases) await (async () => run())().catch(() => {})
    const json = JSON.stringify(tracer.spans, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )
    assert.ok(tracer.spans.length >= 10)
    assert.ok(!json.includes('LEAK-m@rk'), 'marker leaked into a span')
  })

  test('ordinary orderBy direction, is null and set operations keep their text', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const todos = () => db.selectFrom('todos').select('id')
    await todos().orderBy('id', 'desc').execute()
    await todos().orderBy('id', 'asc').execute()
    await todos()
      .orderBy(
        (eb) => eb.ref('id'),
        (ob) => ob.desc().nullsLast()
      )
      .execute()
    await todos().where('secret', 'is', null).execute()
    await todos().where('secret', 'is not', null).execute()
    for (const op of [
      'union',
      'unionAll',
      'intersect',
      'intersectAll',
      'except',
      'exceptAll',
    ] as const) {
      await (todos() as any)
        [op](todos())
        .execute()
        .catch(() => {})
    }
    assert.ok(tracer.spans.length >= 11)
    for (const span of tracer.spans) {
      assert.equal(typeof span.attributes['db.query.text'], 'string', span.name)
    }
  })

  test('a raw order direction and a non-null immediate value stay dropped', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const M = 'LEAK-dir'
    const d = db as any
    await d
      .selectFrom('todos')
      .select('id')
      .orderBy('id', sql.raw(M))
      .execute()
      .catch(() => {})
    await d
      .selectFrom('todos')
      .select('id')
      .orderBy('id', sql.raw('desc, ' + M))
      .execute()
      .catch(() => {})
    await d
      .selectFrom('todos')
      .select('id')
      .where('title', '=', sql.lit(M))
      .execute()
    await d
      .selectFrom('todos')
      .select('id')
      .where('title', '=', sql.lit(7))
      .execute()
    assert.equal(tracer.spans.length, 4)
    const json = JSON.stringify(tracer.spans, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )
    assert.ok(!json.includes(M))
    for (const span of tracer.spans)
      assert.equal(span.attributes['db.query.text'], undefined)
  })

  test('hasInlineSql fails closed on an unknown kind or unclassified string field', () => {
    assert.equal(hasInlineSql({ kind: 'MysteryNode' }), true)
    assert.equal(
      hasInlineSql({ kind: 'AggregateFunctionNode', func: 'a b' }),
      true
    )
    assert.equal(
      hasInlineSql({ kind: 'AggregateFunctionNode', func: 'count' }),
      false
    )
    assert.equal(hasInlineSql({ kind: 'OperatorNode', operator: 'x y' }), true)
    assert.equal(hasInlineSql({ kind: 'OperatorNode', operator: '=' }), false)
    assert.equal(
      hasInlineSql({ kind: 'DataTypeNode', dataType: 'varchar(20)' }),
      false
    )
    assert.equal(hasInlineSql({ kind: 'DataTypeNode', dataType: 'evil' }), true)
    assert.equal(
      hasInlineSql({ kind: 'OrActionNode', action: 'ignore' }),
      false
    )
    assert.equal(hasInlineSql({ kind: 'OrActionNode', action: 'zz' }), true)
    assert.equal(
      hasInlineSql({ kind: 'JoinNode', joinType: 'LeftJoin' }),
      false
    )
    assert.equal(hasInlineSql({ kind: 'JoinNode', joinType: 'nope' }), true)
  })

  test('a pattern-conforming dynamic identifier IS recorded (documented limitation)', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    await (db as any).selectFrom('todos as ZQXMARK9').selectAll().execute()
    assert.match(
      String(tracer.spans[0]!.attributes['db.query.text']),
      /ZQXMARK9/
    )
  })

  test('hasInlineSql flags raw, immediate and json-path nodes (postgres-shaped cases)', () => {
    assert.equal(hasInlineSql({ kind: 'RawNode' }), true)
    assert.equal(
      hasInlineSql({
        kind: 'SelectQueryNode',
        where: [{ kind: 'ValueNode', immediate: true }],
      }),
      true
    )
    assert.equal(
      hasInlineSql({ kind: 'SelectQueryNode', x: { kind: 'JSONPathLegNode' } }),
      true
    )
    assert.equal(
      hasInlineSql({
        kind: 'SelectQueryNode',
        x: [{ kind: 'ValueNode', value: 'a' }],
      }),
      false
    )
  })

  test('sql text is capped at 1024 characters', async () => {
    const tracer = new RecordingTracer()
    const db = await make({
      tracer,
      currentTrace: here(createTrace()),
      recordSqlText: true,
    })
    tracer.spans.length = 0
    const columns = Array.from({ length: 400 }, (_, i) => `id as c${i}`)
    await db
      .selectFrom('todos')
      .select(columns as never)
      .execute()
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
    assert.equal(span!.status.message, 'SqliteError')
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

describe('parallel invocations', () => {
  test('40 concurrent functions with nested rpc and queries keep their own parents', async () => {
    const tracer = new ScopedTracer()
    const db = await make({
      tracer,
      currentTrace: () => tracer.storage.getStore(),
    })
    tracer.spans.length = 0
    const services: any = {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      tracer,
    }
    const call = (name: string, wire: any) =>
      runPikkuFunc('rpc', 'w-' + name, name, {
        singletonServices: services,
        getAllServices: () => services,
        data: () => ({}),
        auth: false,
        wire,
      } as any)
    const reg = (name: string, func: any) => {
      addFunction(name, { func } as any)
      pikkuState(null, 'function', 'meta')[name] = {
        pikkuFuncId: name,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      } as any
    }
    reg('conc-inner', async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5))
      await db.insertInto('tags').values({ todoId: 1, name: 'x' }).execute()
      return 'i'
    })
    reg('conc-outer', async (_s: any, _d: any, wire: any) => {
      await new Promise((r) => setTimeout(r, Math.random() * 5))
      await db.selectFrom('tags').selectAll().execute()
      await call('conc-inner', { trace: childTraceWire(wire.trace).trace })
      await db.transaction().execute(async (trx) => {
        await trx.selectFrom('tags').selectAll().execute()
        await new Promise((r) => setTimeout(r, 2))
        await trx.updateTable('tags').set({ name: 'y' }).execute()
      })
      await db.deleteFrom('tags').execute()
      return 'o'
    })
    const N = 40
    const traces = Array.from({ length: N }, () => createTrace())
    const results = await Promise.all(
      traces.map((trace) => call('conc-outer', { trace }))
    )
    assert.ok(results.every((r) => r === 'o'))
    const byId = new Map(tracer.spans.map((s) => [s.spanId, s]))
    const dbSpans = tracer.spans.filter((s) => s.name.startsWith('db.'))
    assert.equal(dbSpans.length, N * 5)
    for (const trace of traces) {
      const mine = dbSpans.filter((s) => s.traceId === trace.traceId)
      assert.equal(mine.length, 5)
      const outerSpan = tracer.spans.find((s) => s.spanId === trace.spanId)!
      assert.ok(
        mine.every((s) => {
          const parent = byId.get(s.parentSpanId!)
          return parent && !parent.name.startsWith('db.')
        })
      )
      assert.equal(
        mine.filter((s) => s.parentSpanId === outerSpan.spanId).length,
        4
      )
      const innerSpan = tracer.spans.find(
        (s) => s.name === 'conc-inner' && s.traceId === trace.traceId
      )!
      assert.equal(
        mine.filter((s) => s.parentSpanId === innerSpan.spanId).length,
        1
      )
    }
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

describe('through the real OtlpTracer (contextStorage + runInSpan + currentTrace)', () => {
  test('the db span is a child of the function span in the exported OTLP spans', async () => {
    const exported: Uint8Array[] = []
    const fakeFetch = (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      if (String(url).endsWith('/v1/traces')) {
        exported.push(new Uint8Array(init!.body as ArrayBuffer))
      }
      return new Response(null, { status: 200 })
    }) as typeof fetch
    const telemetry = createRuntimeTelemetry(
      { PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4318/v1/otlp' },
      {
        logger: { info() {}, warn() {}, error() {}, debug() {} } as any,
        serviceName: 'kysely-otlp-test',
        contextStorage: asContextStorage(new AsyncLocalStorage()),
        fetch: fakeFetch,
      }
    )
    assert.equal(telemetry.enabled, true)
    const db = await make({
      tracer: telemetry.tracer,
      currentTrace: telemetry.currentTrace,
    })

    const funcName = 'otlpListTodos'
    addFunction(funcName, {
      func: async () => {
        await db.selectFrom('todos').selectAll().execute()
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
      tracer: telemetry.tracer,
    } as any
    await runPikkuFunc('rpc', 'wire-1', funcName, {
      singletonServices: services,
      getAllServices: () => services,
      data: () => ({}),
      auth: false,
      wire: { trace },
    } as any)
    // outside a function: no current trace, no span
    await sql`select 1`.execute(db)
    await telemetry.close()

    const spans = exported.flatMap((body) => decodeTraces(body).items)
    const fn = spans.find((s) => s.name === funcName)
    const dbSpans = spans.filter((s) => s.name.startsWith('db.'))
    assert.ok(fn, 'function span exported')
    assert.equal(fn.spanId, trace.spanId)
    assert.equal(dbSpans.length, 1, 'only the query inside the function')
    assert.equal(dbSpans[0]!.parentSpanId, fn.spanId)
    assert.equal(dbSpans[0]!.traceId, fn.traceId)
  })
})
