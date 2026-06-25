import { test, describe, beforeEach, afterEach } from 'node:test'
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
  parseDatabaseUrl,
  migrateAndCodegen,
  seed as runSeed,
  reset as runReset,
  createKysely,
} from './local-db.js'
import { MigrationDriftError } from './db-migrator.js'
import { loadSqliteRuntime } from './sqlite/sqlite-runtime.js'

let root: string

function usePostgresProject(options?: {
  migrationSql?: string
  seedSql?: string
}) {
  rmSync(join(root, 'db', 'sqlite'), { recursive: true, force: true })
  mkdirSync(join(root, 'db', 'postgres'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'postgres', '0001-init.sql'),
    options?.migrationSql ??
      `CREATE TABLE todos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE
);
`
  )
  if (options?.seedSql !== undefined) {
    writeFileSync(join(root, 'db', 'postgres-seed.sql'), options.seedSql)
  } else {
    writeFileSync(
      join(root, 'db', 'postgres-seed.sql'),
      `INSERT INTO todos (title, done) VALUES ('walk dog', FALSE);
INSERT INTO todos (title, done) VALUES ('buy milk', TRUE);
`
    )
  }
}

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
    join(root, 'db', 'sqlite-seed.sql'),
    `INSERT INTO todos (title, done) VALUES ('walk dog', 0);
INSERT INTO todos (title, done) VALUES ('buy milk', 1);
`
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test('resolveDb auto-detects sqlite when db/sqlite dir exists and no config', () => {
  const resolved = resolveDb({}, root, root)
  assert.ok(resolved !== null)
  assert.equal(resolved!.dialect, 'sqlite')
})

test('resolveDb throws when both postgresUrl and sqliteDb are configured', () => {
  assert.throws(
    () =>
      resolveDb(
        {
          postgresUrl: 'postgres://user:pass@localhost:5432/mydb',
          sqliteDb: '.pikku-runtime/dev.db',
        },
        root,
        root
      ),
    /Configure exactly one database dialect/
  )
})

test('resolveDb returns null when no db settings and no db/sqlite dir', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'pikku-db-empty-'))
  try {
    assert.equal(resolveDb({}, emptyRoot, emptyRoot), null)
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true })
  }
})

test('resolveDb auto-detects local PGlite postgres when db/postgres exists and no config', () => {
  rmSync(join(root, 'db', 'sqlite'), { recursive: true, force: true })
  mkdirSync(join(root, 'db', 'postgres'), { recursive: true })

  const resolved = resolveDb({}, root, root)
  assert.ok(resolved !== null)
  assert.equal(resolved!.dialect, 'postgres')
  if (resolved!.dialect !== 'postgres') throw new Error('expected postgres')
  assert.equal(resolved.mode, 'pglite')
  assert.equal(resolved.pgliteDir, join(root, '.pikku-runtime', 'dev-postgres'))
})

test('resolveDb honors explicit sqliteDb even when db/postgres exists', () => {
  mkdirSync(join(root, 'db', 'postgres'), { recursive: true })

  const resolved = resolveDb(
    { sqliteDb: '.pikku-runtime/explicit.db' },
    root,
    root
  )
  assert.ok(resolved !== null)
  assert.equal(resolved!.dialect, 'sqlite')
  if (resolved!.dialect !== 'sqlite') throw new Error('expected sqlite')
  assert.equal(resolved.dbFile, join(root, '.pikku-runtime', 'explicit.db'))
})

test('resolveDb honors explicit postgresUrl over inferred local assets', () => {
  mkdirSync(join(root, 'db', 'postgres'), { recursive: true })

  const resolved = resolveDb(
    { postgresUrl: 'postgres://user:pass@localhost:5432/mydb' },
    root,
    root
  )
  assert.ok(resolved !== null)
  assert.equal(resolved!.dialect, 'postgres')
  if (resolved!.dialect !== 'postgres') throw new Error('expected postgres')
  assert.equal(resolved.mode, 'url')
  assert.equal(
    resolved.connectionString,
    'postgres://user:pass@localhost:5432/mydb'
  )
})

test('resolveDb uses custom runtimeDir for local PGlite postgres', () => {
  rmSync(join(root, 'db', 'sqlite'), { recursive: true, force: true })
  mkdirSync(join(root, 'db', 'postgres'), { recursive: true })

  const resolved = resolveDb({}, root, root, 'custom-runtime')
  assert.ok(resolved !== null)
  assert.equal(resolved!.dialect, 'postgres')
  if (resolved!.dialect !== 'postgres') throw new Error('expected postgres')
  assert.equal(resolved.runtimeDir, join(root, 'custom-runtime'))
  assert.equal(resolved.pgliteDir, join(root, 'custom-runtime', 'dev-postgres'))
})

test('migrateAndCodegen applies pending migrations and writes schema.d.ts', async () => {
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
})

test('codegen types a SQLite CHECK (col IN (…)) column as a string-literal union', async () => {
  writeFileSync(
    join(root, 'db', 'sqlite', '0002-status.sql'),
    `CREATE TABLE booking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL CHECK (status IN ('enquiry', 'reserved', 'confirmed'))
);
`
  )
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  const schema = readFileSync(resolved.schemaFile, 'utf8')
  assert.match(schema, /status:[^\n]*'enquiry' \| 'reserved' \| 'confirmed'/)

  // bare-union enums module — independent of the wrapped DB interface
  const enums = readFileSync(resolved.enumsFile, 'utf8')
  assert.match(
    enums,
    /export type BookingStatus = 'enquiry' \| 'reserved' \| 'confirmed'/
  )
})

test('migrateAndCodegen is a no-op on second run', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)
  const second = await migrateAndCodegen(resolved)
  assert.deepEqual(second.migrate.applied, [])
  assert.deepEqual(second.migrate.skipped, ['0001-init.sql'])
  assert.equal(
    second.codegen.written,
    false,
    'codegen output should be unchanged'
  )
  assert.equal(second.zod.written, false, 'zod output should be unchanged')
})

test('migrateAndCodegen throws MigrationDriftError when applied file changes', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  const migPath = join(root, 'db', 'sqlite', '0001-init.sql')
  writeFileSync(migPath, readFileSync(migPath, 'utf8') + '\n-- drift\n')

  await assert.rejects(
    () => migrateAndCodegen(resolved),
    (err: unknown) => {
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
    const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as {
      c: number
    }
    assert.equal(count.c, 2)
  } finally {
    db.close()
  }
})

test('reset wipes the dev DB so a follow-up migrate replays from scratch', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  assert.equal(resolved.dialect, 'sqlite')
  await migrateAndCodegen(resolved)
  await runSeed(resolved)

  await runReset(resolved, root)

  const after = await migrateAndCodegen(resolved)
  assert.deepEqual(after.migrate.applied, ['0001-init.sql'])

  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as {
      c: number
    }
    assert.equal(count.c, 0, 'reset should leave todos empty until seed runs')
  } finally {
    db.close()
  }
})

test('reset refuses when resolved DB lives outside the runtime directory', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'pikku-db-outside-'))
  const resolved = resolveDb(
    { sqliteDb: join(outside, 'evil.db') },
    root,
    root
  )!
  assert.equal(resolved.dialect, 'sqlite')
  await assert.rejects(
    () => runReset(resolved, root),
    /outside the runtime directory/
  )
  rmSync(outside, { recursive: true, force: true })
})

test('reset refuses in NODE_ENV=production for local Postgres too', async () => {
  usePostgresProject()
  const resolved = resolveDb({}, root, root)!
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await assert.rejects(() => runReset(resolved, root), /NODE_ENV=production/)
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }
})

test('reset refuses when resolved PGlite dir lives outside the runtime directory', async () => {
  usePostgresProject()
  const outside = mkdtempSync(join(tmpdir(), 'pikku-pg-outside-'))
  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')
  if (resolved.dialect !== 'postgres') throw new Error('expected postgres')

  await assert.rejects(
    () =>
      runReset(
        {
          ...resolved,
          pgliteDir: join(outside, 'dev-postgres'),
        },
        root
      ),
    /outside the runtime directory/
  )
  rmSync(outside, { recursive: true, force: true })
})

test('postgres PGlite seed is a no-op when the seed file is missing', async () => {
  usePostgresProject()
  rmSync(join(root, 'db', 'postgres-seed.sql'), { force: true })

  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')

  const result = await runSeed(resolved)
  assert.deepEqual(result, { applied: false, bytes: 0 })
})

test('postgres PGlite seed is a no-op when the seed file is blank', async () => {
  usePostgresProject({ seedSql: '   \n\t  ' })

  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')

  const result = await runSeed(resolved)
  assert.deepEqual(result, { applied: false, bytes: 0 })
})

test('postgres PGlite migrations support multi-statement SQL files', async () => {
  usePostgresProject({
    migrationSql: `CREATE TABLE todos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX todos_title_idx ON todos (title);
INSERT INTO todos (title, done) VALUES ('seed from migration', FALSE);
`,
    seedSql: '',
  })

  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')

  const result = await migrateAndCodegen(resolved)
  assert.deepEqual(result.migrate.applied, ['0001-init.sql'])

  const kysely = await createKysely<{ todos: { title: string } }>(resolved)
  try {
    const rows = await kysely.selectFrom('todos').select('title').execute()
    assert.deepEqual(rows, [{ title: 'seed from migration' }])
  } finally {
    await kysely.destroy()
  }
})

test('postgres PGlite migrate, seed, createKysely, and reset work end-to-end', async () => {
  usePostgresProject()

  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')
  assert.equal(resolved.mode, 'pglite')

  const first = await migrateAndCodegen(resolved)
  assert.deepEqual(first.migrate.applied, ['0001-init.sql'])
  assert.equal(first.codegen.written, true)
  assert.equal(first.zod.written, true)

  const seedResult = await runSeed(resolved)
  assert.equal(seedResult.applied, true)

  const kysely = await createKysely<{
    todos: { title: string; done: boolean }
  }>(resolved)
  try {
    const rows = await kysely.selectFrom('todos').selectAll().execute()
    assert.equal(rows.length, 2)
  } finally {
    await kysely.destroy()
  }

  await runReset(resolved, root)

  const after = await migrateAndCodegen(resolved)
  assert.deepEqual(after.migrate.applied, ['0001-init.sql'])

  const freshKysely = await createKysely<{
    todos: { title: string; done: boolean }
  }>(resolved)
  try {
    const rows = await freshKysely.selectFrom('todos').selectAll().execute()
    assert.equal(rows.length, 0)
  } finally {
    await freshKysely.destroy()
  }
})

describe('parseDatabaseUrl', () => {
  test('postgres URL sets postgresUrl', () => {
    const url = 'postgres://user:pass@localhost:5432/mydb'
    assert.deepEqual(parseDatabaseUrl(url), { postgresUrl: url })
  })

  test('postgresql:// variant also sets postgresUrl', () => {
    const url = 'postgresql://user:pass@localhost:5432/mydb'
    assert.deepEqual(parseDatabaseUrl(url), { postgresUrl: url })
  })

  test('libsql URL returns empty object (remote, CLI does not handle it)', () => {
    assert.deepEqual(parseDatabaseUrl('libsql://db.turso.io?authToken=abc'), {})
  })

  test('https URL returns empty object (remote, CLI does not handle it)', () => {
    assert.deepEqual(parseDatabaseUrl('https://db.turso.io'), {})
  })

  test('http URL returns empty object', () => {
    assert.deepEqual(parseDatabaseUrl('http://localhost:8080'), {})
  })

  test('bare file path sets sqliteDb', () => {
    assert.deepEqual(parseDatabaseUrl('.pikku-runtime/dev.db'), {
      sqliteDb: '.pikku-runtime/dev.db',
    })
  })

  test('absolute file path sets sqliteDb', () => {
    assert.deepEqual(parseDatabaseUrl('/var/data/dev.db'), {
      sqliteDb: '/var/data/dev.db',
    })
  })
})
