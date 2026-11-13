import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { migrate } from '../sql-migrator.js'
import {
  SQLITE_FOREIGN_KEYS_OFF_MARKER,
  SqliteMigrationExecutor,
  splitSqliteStatements,
} from './sqlite-migrator.js'
import { loadSqliteRuntime } from './sqlite-runtime.js'

const MARKER = SQLITE_FOREIGN_KEYS_OFF_MARKER

/** A real sqlite file with `0001` applied, then `body` run with the migrations dir. */
const withFile = async (
  first: string,
  body: (
    db: Awaited<ReturnType<typeof open>>,
    run: (name: string, sql: string) => Promise<void>
  ) => Promise<void>
) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-fk-'))
  const db = await open(join(dir, 'app.db'))
  const run = async (name: string, sql: string) => {
    writeFileSync(join(dir, name), sql)
    await migrate(new SqliteMigrationExecutor(db), dir)
  }
  try {
    await run('0001-init.sql', first)
    await body(db, run)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const open = async (file: string) => (await loadSqliteRuntime()).open(file)
const pragma = (db: Awaited<ReturnType<typeof open>>) =>
  (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
    .foreign_keys

const SCHEMA = `CREATE TABLE parent (id TEXT PRIMARY KEY, n INTEGER);
CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent (id) ON DELETE CASCADE);
INSERT INTO parent VALUES ('p', 1);
INSERT INTO child VALUES ('c', 'p');`

const REBUILD = `${MARKER}
CREATE TABLE parent_new (id TEXT PRIMARY KEY, n INTEGER CHECK (n > 0));
INSERT INTO parent_new SELECT id, n FROM parent;
DROP TABLE parent;
ALTER TABLE parent_new RENAME TO parent;`

test('a rebuild with the marker keeps cascading children, and enforcement comes back on', async () => {
  await withFile(SCHEMA, async (db, run) => {
    assert.equal(pragma(db), 1)
    await run('0002-rebuild.sql', REBUILD)
    assert.equal(pragma(db), 1)
    assert.equal((db.prepare('SELECT count(*) n FROM child').get() as any).n, 1)
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
    assert.throws(() => db.exec(`INSERT INTO parent VALUES ('q', 0)`))
  })
})

test('without the marker, the same rebuild cascades the children away', async () => {
  await withFile(SCHEMA, async (db, run) => {
    await run('0002-rebuild.sql', REBUILD.replace(MARKER, ''))
    assert.equal((db.prepare('SELECT count(*) n FROM child').get() as any).n, 0)
  })
})

test('a migration that leaves a foreign key broken is rolled back whole', async () => {
  await withFile(SCHEMA, async (db, run) => {
    await assert.rejects(
      run(
        '0002-break.sql',
        `${MARKER}\nCREATE TABLE marker (x INTEGER);\nDELETE FROM parent;`
      ),
      /foreign keys broken/
    )
    assert.equal(pragma(db), 1)
    assert.equal(
      (db.prepare('SELECT count(*) n FROM parent').get() as any).n,
      1
    )
    assert.equal(
      db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'marker'`).all()
        .length,
      0
    )
  })
})

test('a violation that was there before the migration does not block it', async () => {
  await withFile(SCHEMA, async (db, run) => {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(`INSERT INTO child VALUES ('orphan', 'nobody')`)
    db.exec('PRAGMA foreign_keys = ON')
    await run('0002-ok.sql', `${MARKER}\nCREATE TABLE extra (x INTEGER);`)
    assert.equal(
      db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'extra'`).all()
        .length,
      1
    )
  })
})

test('a failing statement in the middle stops the migration instead of being dropped', async () => {
  await withFile(SCHEMA, async (db, run) => {
    await assert.rejects(
      run(
        '0002-fail.sql',
        `${MARKER}\nINSERT INTO nowhere VALUES (1);\nDROP TABLE parent;`
      )
    )
    assert.equal(
      (db.prepare('SELECT count(*) n FROM parent').get() as any).n,
      1
    )
  })
})

test('a pragma that was off stays off', async () => {
  await withFile(SCHEMA, async (db, run) => {
    db.exec('PRAGMA foreign_keys = OFF')
    await run('0002-ok.sql', `${MARKER}\nCREATE TABLE extra (x INTEGER);`)
    assert.equal(pragma(db), 0)
  })
})

test('splitSqliteStatements keeps a trigger whole', () => {
  const parts = splitSqliteStatements(`-- c
CREATE TABLE a (x);
CREATE TRIGGER t AFTER INSERT ON a BEGIN INSERT INTO a VALUES (1); DELETE FROM a; END;
CREATE VIEW v AS SELECT 1;`)
  assert.equal(parts.length, 3)
  assert.match(parts[1]!, /^CREATE TRIGGER t[\s\S]*END;$/)
})
