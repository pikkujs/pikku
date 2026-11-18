import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { generateSchemaTypes } from './db-codegen.js'
import { typeFamilyOf } from './column-family.js'
import { PostgresIntrospector } from './postgres/postgres-introspector.js'

const generated = async (
  create: string,
  annotations?: Record<string, Record<string, Record<string, unknown>>>
) => {
  const pg = new PGlite()
  await pg.exec(create)
  const client = {
    query: async <T>(sql: string, params?: unknown[]) => ({
      rows: (await pg.query(sql, params)).rows as T[],
    }),
    end: async () => {},
  }
  const dir = mkdtempSync(join(tmpdir(), 'db-codegen-types-'))
  if (annotations) {
    mkdirSync(join(dir, 'db'), { recursive: true })
    writeFileSync(
      join(dir, 'db', 'annotations.gen.json'),
      JSON.stringify(annotations)
    )
  }
  const result = await generateSchemaTypes(new PostgresIntrospector(client), {
    outFile: join(dir, 'schema.gen.ts'),
    coercionFile: join(dir, 'coercion.gen.ts'),
    dialect: 'postgres',
    rootDir: dir,
  })
  await pg.close()
  return {
    schema: readFileSync(result.outFile, 'utf8'),
    coercion: readFileSync(result.coercionFile, 'utf8'),
  }
}

/** What a column reads as: the type inside its `Private<...>` brand. */
const field = (schema: string, name: string): string => {
  const line = new RegExp(`^  ${name}: (.*)$`, 'm').exec(schema)?.[1] ?? ''
  const read = /Private<([^>]*)>/.exec(line)?.[1] ?? 'missing'
  return /\| null/.test(
    line.split('')[0]! + line.slice(line.indexOf('') + 1, line.indexOf(','))
  )
    ? `${read} | null`
    : read
}

describe('how a postgres column reads', () => {
  const create = `
    create table ledger (
      id serial primary key,
      small smallint not null,
      big bigint not null,
      price numeric(10, 2) not null,
      ratio double precision not null,
      payload bytea not null,
      span interval not null,
      spot point not null,
      ticket bigserial not null
    );
  `

  test('an undeclared int8 and numeric read as string, bytea as Uint8Array', async () => {
    const { schema } = await generated(create)
    assert.equal(field(schema, 'big'), 'string')
    assert.equal(field(schema, 'price'), 'string')
    assert.equal(field(schema, 'payload'), 'Uint8Array')
    assert.equal(field(schema, 'ticket'), 'string')
  })

  test('integers and floats read as number, interval and point do not', async () => {
    const { schema } = await generated(create)
    assert.equal(field(schema, 'id'), 'number')
    assert.equal(field(schema, 'small'), 'number')
    assert.equal(field(schema, 'ratio'), 'number')
    assert.equal(field(schema, 'span'), 'string')
    assert.equal(field(schema, 'spot'), 'string')
  })
})

describe('a column declared bigint', () => {
  const create =
    'create table ledger (id serial primary key, big bigint not null, other bigint);'

  test('reads as number and is range-checked at runtime', async () => {
    const { schema, coercion } = await generated(create, {
      ledger: { big: { kind: 'bigint' } },
    })
    assert.equal(field(schema, 'big'), 'number')
    assert.equal(field(schema, 'other'), 'string | null')
    assert.match(coercion, /"big": "bigint"/)
    assert.doesNotMatch(coercion, /"other"/)
  })
})

describe('typeFamilyOf', () => {
  test('matches whole words', () => {
    assert.equal(typeFamilyOf('interval interval'), 'interval')
    assert.equal(typeFamilyOf('point point'), undefined)
    assert.equal(typeFamilyOf('serial'), 'integer')
    assert.equal(typeFamilyOf('bigint int8'), 'bigint')
    assert.equal(typeFamilyOf('numeric numeric'), 'decimal')
    assert.equal(typeFamilyOf('DECIMAL(10,2)'), 'decimal')
    assert.equal(typeFamilyOf('bytea bytea'), 'bytea')
    assert.equal(typeFamilyOf('BLOB'), 'bytea')
    assert.equal(typeFamilyOf('int unsigned'), 'integer')
  })
})

describe('a column declared input: false', () => {
  const create =
    'create table ledger (id serial primary key, name text not null, stamped timestamp);'

  test('reads as usual and accepts no insert or update, in the Kysely types', async () => {
    const { schema } = await generated(create, {
      ledger: { name: { input: false }, stamped: { input: false } },
    })
    assert.match(schema, /name: ColumnType<Private<string>, never, never>/)
    assert.match(
      schema,
      /stamped: ColumnType<Private<Date> \| null, never, never>/
    )
    assert.match(
      schema,
      /id: ColumnType<Private<number>, number \| undefined, number>/
    )
  })
})
