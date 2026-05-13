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
import { DatabaseSync } from 'node:sqlite'

import {
  resolveLocalDb,
  migrateAndCodegen,
  seed as runSeed,
  reset as runReset,
} from './local-db.js'
import { MigrationDriftError } from './sql-migrator.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-db-test-'))
  mkdirSync(join(root, 'db', 'migrations'), { recursive: true })
  mkdirSync(join(root, '.pikku'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'migrations', '0001-init.sql'),
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

test('resolveLocalDb returns null when config is undefined', () => {
  assert.equal(resolveLocalDb(undefined, root), null)
})

test('migrateAndCodegen applies pending migrations and writes schema.d.ts', () => {
  const resolved = resolveLocalDb(true, root)!
  const { migrate, codegen } = migrateAndCodegen(resolved)

  assert.deepEqual(migrate.applied, ['0001-init.sql'])
  assert.deepEqual(migrate.skipped, [])
  assert.equal(codegen.written, true)
  assert.ok(
    codegen.tables.length >= 1,
    'expected at least one table in codegen'
  )

  const schema = readFileSync(resolved.schemaFile, 'utf8')
  assert.match(schema, /todos/i)

  const db = new DatabaseSync(resolved.dbFile)
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
})

test('migrateAndCodegen is a no-op on second run', () => {
  const resolved = resolveLocalDb(true, root)!
  migrateAndCodegen(resolved)
  const second = migrateAndCodegen(resolved)
  assert.deepEqual(second.migrate.applied, [])
  assert.deepEqual(second.migrate.skipped, ['0001-init.sql'])
  assert.equal(
    second.codegen.written,
    false,
    'codegen output should be unchanged'
  )
})

test('migrateAndCodegen throws MigrationDriftError when applied file changes', () => {
  const resolved = resolveLocalDb(true, root)!
  migrateAndCodegen(resolved)

  const migPath = join(root, 'db', 'migrations', '0001-init.sql')
  writeFileSync(migPath, readFileSync(migPath, 'utf8') + '\n-- drift\n')

  assert.throws(
    () => migrateAndCodegen(resolved),
    (err) => {
      assert.ok(
        err instanceof MigrationDriftError,
        'expected MigrationDriftError'
      )
      assert.match(err.message, /PKU-DB-DRIFT/)
      assert.match(err.message, /0001-init\.sql/)
      return true
    }
  )
})

test('seed applies db/seed.sql once migrate has run', () => {
  const resolved = resolveLocalDb(true, root)!
  migrateAndCodegen(resolved)

  const result = runSeed(resolved)
  assert.equal(result.applied, true)
  assert.ok(result.bytes > 0)

  const db = new DatabaseSync(resolved.dbFile)
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as {
      c: number
    }
    assert.equal(count.c, 2)
  } finally {
    db.close()
  }
})

test('reset wipes the dev DB so a follow-up migrate replays from scratch', () => {
  const resolved = resolveLocalDb(true, root)!
  migrateAndCodegen(resolved)
  runSeed(resolved)

  runReset(resolved, root)

  const after = migrateAndCodegen(resolved)
  assert.deepEqual(after.migrate.applied, ['0001-init.sql'])

  const db = new DatabaseSync(resolved.dbFile)
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as {
      c: number
    }
    assert.equal(count.c, 0, 'reset should leave todos empty until seed runs')
  } finally {
    db.close()
  }
})

test('reset refuses when resolved DB lives outside the project root', () => {
  const outside = mkdtempSync(join(tmpdir(), 'pikku-db-outside-'))
  const resolved = resolveLocalDb({ file: join(outside, 'evil.db') }, root)!
  assert.throws(() => runReset(resolved, root), /outside the project root/)
  rmSync(outside, { recursive: true, force: true })
})
