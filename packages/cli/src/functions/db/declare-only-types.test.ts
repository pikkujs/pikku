import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { TablesDeclaration } from '@pikku/core/db'
import type { ColumnInfo } from './db-introspector.js'
import {
  annotationOf,
  declareOnlyProblems,
  parseDeclaration,
} from './table-declaration.js'

const info = (name: string, type: string, udtName?: string): ColumnInfo => ({
  name,
  type,
  udtName,
  notNull: true,
  pk: false,
  defaultValue: null,
})

const problems = (
  columns: Record<string, Record<string, unknown>>,
  actual: ColumnInfo[],
  dialect = 'postgres'
) =>
  declareOnlyProblems(
    { ledger: { declareOnly: true, columns } } as TablesDeclaration,
    () => new Map(actual.map((c) => [c.name, c])),
    dialect
  )

describe('declareOnly column types are read from the database', () => {
  test('a column with no declared type is accepted whatever it is', () => {
    assert.deepEqual(
      problems({ total: {}, price: {}, payload: {} }, [
        info('total', 'bigint', 'int8'),
        info('price', 'numeric', 'numeric'),
        info('payload', 'bytea', 'bytea'),
      ]),
      []
    )
  })

  test('a declared bigint matches an int8 and refuses an int4', () => {
    const actual = [info('total', 'bigint', 'int8')]
    assert.deepEqual(problems({ total: { type: 'bigint' } }, actual), [])
    assert.match(
      problems({ total: { type: 'integer' } }, actual)[0]!,
      /ledger\.total is bigint.*does not hold the 'integer'/
    )
    assert.match(
      problems({ total: { type: 'bigint' } }, [
        info('total', 'integer', 'int4'),
      ])[0]!,
      /does not hold the 'bigint'/
    )
  })

  test('sqlite stores every integer in 64 bits, so either declaration fits', () => {
    const actual = [info('total', 'INTEGER')]
    assert.deepEqual(
      problems({ total: { type: 'bigint' } }, actual, 'sqlite'),
      []
    )
    assert.deepEqual(
      problems({ total: { type: 'integer' } }, actual, 'sqlite'),
      []
    )
  })

  test('a numeric column is no longer a real', () => {
    assert.match(
      problems({ price: { type: 'real' } }, [
        info('price', 'numeric', 'numeric'),
      ])[0]!,
      /ledger\.price is numeric.*does not hold the 'real'/
    )
  })

  test('a tsType of number over an int8 asks for the bigint type', () => {
    assert.match(
      problems({ total: { tsType: 'number' } }, [
        info('total', 'bigint', 'int8'),
      ])[0]!,
      /reads as string, not the 'number'.*Declare type: 'bigint'/
    )
    assert.deepEqual(
      problems({ total: { type: 'bigint', tsType: 'number' } }, [
        info('total', 'bigint', 'int8'),
      ]),
      []
    )
  })

  test('a tsType of number over a numeric says to drop it', () => {
    assert.match(
      problems({ price: { tsType: 'number' } }, [
        info('price', 'numeric', 'numeric'),
      ])[0]!,
      /reads as string, not the 'number'.*Drop the tsType/
    )
  })

  test('a kind that the column cannot hold is refused', () => {
    assert.match(
      problems({ note: { kind: 'bigint' } }, [
        info('note', 'text', 'text'),
      ])[0]!,
      /does not hold the kind 'bigint'/
    )
  })

  test('a refinement tsType is not judged', () => {
    assert.deepEqual(
      problems({ tags: { tsType: "'a' | 'b'" } }, [
        info('tags', 'text', 'text'),
      ]),
      []
    )
  })
})

describe('a bigint column carries its range check', () => {
  test('type bigint becomes the bigint kind in the annotations', () => {
    assert.deepEqual(annotationOf({ type: 'bigint' }), { kind: 'bigint' })
    assert.deepEqual(annotationOf({ type: 'bigint', kind: 'bigint' }), {
      kind: 'bigint',
    })
  })

  test('a declareOnly column may omit its type, a managed one may not', () => {
    assert.doesNotThrow(() =>
      parseDeclaration(
        {
          ledger: { declareOnly: true, columns: { total: { kind: 'bigint' } } },
        },
        'tables.ts'
      )
    )
    assert.throws(
      () =>
        parseDeclaration({ ledger: { columns: { total: {} } } }, 'tables.ts'),
      /'ledger\.total' has no type/
    )
  })
})

describe('input: false in a declaration', () => {
  test('is kept in the annotations and must be false', () => {
    assert.deepEqual(annotationOf({ type: 'text', input: false }), {
      input: false,
    })
    assert.throws(
      () =>
        parseDeclaration(
          { t: { columns: { c: { type: 'text', input: true } } } },
          'tables.ts'
        ),
      /t\.c\.input must be false/
    )
  })
})
