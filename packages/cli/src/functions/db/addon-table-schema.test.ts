import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  checkForeignKeyClosure,
  diffTablesToSql,
  type TableSchema,
} from './addon-table-schema.js'
import type { ColumnInfo } from './db-introspector.js'

const col = (
  name: string,
  type: string,
  opts: Partial<ColumnInfo> = {}
): ColumnInfo => ({
  name,
  type,
  notNull: opts.notNull ?? false,
  pk: opts.pk ?? false,
  defaultValue: opts.defaultValue ?? null,
  generated: opts.generated,
})

const table = (
  name: string,
  columns: ColumnInfo[],
  foreignKeys: TableSchema['foreignKeys'] = []
): TableSchema => ({ name, columns, foreignKeys })

describe('checkForeignKeyClosure', () => {
  test('passes when every FK points at an owned table', () => {
    const tables = [
      table('post', [col('id', 'TEXT', { pk: true })], [
        { column: 'authorId', foreignTable: 'author', foreignColumn: 'id' },
      ]),
      table('author', [col('id', 'TEXT', { pk: true })]),
    ]
    const errors = checkForeignKeyClosure(tables, new Set(['post', 'author']))
    assert.deepEqual(errors, [])
  })

  test('errors when a FK points outside the owned set', () => {
    const tables = [
      table('post', [col('id', 'TEXT', { pk: true })], [
        { column: 'orgId', foreignTable: 'organization', foreignColumn: 'id' },
      ]),
    ]
    const errors = checkForeignKeyClosure(tables, new Set(['post']))
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /organization/)
    assert.match(errors[0]!, /PKU-ADDON-FK/)
  })
})

describe('diffTablesToSql — generation (empty target)', () => {
  test('emits CREATE TABLE for every owned table', () => {
    const desired = [
      table('post', [
        col('id', 'TEXT', { pk: true, notNull: true }),
        col('title', 'TEXT', { notNull: true }),
        col('views', 'INTEGER', { defaultValue: '0' }),
      ]),
    ]
    const { statements, warnings } = diffTablesToSql(desired, [], 'sqlite')
    assert.equal(statements.length, 1)
    assert.match(statements[0]!, /CREATE TABLE IF NOT EXISTS "post"/)
    assert.match(statements[0]!, /"id" TEXT NOT NULL/)
    assert.match(statements[0]!, /"views" INTEGER DEFAULT 0/)
    assert.match(statements[0]!, /PRIMARY KEY \("id"\)/)
    assert.deepEqual(warnings, [])
  })

  test('emits owned→owned FK constraints, skips generated columns', () => {
    const desired = [
      table(
        'post',
        [
          col('id', 'TEXT', { pk: true }),
          col('authorId', 'TEXT'),
          col('search', 'TEXT', { generated: true }),
        ],
        [{ column: 'authorId', foreignTable: 'author', foreignColumn: 'id' }]
      ),
    ]
    const { statements } = diffTablesToSql(
      desired,
      [],
      'postgres',
      new Set(['post', 'author'])
    )
    assert.match(
      statements[0]!,
      /FOREIGN KEY \("authorId"\) REFERENCES "author" \("id"\)/
    )
    assert.doesNotMatch(statements[0]!, /"search"/)
  })
})

describe('diffTablesToSql — incremental (existing target)', () => {
  test('adds only the missing column', () => {
    const desired = [
      table('post', [col('id', 'TEXT', { pk: true }), col('slug', 'TEXT')]),
    ]
    const existing = [table('post', [col('id', 'TEXT', { pk: true })])]
    const { statements } = diffTablesToSql(desired, existing, 'sqlite')
    assert.equal(statements.length, 1)
    assert.match(statements[0]!, /ALTER TABLE "post" ADD COLUMN "slug" TEXT/)
  })

  test('warns — never alters — on a type change', () => {
    const desired = [table('post', [col('id', 'INTEGER', { pk: true })])]
    const existing = [table('post', [col('id', 'TEXT', { pk: true })])]
    const { statements, warnings } = diffTablesToSql(desired, existing, 'sqlite')
    assert.deepEqual(statements, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /type differs/)
  })

  test('warns — never drops — on a column missing from the addon', () => {
    const desired = [table('post', [col('id', 'TEXT', { pk: true })])]
    const existing = [
      table('post', [col('id', 'TEXT', { pk: true }), col('legacy', 'TEXT')]),
    ]
    const { statements, warnings } = diffTablesToSql(desired, existing, 'sqlite')
    assert.deepEqual(statements, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /no drops/)
  })

  test('warns when adding a NOT NULL column without a default', () => {
    const desired = [
      table('post', [
        col('id', 'TEXT', { pk: true }),
        col('required', 'TEXT', { notNull: true }),
      ]),
    ]
    const existing = [table('post', [col('id', 'TEXT', { pk: true })])]
    const { statements, warnings } = diffTablesToSql(desired, existing, 'sqlite')
    assert.equal(statements.length, 1)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /NOT NULL column.*without a default/)
  })

  test('ignores trivially-equivalent type spellings', () => {
    const desired = [table('post', [col('id', '  TEXT  ', { pk: true })])]
    const existing = [table('post', [col('id', 'text', { pk: true })])]
    const { warnings } = diffTablesToSql(desired, existing, 'sqlite')
    assert.deepEqual(warnings, [])
  })
})
