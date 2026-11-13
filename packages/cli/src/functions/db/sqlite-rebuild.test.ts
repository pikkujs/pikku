import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rebuiltDefinition,
  sqliteRebuildMigration,
  type TableRebuild,
} from './sqlite-rebuild.js'

const rebuild = (over: Partial<TableRebuild>): TableRebuild => ({
  table: 't',
  ddl: 'CREATE TABLE t (id TEXT PRIMARY KEY, "Qty" INTEGER NOT NULL, note TEXT)',
  columns: ['id', 'Qty', 'note'],
  drop: [],
  add: [],
  ...over,
})

test('adds a check to the column, bare or quoted, and leaves everything else', () => {
  const out = rebuiltDefinition(
    rebuild({
      add: [
        { column: 'Qty', name: 't_qty_min_check', expression: '"Qty" >= 0' },
        {
          column: 'note',
          name: 't_note_maxlength_check',
          expression: 'length("note") <= 9',
        },
      ],
    }),
    'x'
  )
  assert.deepEqual(out, {
    ddl: 'CREATE TABLE "x" (id TEXT PRIMARY KEY, "Qty" INTEGER NOT NULL constraint "t_qty_min_check" check ("Qty" >= 0), note TEXT constraint "t_note_maxlength_check" check (length("note") <= 9));',
  })
})

test('takes a named check out, whatever it quotes and nests, and keeps table-level parts', () => {
  const out = rebuiltDefinition(
    rebuild({
      ddl: `CREATE TABLE t (id TEXT, kind TEXT CONSTRAINT t_kind_enum_check CHECK (kind IN ('a)', 'b')) NOT NULL, UNIQUE (id), CHECK (id <> kind)) WITHOUT ROWID`,
      drop: [{ column: 'kind', name: 't_kind_enum_check' }],
    }),
    'x'
  )
  assert.deepEqual(out, {
    ddl: 'CREATE TABLE "x" (id TEXT, kind TEXT NOT NULL, UNIQUE (id), CHECK (id <> kind)) WITHOUT ROWID;',
  })
})

test('says so when the check is not where it was expected', () => {
  const out = rebuiltDefinition(
    rebuild({ drop: [{ column: 'note', name: 'gone_check' }] }),
    'x'
  )
  assert.ok('problem' in out)
})

test('the migration drops views and triggers first and puts them back last, in order', () => {
  const result = sqliteRebuildMigration(
    [rebuild({ add: [{ column: 'Qty', name: 'c', expression: '"Qty" > 0' }] })],
    [
      { type: 'table', name: 't', tbl_name: 't', sql: 'CREATE TABLE t (id)' },
      {
        type: 'index',
        name: 'i',
        tbl_name: 't',
        sql: 'CREATE INDEX i ON t (id)',
      },
      {
        type: 'view',
        name: 'v',
        tbl_name: 'v',
        sql: 'CREATE VIEW v AS SELECT id FROM t',
      },
      {
        type: 'trigger',
        name: 'g',
        tbl_name: 't',
        sql: 'CREATE TRIGGER g AFTER INSERT ON t BEGIN SELECT 1; END',
      },
    ]
  )
  assert.ok('sql' in result)
  const lines = (result as { sql: string }).sql.split('\n')
  assert.match(lines[0]!, /^-- pikku:destructive rebuilds "t"/)
  assert.equal(lines[1], '-- pikku:foreign-keys-off')
  assert.deepEqual(lines.slice(2, 4), ['DROP TRIGGER "g";', 'DROP VIEW "v";'])
  assert.match(lines[4]!, /^CREATE TABLE "pikku_rebuild_t"/)
  assert.deepEqual(lines.slice(-4), [
    'ALTER TABLE "pikku_rebuild_t" RENAME TO "t";',
    'CREATE INDEX i ON t (id);',
    'CREATE VIEW v AS SELECT id FROM t;',
    'CREATE TRIGGER g AFTER INSERT ON t BEGIN SELECT 1; END;',
  ])
})
