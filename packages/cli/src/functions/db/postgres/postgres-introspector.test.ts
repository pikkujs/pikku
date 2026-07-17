import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PostgresIntrospector,
  type QueryClient,
} from './postgres-introspector.js'
import { generateSchemaTypes } from '../db-codegen.js'

interface PgColumnRow {
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: string
  column_default: string | null
  is_generated: string
  is_pk: boolean
}

function row(
  partial: Partial<PgColumnRow> & { column_name: string }
): PgColumnRow {
  return {
    data_type: 'text',
    udt_name: 'text',
    is_nullable: 'YES',
    column_default: null,
    is_generated: 'NEVER',
    is_pk: false,
    ...partial,
  }
}

function fakeClient(rows: PgColumnRow[]) {
  return {
    async query<T = unknown>(): Promise<{ rows: T[] }> {
      return { rows: rows as unknown as T[] }
    },
    async end(): Promise<void> {},
  }
}

test('getColumns captures the element type of a text[] array column', async () => {
  const client = fakeClient([
    row({ column_name: 'tags', data_type: 'ARRAY', udt_name: '_text' }),
  ])
  const cols = await new PostgresIntrospector(client).getColumns(
    'public.widget'
  )
  assert.equal(cols[0]!.type, 'text[]')
})

test('getColumns captures the element type of an integer[] array column', async () => {
  const client = fakeClient([
    row({ column_name: 'scores', data_type: 'ARRAY', udt_name: '_int4' }),
  ])
  const cols = await new PostgresIntrospector(client).getColumns('widget')
  assert.equal(cols[0]!.type, 'int4[]')
})

test('getColumns leaves scalar column types unchanged', async () => {
  const client = fakeClient([
    row({ column_name: 'name', data_type: 'text', udt_name: 'text' }),
  ])
  const cols = await new PostgresIntrospector(client).getColumns('widget')
  assert.equal(cols[0]!.type, 'text')
})

interface TrackingClient extends QueryClient {
  stats: { maxConcurrent: number; total: number }
}

/**
 * A fake node-postgres `Client` that mimics a single physical connection: it
 * records how many queries are in flight at once (`maxConcurrent`) and the total
 * number of round-trips. Overlapping `query()` calls — the bug this guards
 * against — push `maxConcurrent` above 1.
 */
function makeTrackingClient(tableCount: number): TrackingClient {
  const tables = Array.from({ length: tableCount }, (_, i) => `table_${i}`)
  let active = 0
  const stats = { maxConcurrent: 0, total: 0 }

  const columnRow = (table: string) => [
    {
      table_schema: 'public',
      table_name: table,
      column_name: 'id',
      data_type: 'integer',
      udt_name: 'int4',
      is_nullable: 'NO',
      column_default: `nextval('${table}_id_seq'::regclass)`,
      is_generated: 'NEVER',
      is_pk: true,
    },
    {
      table_schema: 'public',
      table_name: table,
      column_name: 'name',
      data_type: 'text',
      udt_name: 'text',
      is_nullable: 'YES',
      column_default: null,
      is_generated: 'NEVER',
      is_pk: false,
    },
    {
      table_schema: 'public',
      table_name: table,
      column_name: 'created_at',
      data_type: 'timestamp without time zone',
      udt_name: 'timestamp',
      is_nullable: 'NO',
      column_default: 'now()',
      is_generated: 'NEVER',
      is_pk: false,
    },
  ]

  const rowsFor = (sql: string, params?: unknown[]): unknown[] => {
    const s = sql.replace(/\s+/g, ' ')
    if (s.includes('referential_constraints')) return []
    if (s.includes('information_schema.columns')) {
      if (params && params.length) {
        const table = params[0] as string
        return columnRow(table)
      }
      return tables.flatMap((t) => columnRow(t))
    }
    if (s.includes('pg_enum')) return []
    if (s.includes('information_schema.tables')) {
      return tables.map((t) => ({ table_schema: 'public', table_name: t }))
    }
    return []
  }

  async function query<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }> {
    stats.total++
    active++
    stats.maxConcurrent = Math.max(stats.maxConcurrent, active)
    await new Promise((resolve) => setImmediate(resolve))
    active--
    return { rows: rowsFor(sql, params) as T[] }
  }

  return { query, end: async () => {}, stats }
}

async function introspect(client: QueryClient) {
  const dir = mkdtempSync(join(tmpdir(), 'pg-introspect-'))
  const introspector = new PostgresIntrospector(client)
  await introspector.connect()
  try {
    return await generateSchemaTypes(introspector, {
      outFile: join(dir, 'schema.gen.ts'),
      coercionFile: join(dir, 'coercion.gen.ts'),
      schemaJsonFile: join(dir, 'schema.gen.json'),
      dialect: 'postgres',
    })
  } finally {
    await introspector.close()
  }
}

test('introspection never overlaps queries on a single connection', async () => {
  const client = makeTrackingClient(30)
  const result = await introspect(client)
  assert.equal(result.tables.length, 30)
  assert.equal(
    client.stats.maxConcurrent,
    1,
    `expected no overlapping queries on the single Client, saw ${client.stats.maxConcurrent} concurrent`
  )
})

test('introspection query count is independent of table count', async () => {
  const small = makeTrackingClient(3)
  const large = makeTrackingClient(40)
  await introspect(small)
  await introspect(large)
  assert.equal(
    small.stats.total,
    large.stats.total,
    `expected a constant number of round-trips regardless of schema size, ` +
      `got ${small.stats.total} for 3 tables vs ${large.stats.total} for 40`
  )
})
