/**
 * `PikkuKysely` records a `db.*` span per statement on a real Postgres server,
 * the way the generated standalone entry constructs it:
 * `new PikkuKysely(logger, url, undefined, undefined, __pikkuTracing)`.
 * Skipped unless `DATABASE_URL` is set; `scripts/test-trace-adapters.sh`
 * starts one.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'kysely'
import { ConsoleLogger } from '@pikku/core/services'
import { createTrace } from '@pikku/core/trace'
import { RecordingTracer } from '@pikku/core/testing'
import { PikkuKysely } from './pikku-kysely.js'

const url = process.env.DATABASE_URL

if (!url) {
  test.skip('the PikkuKysely trace test needs DATABASE_URL', () => {})
} else {
  test('PikkuKysely on Postgres: a client span per statement under the current trace, no parameters', async () => {
    const tracer = new RecordingTracer()
    const parent = createTrace()
    const db = new PikkuKysely<any>(
      new ConsoleLogger(),
      url,
      undefined,
      undefined,
      { tracer, currentTrace: () => parent, recordSqlText: false }
    )
    try {
      await db.init()
      await sql`drop table if exists pikku_trace_probe`.execute(db.kysely)
      await sql`create table pikku_trace_probe (id serial primary key, user_name text)`.execute(
        db.kysely
      )
      tracer.spans.length = 0

      await db.kysely
        .insertInto('pikku_trace_probe')
        .values({ userName: 'hunter2' })
        .execute()
      await db.kysely.selectFrom('pikku_trace_probe').selectAll().execute()

      assert.deepEqual(
        tracer.spans.map((s) => s.name),
        ['db.insert', 'db.select']
      )
      for (const span of tracer.spans) {
        assert.equal(span.kind, 'client')
        assert.equal(span.traceId, parent.traceId)
        assert.equal(span.parentSpanId, parent.spanId)
        assert.equal(span.attributes['db.system'], 'postgresql')
        assert.equal(span.attributes['db.collection.name'], 'pikku_trace_probe')
        assert.deepEqual(span.status, { code: 'ok' })
        assert.ok(!JSON.stringify(span.attributes).includes('hunter2'))
        assert.equal(span.attributes['db.query.text'], undefined)
      }
      await sql`drop table pikku_trace_probe`.execute(db.kysely)
    } finally {
      await db.close()
    }
  })

  test('PikkuKysely on Postgres without tracing options records nothing', async () => {
    const tracer = new RecordingTracer()
    const db = new PikkuKysely<any>(new ConsoleLogger(), url)
    try {
      await sql`select 1`.execute(db.kysely)
      assert.equal(tracer.spans.length, 0)
    } finally {
      await db.close()
    }
  })
}
