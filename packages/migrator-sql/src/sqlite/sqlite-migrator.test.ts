import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { migrate } from '../sql-migrator.js'
import {
  SQLITE_FOREIGN_KEYS_OFF_MARKER,
  SqliteMigrationExecutor,
} from './sqlite-migrator.js'
import { splitSqliteStatements } from './sqlite-statements.js'
import type { SqliteRuntime } from './sqlite-runtime.js'
import { createNodeSqliteRuntime } from './sqlite-runtime-node.js'

const MARKER = SQLITE_FOREIGN_KEYS_OFF_MARKER

/**
 * Every runtime this process can load. The two differ in exactly the way that
 * matters here: node:sqlite throws a statement's error from `exec`, bun:sqlite
 * drops it whenever anything follows, so each behaviour is proved on both.
 */
const runtimes: Array<[string, SqliteRuntime]> = []
if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
  runtimes.push([
    'bun:sqlite',
    (await import('./sqlite-runtime-bun.js')).bunSqliteRuntime,
  ])
}
try {
  runtimes.push(['node:sqlite', await createNodeSqliteRuntime()])
} catch {
  // not available on this runtime
}

type Db = ReturnType<SqliteRuntime['open']>
const pragma = (db: Db) =>
  (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
    .foreign_keys
const count = (db: Db, table: string) =>
  (db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n
const names = (db: Db) =>
  (
    db.prepare('SELECT name FROM sql_migrations ORDER BY name').all() as any[]
  ).map((r) => r.name as string)

const SCHEMA = `CREATE TABLE parent (id TEXT PRIMARY KEY, n INTEGER);
CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent (id) ON DELETE CASCADE);
INSERT INTO parent VALUES ('p', 1);
INSERT INTO child VALUES ('c', 'p');`

const REBUILD = `${MARKER}
CREATE TABLE parent_new (id TEXT PRIMARY KEY, n INTEGER CHECK (n > 0));
INSERT INTO parent_new SELECT id, n FROM parent;
DROP TABLE parent;
ALTER TABLE parent_new RENAME TO parent;`

for (const [label, runtime] of runtimes) {
  /** A real sqlite file with `0001` applied, then `body` run with `run` for more. */
  const withFile = async (
    first: string,
    body: (
      db: Db,
      run: (name: string, sql: string) => Promise<void>
    ) => Promise<void>
  ) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-fk-'))
    const db = runtime.open(join(dir, 'app.db'))
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

  test(`${label}: a rebuild with the marker keeps cascading children, and enforcement comes back on`, async () => {
    await withFile(SCHEMA, async (db, run) => {
      assert.equal(pragma(db), 1)
      await run('0002-rebuild.sql', REBUILD)
      assert.equal(pragma(db), 1)
      assert.equal(count(db, 'child'), 1)
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
      assert.throws(() => db.exec(`INSERT INTO parent VALUES ('q', 0)`))
    })
  })

  test(`${label}: without the marker, the same rebuild cascades the children away`, async () => {
    await withFile(SCHEMA, async (db, run) => {
      await run('0002-rebuild.sql', REBUILD.replace(MARKER, ''))
      assert.equal(count(db, 'child'), 0)
    })
  })

  test(`${label}: a migration that leaves a foreign key broken is rolled back whole`, async () => {
    await withFile(SCHEMA, async (db, run) => {
      await assert.rejects(
        run(
          '0002-break.sql',
          `${MARKER}\nCREATE TABLE marker (x INTEGER);\nDELETE FROM parent;`
        ),
        /foreign keys broken/
      )
      assert.equal(pragma(db), 1)
      assert.equal(count(db, 'parent'), 1)
      assert.equal(
        db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'marker'`).all()
          .length,
        0
      )
    })
  })

  test(`${label}: a violation that was there before the migration does not block it`, async () => {
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

  test(`${label}: a rebuild that moves a pre-existing orphan's rowid is not blamed for it`, async () => {
    await withFile(SCHEMA, async (db, run) => {
      db.exec('PRAGMA foreign_keys = OFF')
      db.exec(`INSERT INTO child VALUES ('orphan', 'nobody')`)
      db.exec('PRAGMA foreign_keys = ON')
      // The copy leaves out rowid 1, so every child row moves down one.
      await run(
        '0002-rebuild.sql',
        `${MARKER}
CREATE TABLE child_new (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent (id) ON DELETE CASCADE);
INSERT INTO child_new SELECT id, parent_id FROM child ORDER BY id DESC;
DROP TABLE child;
ALTER TABLE child_new RENAME TO child;`
      )
      assert.equal(count(db, 'child'), 2)
    })
  })

  test(`${label}: a pragma that was off stays off`, async () => {
    await withFile(SCHEMA, async (db, run) => {
      db.exec('PRAGMA foreign_keys = OFF')
      await run('0002-ok.sql', `${MARKER}\nCREATE TABLE extra (x INTEGER);`)
      assert.equal(pragma(db), 0)
    })
  })

  test(`${label}: a migration that would lose an index, trigger or view only this database has is refused`, async () => {
    await withFile(SCHEMA, async (db, run) => {
      db.exec('CREATE INDEX parent_by_n ON parent (n)')
      await assert.rejects(
        run('0002-rebuild.sql', REBUILD),
        /would lose index parent_by_n/
      )
      assert.equal(count(db, 'parent'), 1)
      assert.equal(count(db, 'child'), 1)
    })
  })

  test(`${label}: a failing statement in a migration is not recorded as applied`, async () => {
    const cases: Array<[string, string]> = [
      [
        'CHECK',
        `CREATE TABLE t (n INTEGER CHECK (n > 0));\nINSERT INTO t VALUES (-1);\nCREATE TABLE after1 (x);`,
      ],
      [
        'NOT NULL',
        `CREATE TABLE t (n INTEGER NOT NULL);\nINSERT INTO t VALUES (NULL);\n`,
      ],
      [
        'UNIQUE',
        `CREATE TABLE t (n INTEGER UNIQUE);\nINSERT INTO t VALUES (1);\nINSERT INTO t VALUES (1); -- again\nCREATE TABLE after1 (x);`,
      ],
      [
        'FOREIGN KEY',
        `CREATE TABLE t (p TEXT REFERENCES parent (id));\nINSERT INTO t VALUES ('nobody');\nCREATE TABLE after1 (x);`,
      ],
    ]
    for (const [kind, sql] of cases) {
      await withFile(SCHEMA, async (db, run) => {
        await assert.rejects(run('0002-bad.sql', sql), undefined, kind)
        assert.deepEqual(names(db), ['0001-init.sql'], kind)
        assert.equal(
          db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'after1'`).all()
            .length,
          0,
          kind
        )
      })
    }
  })

  test(`${label}: a failing statement under the marker stops the migration before the DROP`, async () => {
    await withFile(
      `CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER);\nINSERT INTO t VALUES (1, -5), (2, 3);`,
      async (db, run) => {
        await assert.rejects(
          run(
            '0002-rebuild.sql',
            `${MARKER}
CREATE TABLE pikku_rebuild_t (id INTEGER PRIMARY KEY, n INTEGER CONSTRAINT t_n_min CHECK (n >= 0));
INSERT INTO pikku_rebuild_t (id, n) SELECT id, n FROM t;
DROP TABLE t;
ALTER TABLE pikku_rebuild_t RENAME TO t;`
          )
        )
        assert.equal(count(db, 't'), 2)
        assert.deepEqual(names(db), ['0001-init.sql'])
        assert.equal(
          db
            .prepare(
              `SELECT 1 FROM sqlite_master WHERE name = 'pikku_rebuild_t'`
            )
            .all().length,
          0
        )
      }
    )
  })

  test(`${label}: a backslash is an ordinary character, so ESCAPE '\\' and DEFAULT 'C:\\' do not hide a failure`, async () => {
    await withFile(
      `CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER, p TEXT DEFAULT 'C:\\');\nINSERT INTO t (id, n) VALUES (1, -5), (2, 3);`,
      async (db, run) => {
        await assert.rejects(
          run(
            '0002-rebuild.sql',
            `${MARKER}
CREATE TABLE pikku_rebuild_t (id INTEGER PRIMARY KEY, n INTEGER CHECK (n >= 0 AND 'a_b' NOT LIKE '%x\\_%' ESCAPE '\\'), p TEXT DEFAULT 'C:\\');
INSERT INTO pikku_rebuild_t (id, n, p) SELECT id, n, p FROM t;
DROP TABLE t;
ALTER TABLE pikku_rebuild_t RENAME TO t;`
          )
        )
        assert.equal(count(db, 't'), 2)
        assert.deepEqual(names(db), ['0001-init.sql'])
      }
    )
  })

  test(`${label}: a trigger with CASE ... END inside its body runs and is kept whole`, async () => {
    await withFile(
      `CREATE TABLE t (n INTEGER);
CREATE TABLE log (x INTEGER);
CREATE TRIGGER g AFTER INSERT ON t BEGIN
  INSERT INTO log VALUES (CASE WHEN new.n > 0 THEN 1 ELSE 0 END);
  UPDATE log SET x = x + CASE WHEN 1 THEN 0 END;
END;
INSERT INTO t VALUES (5);`,
      async (db) => {
        assert.equal(count(db, 'log'), 1)
        assert.equal(
          db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'g'`).all()
            .length,
          1
        )
      }
    )
  })
}

test('splitSqliteStatements keeps a trigger whole', () => {
  const parts = splitSqliteStatements(`-- c
CREATE TABLE a (x);
CREATE TRIGGER t AFTER INSERT ON a BEGIN INSERT INTO a VALUES (1); DELETE FROM a; END;
CREATE VIEW v AS SELECT 1;`)
  assert.equal(parts.length, 3)
  assert.match(parts[1]!, /^CREATE TRIGGER t[\s\S]*END;$/)
})

test('splitSqliteStatements keeps a CASE ... END inside a trigger from ending it', () => {
  const trigger = `CREATE TRIGGER g AFTER INSERT ON t BEGIN UPDATE t SET n = CASE WHEN 1 THEN 2 END; UPDATE t SET m = CASE WHEN 1 THEN (CASE WHEN 2 THEN 3 END) END; END;`
  assert.deepEqual(splitSqliteStatements(`${trigger}\nSELECT 1;`), [
    trigger,
    'SELECT 1;',
  ])
})

test('splitSqliteStatements reads a backslash as an ordinary character', () => {
  const a = `CREATE TABLE t (p TEXT DEFAULT 'C:\\');`
  const b = `CREATE TABLE u (n INTEGER CHECK (n NOT LIKE '%x\\_%' ESCAPE '\\'));`
  assert.deepEqual(splitSqliteStatements(`${a}\n${b}\nSELECT 1;`), [
    a,
    b,
    'SELECT 1;',
  ])
})

test('splitSqliteStatements does not read $x$ as a quote, and honours every identifier quote', () => {
  const parts = splitSqliteStatements(
    `SELECT $a$; SELECT "x;y", \`p;q\`, [r;s], 'it''s; ok'; SELECT $a$;`
  )
  assert.equal(parts.length, 3)
  assert.equal(parts[1], `SELECT "x;y", \`p;q\`, [r;s], 'it''s; ok';`)
})

test('splitSqliteStatements ends each statement at its last token and drops comments between', () => {
  assert.deepEqual(
    splitSqliteStatements(
      `SELECT 1; -- one\n/* two; */ SELECT 2 -- no semicolon\n`
    ),
    ['SELECT 1;', 'SELECT 2']
  )
  assert.deepEqual(splitSqliteStatements('-- only\n/* comments */\n'), [])
})

for (const [label, runtime] of runtimes) {
  test(`${label}: a virtual table over a module that is not loaded fails the migration`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-mod-'))
    const db = runtime.open(join(dir, 'app.db'))
    try {
      writeFileSync(
        join(dir, '0001-vec.sql'),
        `CREATE VIRTUAL TABLE v USING nosuchmodule(x);\n`
      )
      await assert.rejects(
        migrate(new SqliteMigrationExecutor(db), dir),
        /no such module/
      )
      assert.deepEqual(names(db), [])
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
