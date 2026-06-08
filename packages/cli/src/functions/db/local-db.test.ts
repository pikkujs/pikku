import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  resolveDb,
  migrateAndCodegen,
  seed as runSeed,
  reset as runReset,
} from './local-db.js'
import { MigrationDriftError } from './db-migrator.js'
import { loadSqliteRuntime } from './sqlite/sqlite-runtime.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-db-test-'))
  mkdirSync(join(root, 'db', 'sqlite'), { recursive: true })
  mkdirSync(join(root, '.pikku-runtime'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'sqlite', '0001-init.sql'),
    `CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
`
  )
  writeFileSync(
    join(root, 'db', 'seed.sql'),
    `INSERT INTO todos (title, done) VALUES ('walk dog', 0);
INSERT INTO todos (title, done) VALUES ('buy milk', 1);
`
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test('resolveDb returns null when config has no db settings', () => {
  assert.equal(resolveDb({}, root, root), null)
})

test(
  'migrateAndCodegen applies pending migrations and writes schema.d.ts',
  async () => {
    const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
    assert.equal(resolved.dialect, 'sqlite')
    const { migrate, codegen, zod } = await migrateAndCodegen(resolved)

    assert.deepEqual(migrate.applied, ['0001-init.sql'])
    assert.deepEqual(migrate.skipped, [])
    assert.equal(codegen.written, true)
    assert.equal(zod.written, true)
    assert.ok(
      codegen.tables.length >= 1,
      'expected at least one table in codegen'
    )

    const schema = readFileSync(resolved.schemaFile, 'utf8')
    assert.match(schema, /todos/i)
    const zodSchema = readFileSync(resolved.zodFile, 'utf8')
    assert.match(zodSchema, /export const TodosZ = z\.object\(/)
    assert.match(zodSchema, /export const TodosInsertZ = z\.object\(/)
    assert.match(zodSchema, /export const TodosPatchZ = TodosZ\.partial\(\)/)

    if (resolved.dialect !== 'sqlite') throw new Error('expected sqlite')
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
    try {
      const rows = db
        .prepare('SELECT name FROM sql_migrations ORDER BY name')
        .all() as Array<{ name: string }>
      assert.deepEqual(
        rows.map((r) => r.name),
        ['0001-init.sql']
      )
    } finally {
      db.close()
    }
  }
)

test('migrateAndCodegen is a no-op on second run', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)
  const second = await migrateAndCodegen(resolved)
  assert.deepEqual(second.migrate.applied, [])
  assert.deepEqual(second.migrate.skipped, ['0001-init.sql'])
  assert.equal(second.codegen.written, false, 'codegen output should be unchanged')
  assert.equal(second.zod.written, false, 'zod output should be unchanged')
})

test(
  'migrateAndCodegen throws MigrationDriftError when applied file changes',
  async () => {
    const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
    await migrateAndCodegen(resolved)

    const migPath = join(root, 'db', 'sqlite', '0001-init.sql')
    writeFileSync(migPath, readFileSync(migPath, 'utf8') + '\n-- drift\n')

    await assert.rejects(
      () => migrateAndCodegen(resolved),
      (err: unknown) => {
        assert.ok(err instanceof MigrationDriftError, 'expected MigrationDriftError')
        assert.match(err.message, /PKU-DB-DRIFT/)
        assert.match(err.message, /0001-init\.sql/)
        return true
      }
    )
  }
)

test('seed applies db/seed.sql once migrate has run', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  assert.equal(resolved.dialect, 'sqlite')
  await migrateAndCodegen(resolved)

  const result = await runSeed(resolved)
  assert.equal(result.applied, true)
  assert.ok(result.bytes > 0)

  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as { c: number }
    assert.equal(count.c, 2)
  } finally {
    db.close()
  }
})

test(
  'reset wipes the dev DB so a follow-up migrate replays from scratch',
  async () => {
    const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
    assert.equal(resolved.dialect, 'sqlite')
    await migrateAndCodegen(resolved)
    await runSeed(resolved)

    runReset(resolved, root)

    const after = await migrateAndCodegen(resolved)
    assert.deepEqual(after.migrate.applied, ['0001-init.sql'])

    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
    try {
      const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as { c: number }
      assert.equal(count.c, 0, 'reset should leave todos empty until seed runs')
    } finally {
      db.close()
    }
  }
)

test('reset refuses when resolved DB lives outside the runtime directory', () => {
  const outside = mkdtempSync(join(tmpdir(), 'pikku-db-outside-'))
  const resolved = resolveDb({ sqliteDb: join(outside, 'evil.db') }, root, root)!
  assert.equal(resolved.dialect, 'sqlite')
  assert.throws(() => runReset(resolved, root), /outside the runtime directory/)
  rmSync(outside, { recursive: true, force: true })
})
