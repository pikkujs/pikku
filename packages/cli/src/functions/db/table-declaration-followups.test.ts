import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TablesDeclaration } from '@pikku/core/db'

import type { ColumnInfo } from './db-introspector.js'
import {
  declareOnlyProblems,
  loadTableDeclaration,
} from './table-declaration.js'

const info = (type: string, udtName?: string): ColumnInfo => ({
  name: 'c',
  type,
  notNull: false,
  pk: false,
  defaultValue: null,
  udtName,
})

const problemsFor = (
  declared: 'timestamp' | 'integer' | 'text',
  found: ColumnInfo,
  dialect = 'postgres'
) => {
  const declaration: TablesDeclaration = {
    t: { declareOnly: true, columns: { c: { type: declared } } },
  }
  return declareOnlyProblems(
    declaration,
    () => new Map([['c', found]]),
    dialect
  )
}

describe('declareOnly type families', () => {
  test('a timestamp array is not a timestamp', () => {
    assert.equal(
      problemsFor('timestamp', info('ARRAY', '_timestamp')).length,
      1
    )
  })

  test('an integer array is not an integer', () => {
    assert.equal(problemsFor('integer', info('ARRAY', '_int4')).length, 1)
  })

  test('an interval is not an integer', () => {
    assert.equal(problemsFor('integer', info('interval')).length, 1)
  })

  test('the real integer spellings still pass', () => {
    for (const type of [
      'integer',
      'int',
      'bigint',
      'smallint',
      'int4',
      'INT8',
    ]) {
      assert.deepEqual(problemsFor('integer', info(type)), [], type)
    }
    assert.deepEqual(
      problemsFor('timestamp', info('timestamp without time zone')),
      []
    )
  })
})

describe('declareOnly must be a boolean', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-declare-only-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const load = (declareOnly: string) => {
    mkdirSync(join(root, 'db'), { recursive: true })
    writeFileSync(
      join(root, 'db', 'tables.ts'),
      `export const tables = { item: { declareOnly: ${declareOnly}, columns: { id: { type: 'key', primaryKey: true } } } }\n`
    )
    return loadTableDeclaration(root)
  }

  test("declareOnly: 'true' is refused, not read as managed", async () => {
    await assert.rejects(
      () => load(`'true'`),
      /item has declareOnly "true".*must be true or false/
    )
  })

  test('true and false still load', async () => {
    assert.deepEqual(Object.keys((await load('true'))!.declareOnly), ['item'])
    assert.deepEqual(Object.keys((await load('false'))!.schema.tables), [
      'item',
    ])
  })
})
