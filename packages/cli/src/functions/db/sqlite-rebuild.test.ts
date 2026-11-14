import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from '@pikku/migrator-sql'
import {
  SqliteMigrationExecutor,
  loadSqliteRuntime,
} from '@pikku/migrator-sql/sqlite'
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

/** `init` applied to a real sqlite file, then the rebuild of `table` adding `n >= 0`. */
const rebuildOnReal = async (
  init: string,
  table: string,
  columns: string[],
  after: (db: any, error?: unknown) => void | Promise<void>,
  extra = (_db: any) => {}
) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-rebuild-real-'))
  const db = (await loadSqliteRuntime()).open(join(dir, 'app.db'))
  try {
    writeFileSync(join(dir, '0001.sql'), init)
    await migrate(new SqliteMigrationExecutor(db), dir)
    const objects = db
      .prepare(
        `select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite\\_%' escape '\\' order by rowid`
      )
      .all() as any[]
    const ddl = objects.find((o) => o.type === 'table' && o.name === table).sql
    const m = sqliteRebuildMigration(
      [
        {
          table,
          ddl,
          columns,
          drop: [],
          add: [
            { column: 'n', name: `${table}_n_min_check`, expression: 'n >= 0' },
          ],
        },
      ],
      objects
    )
    assert.ok('sql' in m, JSON.stringify(m))
    writeFileSync(join(dir, '0002.sql'), (m as { sql: string }).sql)
    extra(db)
    try {
      await migrate(new SqliteMigrationExecutor(db), dir, {
        allowDestructive: true,
      })
    } catch (error) {
      await after(db, error)
      throw error
    }
    await after(db)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('AUTOINCREMENT keeps the highest id ever handed out, so a deleted id is not reused', async () => {
  await rebuildOnReal(
    `CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER);
INSERT INTO t (n) VALUES (1), (2), (3);
DELETE FROM t WHERE id = 3;`,
    't',
    ['id', 'n'],
    (db) => {
      db.exec('INSERT INTO t (n) VALUES (9)')
      assert.equal((db.prepare('SELECT max(id) m FROM t').get() as any).m, 4)
    }
  )
})

test('an empty AUTOINCREMENT table with a used sequence keeps it too', async () => {
  await rebuildOnReal(
    `CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER);
INSERT INTO t (n) VALUES (1), (2);
DELETE FROM t;`,
    't',
    ['id', 'n'],
    (db) => {
      db.exec('INSERT INTO t (n) VALUES (9)')
      assert.equal((db.prepare('SELECT max(id) m FROM t').get() as any).m, 3)
    }
  )
})

test('rowids are kept, so an external-content FTS index still points at its rows', async () => {
  await rebuildOnReal(
    `CREATE TABLE t (code TEXT PRIMARY KEY, body TEXT, n INTEGER);
INSERT INTO t VALUES ('a', 'alpha', 1), ('b', 'beta', 2), ('c', 'gamma', 3);
DELETE FROM t WHERE code = 'a';
CREATE VIRTUAL TABLE t_fts USING fts5(body, content='t', content_rowid='rowid');
INSERT INTO t_fts (rowid, body) SELECT rowid, body FROM t;`,
    't',
    ['code', 'body', 'n'],
    (db) => {
      assert.deepEqual(
        (db.prepare('SELECT rowid FROM t ORDER BY rowid').all() as any[]).map(
          (r) => r.rowid
        ),
        [2, 3]
      )
      const hit = db
        .prepare(
          `SELECT t.code FROM t_fts JOIN t ON t.rowid = t_fts.rowid WHERE t_fts MATCH 'gamma'`
        )
        .get() as any
      assert.equal(hit.code, 'c')
    },
    () => {}
  )
})

test('WITHOUT ROWID and STRICT tables are rebuilt without a rowid to copy', async () => {
  await rebuildOnReal(
    `CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER) STRICT, WITHOUT ROWID;
INSERT INTO t VALUES ('a', 1);`,
    't',
    ['id', 'n'],
    (db) => {
      assert.equal((db.prepare('SELECT count(*) c FROM t').get() as any).c, 1)
      assert.throws(() => db.exec(`INSERT INTO t VALUES ('b', -1)`))
    }
  )
})

test('a comment after the last column does not swallow the constraint added to it', async () => {
  await rebuildOnReal(
    `CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER -- the count (see notes)
);
INSERT INTO t VALUES (1, 1);`,
    't',
    ['id', 'n'],
    (db) => {
      assert.throws(() => db.exec('INSERT INTO t VALUES (2, -1)'))
    }
  )
})

test('an index that only this database has is refused, not silently dropped', async () => {
  await assert.rejects(
    rebuildOnReal(
      `CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER);
INSERT INTO t VALUES (1, 1);`,
      't',
      ['id', 'n'],
      (db, error) => {
        assert.ok(error)
        assert.equal((db.prepare('SELECT count(*) c FROM t').get() as any).c, 1)
      },
      (db) => db.exec('CREATE INDEX only_here ON t (n)')
    ),
    /would lose index only_here/
  )
})

test('a violating row fails the migration and leaves every row in place', async () => {
  await assert.rejects(
    rebuildOnReal(
      `CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER, p TEXT DEFAULT 'C:\\');
INSERT INTO t (id, n) VALUES (1, -5), (2, 3);`,
      't',
      ['id', 'n', 'p'],
      (db, error) => {
        assert.ok(error)
        assert.equal((db.prepare('SELECT count(*) c FROM t').get() as any).c, 2)
      }
    ),
    /CHECK constraint failed/i
  )
})
