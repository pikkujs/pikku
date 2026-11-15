import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MysqlIntrospector } from './mysql-introspector.js'
import type { MysqlQueryClient } from './mysql-client.js'
import { checkFingerprint } from '../check-enums.js'

const real = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/mysql-8.4-check-clauses.json'
    ),
    'utf8'
  )
) as { rows: { name: string; clause: string }[] }

const column = (name: string, type: string) => ({
  table_name: 'item',
  column_name: name,
  column_type: type,
  is_nullable: 'YES',
  column_default: null,
  extra: '',
  column_key: name === 'id' ? 'PRI' : '',
})

/** Serves the item table of the fixture, with the check clauses a real MySQL 8.4 returned. */
const fixtureClient = (): MysqlQueryClient =>
  ({
    async query(sql: string) {
      if (/information_schema\.columns/.test(sql)) {
        return {
          rows: [
            column('id', 'int'),
            column('color', 'varchar(20)'),
            column('tricky', 'varchar(40)'),
            column('qty', 'int'),
            column('slug', 'varchar(16)'),
            column('ratio', 'double'),
          ],
        }
      }
      if (/information_schema\.check_constraints/.test(sql)) {
        return {
          rows: real.rows.map((r) => ({
            table_name: 'item',
            constraint_name: r.name,
            check_clause: r.clause,
          })),
        }
      }
      return { rows: [] }
    },
  }) as unknown as MysqlQueryClient

test('the checks a real MySQL stores come back as enum values and as the SQL Pikku writes', async () => {
  const columns = (await new MysqlIntrospector(fixtureClient()).getColumns(
    'item'
  ))!
  const byName = new Map(columns.map((c) => [c.name, c]))
  assert.deepEqual(byName.get('color')!.enumValues, ['red', 'blue'])
  assert.deepEqual(byName.get('tricky')!.enumValues, [
    "it's",
    'a,b',
    'a)b',
    '(x',
    'back\\slash',
    'say "hi"',
    'é日本',
    '',
  ])
  assert.equal(byName.get('qty')!.enumValues, undefined)
  const color = byName.get('color')!.checks!
  assert.equal(color.length, 1)
  assert.equal(color[0]!.name, 'item_color_enum_check')
  // What the migration writes, fingerprinted, is what the server read back.
  assert.equal(
    checkFingerprint(color[0]!.expression),
    checkFingerprint("`color` IN ('red', 'blue')")
  )
  assert.deepEqual(
    byName.get('qty')!.checks!.map((c) => [c.name, c.expression]),
    [
      ['item_qty_max_check', '`qty` <= 99'],
      ['item_qty_min_check', '`qty` >= 0'],
    ]
  )
})
