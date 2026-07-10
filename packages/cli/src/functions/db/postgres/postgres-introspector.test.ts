import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PostgresIntrospector } from './postgres-introspector.js'

interface PgColumnRow {
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: string
  column_default: string | null
  is_generated: string
  is_pk: boolean
}

function row(partial: Partial<PgColumnRow> & { column_name: string }): PgColumnRow {
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
  const cols = await new PostgresIntrospector(client).getColumns('public.widget')
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
