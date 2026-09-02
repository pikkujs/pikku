import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'

import {
  resolveDb,
  desiredRuntimeSchema,
  type ResolvedSqliteDb,
  type SchemaArtifact,
  addonSchemaSources,
  computeSchemaDrift,
  baseline,
  exportSchema,
  generateMigrations,
  parseDatabaseUrl,
  migrateAndCodegen,
  devSeed as runDevSeed,
  reset as runReset,
  createKysely,
} from './local-db.js'
import type { ColumnInfo } from './db-introspector.js'
import { MigrationDriftError } from '@pikku/db-migrator'
import { loadSqliteRuntime } from '@pikku/db-migrator/sqlite'

let root: string

/**
 * `computeSchemaDrift` with the arguments it needs to find an auth source.
 *
 * The fixture projects configure none, which is itself worth exercising: the
 * runtime declaration must degrade to what it can materialize rather than
 * refusing to answer.
 */
const driftOf = (resolved: Parameters<typeof computeSchemaDrift>[0]) =>
  computeSchemaDrift(resolved, root, ['src'], {
    error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
  })

const baselineOf = (resolved: Parameters<typeof baseline>[0]) =>
  baseline(resolved, root, ['src'], {
    error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
  })

function usePostgresProject(options?: {
  migrationSql?: string
  devSeedSql?: string
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
  if (options?.devSeedSql !== undefined) {
    writeFileSync(join(root, 'db', 'postgres-dev-seed.sql'), options.devSeedSql)
  } else {
    writeFileSync(
      join(root, 'db', 'postgres-dev-seed.sql'),
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
    join(root, 'db', 'sqlite-dev-seed.sql'),
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

test('migrateAndCodegen applies pending migrations and writes schema.gen.ts', async () => {
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

test('dev-seed applies db/sqlite-dev-seed.sql once migrate has run', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  assert.equal(resolved.dialect, 'sqlite')
  await migrateAndCodegen(resolved)

  const result = await runDevSeed(resolved)
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

test('the dev seed refuses to run under NODE_ENV=production', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await assert.rejects(
      () => runDevSeed(resolved),
      /pikku dev seed refused: NODE_ENV=production/
    )
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }

  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as {
      c: number
    }
    assert.equal(count.c, 0)
  } finally {
    db.close()
  }
})

test('reset wipes the dev DB so a follow-up migrate replays from scratch', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  assert.equal(resolved.dialect, 'sqlite')
  await migrateAndCodegen(resolved)
  await runDevSeed(resolved)

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

test('postgres PGlite dev-seed is a no-op when the dev-seed file is missing', async () => {
  usePostgresProject()
  rmSync(join(root, 'db', 'postgres-dev-seed.sql'), { force: true })

  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')

  const result = await runDevSeed(resolved)
  assert.deepEqual(result, { applied: false, bytes: 0 })
})

test('postgres PGlite dev-seed is a no-op when the dev-seed file is blank', async () => {
  usePostgresProject({ devSeedSql: '   \n\t  ' })

  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'postgres')

  const result = await runDevSeed(resolved)
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
    devSeedSql: '',
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

test('scratch codegen types the postgres migrations without touching the configured database', async () => {
  usePostgresProject()
  const resolved = resolveDb({}, root, root)!

  const scratch = await migrateAndCodegen(resolved, { scratch: true })
  assert.deepEqual(scratch.migrate.applied, ['0001-init.sql'])
  assert.match(readFileSync(resolved.zodFile, 'utf8'), /export const TodosZ/)

  // The configured database must be untouched — so a real migrate afterwards
  // still sees the migration as pending. If the scratch run had recorded state
  // anywhere real, this would come back skipped and the deploy would never
  // apply it.
  const live = await migrateAndCodegen(resolved)
  assert.deepEqual(live.migrate.applied, ['0001-init.sql'])
})

test('resolveDb carries the declared PGlite extensions onto the postgres descriptor', () => {
  usePostgresProject()

  const local = resolveDb({}, root, root, undefined, {
    pgliteExtensions: ['hstore'],
  })!
  assert.equal(local.dialect, 'postgres')
  if (local.dialect !== 'postgres') throw new Error('expected postgres')
  assert.deepEqual(local.pgliteExtensions, ['hstore'])

  // A project on a real Postgres server still needs them: the shadow database
  // the CLI diffs against is PGlite either way.
  const remote = resolveDb(
    { postgresUrl: 'postgres://user:pass@localhost:5432/mydb' },
    root,
    root,
    undefined,
    { pgliteExtensions: ['hstore'] }
  )!
  if (remote.dialect !== 'postgres') throw new Error('expected postgres')
  assert.deepEqual(remote.pgliteExtensions, ['hstore'])

  const undeclared = resolveDb({}, root, root)!
  if (undeclared.dialect !== 'postgres') throw new Error('expected postgres')
  assert.deepEqual(undeclared.pgliteExtensions, [])
})

test('a declared extension is available to the scratch database', async () => {
  usePostgresProject({
    migrationSql: `CREATE EXTENSION IF NOT EXISTS hstore;
CREATE TABLE docs (
  id SERIAL PRIMARY KEY,
  meta hstore
);
`,
    devSeedSql: '',
  })

  const resolved = resolveDb({}, root, root, undefined, {
    pgliteExtensions: ['hstore'],
  })!
  const scratch = await migrateAndCodegen(resolved, { scratch: true })
  assert.deepEqual(scratch.migrate.applied, ['0001-init.sql'])
  assert.match(readFileSync(resolved.schemaFile, 'utf8'), /Docs/)
})

test('a declared extension is available to the local PGlite database', async () => {
  usePostgresProject({
    migrationSql: `CREATE EXTENSION IF NOT EXISTS hstore;
CREATE TABLE docs (
  id SERIAL PRIMARY KEY,
  meta hstore
);
`,
    devSeedSql: '',
  })

  const resolved = resolveDb({}, root, root, undefined, {
    pgliteExtensions: ['hstore'],
  })!
  await migrateAndCodegen(resolved)

  const kysely = await createKysely<{ docs: { id: number } }>(resolved)
  try {
    const rows = await kysely.selectFrom('docs').select('id').execute()
    assert.deepEqual(rows, [])
  } finally {
    await kysely.destroy()
  }
})

test('an undeclared extension fails with guidance rather than a bare Postgres error', async () => {
  usePostgresProject({
    migrationSql: `CREATE EXTENSION IF NOT EXISTS hstore;\n`,
    devSeedSql: '',
  })

  const resolved = resolveDb({}, root, root)!
  await assert.rejects(
    () => migrateAndCodegen(resolved, { scratch: true }),
    (error: Error) => {
      assert.match(error.message, /hstore/)
      assert.match(error.message, /pgliteExtensions/)
      return true
    }
  )
})

test('an unresolvable extension specifier says where it was looked for', async () => {
  usePostgresProject()
  const resolved = resolveDb({}, root, root, undefined, {
    pgliteExtensions: ['@not-installed/pglite-nothing'],
  })!

  await assert.rejects(
    () => migrateAndCodegen(resolved, { scratch: true }),
    (error: Error) => {
      assert.match(error.message, /@not-installed\/pglite-nothing/)
      assert.match(error.message, /install/i)
      return true
    }
  )
})

test('a module that exports no PGlite extension is rejected by name', async () => {
  usePostgresProject()
  writeFileSync(
    join(root, 'not-an-extension.mjs'),
    'export const nope = { hello: "world" }\n'
  )

  const resolved = resolveDb({}, root, root, undefined, {
    pgliteExtensions: ['./not-an-extension.mjs'],
  })!

  await assert.rejects(
    () => migrateAndCodegen(resolved, { scratch: true }),
    (error: Error) => {
      assert.match(error.message, /not-an-extension\.mjs/)
      assert.match(error.message, /no PGlite extension/)
      return true
    }
  )
})

test('scratch codegen types the sqlite migrations without creating the db file', async () => {
  const resolved = resolveDb({}, root, root)!
  assert.equal(resolved.dialect, 'sqlite')

  const scratch = await migrateAndCodegen(resolved, { scratch: true })
  assert.deepEqual(scratch.migrate.applied, ['0001-init.sql'])
  assert.match(readFileSync(resolved.zodFile, 'utf8'), /export const TodosZ/)
  assert.equal(existsSync((resolved as ResolvedSqliteDb).dbFile), false)
})

test('db check reports a database that is behind its migrations', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  // A migration written after the database was last migrated.
  writeFileSync(
    join(root, 'db', 'sqlite', '0002-tags.sql'),
    `CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL);
ALTER TABLE todos ADD COLUMN priority INTEGER;
`
  )

  const drift = await driftOf(resolved)
  assert.equal(drift.inSync, false)
  assert.deepEqual(drift.missingTables, ['tags'])
  assert.deepEqual(drift.missingColumns, [
    { table: 'todos', columns: ['priority'] },
  ])
})

test('db check reports tables the migrations never mention, without failing', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  // Something created a table outside the migration history — the shape of the
  // bug this exists to surface.
  const runtime = await loadSqliteRuntime()
  const db = runtime.open((resolved as ResolvedSqliteDb).dbFile)
  try {
    db.exec('CREATE TABLE bootstrapped_at_boot (id INTEGER PRIMARY KEY)')
  } finally {
    db.close()
  }

  const drift = await driftOf(resolved)
  assert.deepEqual(drift.extraTables, ['bootstrapped_at_boot'])
  assert.equal(drift.inSync, true, 'an unrecorded table is reported, not fatal')
})

test('db check tells a runtime table apart from an unexplained one', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  const runtime = await loadSqliteRuntime()
  const db = runtime.open((resolved as ResolvedSqliteDb).dbFile)
  try {
    // One table pikku declares, one nothing has ever heard of.
    db.exec('CREATE TABLE workflow_runs (workflow_run_id TEXT PRIMARY KEY)')
    db.exec('CREATE TABLE nobody_knows (id INTEGER PRIMARY KEY)')
  } finally {
    db.close()
  }

  const drift = await driftOf(resolved)
  assert.deepEqual(drift.runtimeTables, ['workflow_runs'])
  assert.deepEqual(drift.extraTables, ['nobody_knows'])
})

test('db check does not demand runtime tables from a project that has none', async () => {
  // The declaration recognises tables; it does not require them. A project that
  // never constructs the workflow or AI services owes them nothing.
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  const drift = await driftOf(resolved)
  assert.deepEqual(drift.missingTables, [])
  assert.deepEqual(drift.runtimeTables, [])
  assert.equal(drift.inSync, true)
})

test('db check reports a public copy shadowing a schema-qualified table', async () => {
  usePostgresProject({
    migrationSql: `CREATE SCHEMA app;
CREATE TABLE app.orders (
  id SERIAL PRIMARY KEY,
  total INTEGER NOT NULL
);
`,
  })
  const resolved = resolveDb({}, root, root)!
  await migrateAndCodegen(resolved)

  // A second copy in the default schema — what a runtime that forgot to qualify
  // its DDL leaves behind, and what matching on the bare name would hide.
  const kysely = await createKysely<{}>(resolved)
  try {
    await sql`CREATE TABLE public.orders (id SERIAL PRIMARY KEY)`.execute(
      kysely
    )
  } finally {
    await kysely.destroy()
  }

  const drift = await driftOf(resolved)
  assert.deepEqual(drift.extraTables, ['orders'])
  assert.deepEqual(drift.missingTables, [], 'app.orders is still accounted for')
})

test('db baseline records a migration whose tables the database already has', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  // The shape baselining exists for: something created the table at boot, and
  // the migration writing it down is authored afterwards. Applying it would
  // fail on every database that already has it.
  const runtime = await loadSqliteRuntime()
  const db = runtime.open((resolved as ResolvedSqliteDb).dbFile)
  try {
    db.exec('CREATE TABLE bootstrapped (id INTEGER PRIMARY KEY)')
  } finally {
    db.close()
  }
  writeFileSync(
    join(root, 'db', 'sqlite', '0002-bootstrapped.sql'),
    'CREATE TABLE bootstrapped (id INTEGER PRIMARY KEY);\n'
  )

  const result = await baselineOf(resolved)
  assert.equal(result.status, 'recorded')
  assert.deepEqual(result.status === 'recorded' ? result.recorded : [], [
    '0002-bootstrapped.sql',
  ])

  // Recorded, not run — so a subsequent migrate has nothing to do and does not
  // trip over the table already existing.
  const after = await migrateAndCodegen(resolved)
  assert.deepEqual(after.migrate.applied, [])
  assert.deepEqual(after.migrate.skipped, [
    '0001-init.sql',
    '0002-bootstrapped.sql',
  ])
})

test('db baseline refuses when the database is actually behind', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  await migrateAndCodegen(resolved)

  // No table was created out of band this time, so the premise is false.
  // Recording this would leave the database permanently missing `tags` with no
  // pending migration left to reveal it.
  writeFileSync(
    join(root, 'db', 'sqlite', '0002-tags.sql'),
    'CREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT NOT NULL);\n'
  )

  const result = await baselineOf(resolved)
  assert.equal(result.status, 'behind')
  assert.deepEqual(
    result.status === 'behind' ? result.drift.missingTables : [],
    ['tags']
  )

  // And it really did not record anything.
  const after = await migrateAndCodegen(resolved)
  assert.deepEqual(after.migrate.applied, ['0002-tags.sql'])
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

  const devSeedResult = await runDevSeed(resolved)
  assert.equal(devSeedResult.applied, true)

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

describe('the addon schema channel', () => {
  /** Install a package into the fixture that publishes the given schema. */
  const publishAddon = (pkg: string, artifact: SchemaArtifact) => {
    const dir = join(root, 'node_modules', pkg)
    mkdirSync(join(dir, '.pikku', 'db'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: pkg, version: '1.0.0' })
    )
    writeFileSync(
      join(dir, '.pikku', 'db', 'pikku-db-meta.gen.json'),
      JSON.stringify(artifact)
    )
  }

  const labels: SchemaArtifact = {
    sqlite: {
      sql: 'CREATE TABLE labels (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
      tables: {
        labels: [
          {
            name: 'id',
            type: 'INTEGER',
            notNull: true,
            pk: true,
            defaultValue: null,
          },
          {
            name: 'name',
            type: 'TEXT',
            notNull: true,
            pk: false,
            defaultValue: null,
          },
        ],
      },
    },
  }

  const silent = { error: (msg: string) => assert.fail(`unexpected: ${msg}`) }

  test('an addon publishes the migrations it ships, per dialect', async () => {
    const artifact = await exportSchema(root)
    assert.deepEqual(Object.keys(artifact), ['sqlite'])
    assert.match(artifact.sqlite!.sql, /CREATE TABLE todos/)
    assert.deepEqual(
      artifact.sqlite!.tables['todos']?.map((c) => c.name),
      ['id', 'title', 'done']
    )
  })

  test('a wired addon becomes a schema source the consumer can migrate', async () => {
    publishAddon('addon-labels', labels)

    const sources = await addonSchemaSources(
      root,
      'sqlite',
      [{ package: 'addon-labels' }],
      silent
    )
    assert.equal(sources.length, 1)
    assert.equal(sources[0]!.name, 'addon-labels')
    assert.deepEqual([...sources[0]!.desired.tables.keys()], ['labels'])
  })

  test('a remote addon contributes nothing — its tables live on the host', async () => {
    publishAddon('addon-labels', labels)

    const sources = await addonSchemaSources(
      root,
      'sqlite',
      [{ package: 'addon-labels', remote: true }],
      silent
    )
    assert.deepEqual(sources, [])
  })

  test('an addon that publishes no schema at all is not a finding', async () => {
    const dir = join(root, 'node_modules', 'addon-quiet')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'addon-quiet', version: '1.0.0' })
    )

    const sources = await addonSchemaSources(
      root,
      'sqlite',
      [{ package: 'addon-quiet' }],
      silent
    )
    assert.deepEqual(sources, [])
  })

  test('an addon with no schema for this dialect is reported, not skipped quietly', async () => {
    publishAddon('addon-labels', labels)
    const errors: string[] = []

    const sources = await addonSchemaSources(
      root,
      'postgres',
      [{ package: 'addon-labels' }],
      { error: (msg) => errors.push(msg) }
    )
    assert.deepEqual(sources, [])
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /addon-labels.*not for postgres/)
  })
})

test('db generate writes an addon its own migration, in the consumer history', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!

  const dir = join(root, 'node_modules', 'addon-labels')
  mkdirSync(join(dir, '.pikku', 'db'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'addon-labels', version: '1.0.0' })
  )
  writeFileSync(
    join(dir, '.pikku', 'db', 'pikku-db-meta.gen.json'),
    JSON.stringify({
      sqlite: {
        sql: 'CREATE TABLE labels (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
        tables: {
          labels: [
            {
              name: 'id',
              type: 'INTEGER',
              notNull: true,
              pk: true,
              defaultValue: null,
            },
            {
              name: 'name',
              type: 'TEXT',
              notNull: true,
              pk: false,
              defaultValue: null,
            },
          ],
        },
      },
    } satisfies SchemaArtifact)
  )

  const { written } = await generateMigrations(
    resolved,
    root,
    ['src'],
    { error: (msg: string) => assert.fail(`unexpected error log: ${msg}`) },
    [{ package: 'addon-labels' }]
  )

  const addonMigration = written.find((w) => w.source === 'addon-labels')
  assert.ok(addonMigration, 'the addon got a migration of its own')
  const body = readFileSync(addonMigration.file, 'utf8')
  assert.match(
    body,
    /Generated by `pikku db generate` from the 'addon-labels' addon/
  )
  assert.match(body, /CREATE TABLE labels/)

  // And it is a real migration: applying it leaves the database matching.
  await migrateAndCodegen(resolved)
  const drift = await driftOf(resolved)
  assert.equal(drift.inSync, true)
  assert.deepEqual(drift.extraTables, [])
})

test('db generate adds only the columns a partially covered source is missing', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!

  // The source claims a table the migrations already create, plus a column on
  // it they do not. Re-emitting its whole schema would fail on the table that
  // exists, so the only correct output is the delta.
  const dir = join(root, 'node_modules', 'addon-priority')
  mkdirSync(join(dir, '.pikku', 'db'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'addon-priority', version: '1.0.0' })
  )
  writeFileSync(
    join(dir, '.pikku', 'db', 'pikku-db-meta.gen.json'),
    JSON.stringify({
      sqlite: {
        sql: 'CREATE TABLE todos (id INTEGER PRIMARY KEY, priority INTEGER, owner TEXT NOT NULL);',
        tables: {
          todos: [
            {
              name: 'id',
              type: 'INTEGER',
              notNull: true,
              pk: true,
              defaultValue: null,
            },
            {
              name: 'priority',
              type: 'INTEGER',
              notNull: false,
              pk: false,
              defaultValue: '0',
            },
            {
              name: 'owner',
              type: 'TEXT',
              notNull: true,
              pk: false,
              defaultValue: null,
            },
          ],
        },
      },
    } satisfies SchemaArtifact)
  )

  const { written } = await generateMigrations(
    resolved,
    root,
    ['src'],
    { error: (msg: string) => assert.fail(`unexpected error log: ${msg}`) },
    [{ package: 'addon-priority' }]
  )

  const migration = written.find((w) => w.source === 'addon-priority')
  assert.ok(migration, 'the missing columns were written')
  const body = readFileSync(migration.file, 'utf8')
  assert.doesNotMatch(body, /CREATE TABLE todos/, 'the table already exists')
  assert.match(body, /ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0;/)
  assert.match(body, /ALTER TABLE todos ADD COLUMN owner TEXT NOT NULL;/)

  // NOT NULL with no default cannot be applied to a table that has rows, and
  // what those rows should get is not the generator's decision to make.
  assert.deepEqual(migration.needsBackfill, ['todos.owner'])
  assert.match(body, /-- REVIEW: owner is NOT NULL with no default/)
})

/**
 * Publish an addon's schema artifact under `root/node_modules`, overwriting any
 * earlier one.
 *
 * Republishing is the point: a source growing a table between two `db generate`
 * runs is what enabling a Better Auth plugin or upgrading an addon looks like.
 */
function publishAddonSchema(
  pkg: string,
  artifact: SchemaArtifact,
  at: string
): void {
  const dir = join(at, 'node_modules', pkg)
  mkdirSync(join(dir, '.pikku', 'db'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: pkg, version: '1.0.0' })
  )
  writeFileSync(
    join(dir, '.pikku', 'db', 'pikku-db-meta.gen.json'),
    JSON.stringify(artifact)
  )
}

const column = (
  name: string,
  type: string,
  extra: Partial<ColumnInfo> = {}
): ColumnInfo => ({
  name,
  type,
  notNull: false,
  pk: false,
  defaultValue: null,
  ...extra,
})

/** The source before the plugin is enabled: one table, and nothing else. */
const beforePlugin: SchemaArtifact['sqlite'] = {
  sql: 'CREATE TABLE person (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL);',
  tables: {
    person: [
      column('id', 'TEXT', { notNull: true, pk: true }),
      column('name', 'TEXT', { notNull: true }),
    ],
  },
}

/** The same source after it: a new table, and a new column on the old one. */
const afterPlugin: SchemaArtifact['sqlite'] = {
  sql:
    'CREATE TABLE person (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, two_factor_enabled INTEGER);\n' +
    'CREATE TABLE two_factor (id TEXT NOT NULL PRIMARY KEY, secret TEXT NOT NULL, person_id TEXT NOT NULL REFERENCES person (id));\n' +
    'CREATE INDEX two_factor_person_id_idx ON two_factor (person_id);',
  tables: {
    person: [
      column('id', 'TEXT', { notNull: true, pk: true }),
      column('name', 'TEXT', { notNull: true }),
      column('two_factor_enabled', 'INTEGER'),
    ],
    two_factor: [
      column('id', 'TEXT', { notNull: true, pk: true }),
      column('secret', 'TEXT', { notNull: true }),
      column('person_id', 'TEXT', { notNull: true }),
    ],
  },
}

test('db generate writes a new table on a covered source from the source’s own SQL', async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  const generate = () =>
    generateMigrations(
      resolved,
      root,
      ['src'],
      { error: (msg: string) => assert.fail(`unexpected error log: ${msg}`) },
      [{ package: 'addon-auth' }]
    )

  publishAddonSchema('addon-auth', { sqlite: beforePlugin }, root)
  const first = await generate()
  const initial = first.written.find((w) => w.source === 'addon-auth')
  assert.ok(initial, 'the source got its first migration')
  assert.equal(
    readFileSync(initial.file, 'utf8').includes(beforePlugin!.sql),
    true,
    'the first-time path still writes the source SQL verbatim'
  )

  // The plugin is enabled. `person` is already covered, so this goes through the
  // diff path — the one that used to render a new table from its column list.
  publishAddonSchema('addon-auth', { sqlite: afterPlugin }, root)
  const second = await generate()
  const migration = second.written.find((w) => w.source === 'addon-auth')
  assert.ok(migration, 'the new table and column were written')
  const body = readFileSync(migration.file, 'utf8')

  // The table arrives whole: key, foreign key and index, none of which a column
  // list can express.
  assert.match(body, /CREATE TABLE two_factor \(id TEXT NOT NULL PRIMARY KEY/)
  assert.match(body, /person_id TEXT NOT NULL REFERENCES person \(id\)/)
  assert.match(
    body,
    /CREATE INDEX two_factor_person_id_idx ON two_factor \(person_id\);/
  )
  assert.doesNotMatch(body, /REVIEW/, 'nothing is left for a human to copy')

  // And the column-level diff on the table that already exists is untouched.
  assert.match(
    body,
    /ALTER TABLE person ADD COLUMN two_factor_enabled INTEGER;/
  )
  assert.doesNotMatch(body, /CREATE TABLE person/, 'person already exists')

  // The whole thing is a real migration: it applies, and leaves no drift.
  await migrateAndCodegen(resolved)
  const drift = await driftOf(resolved)
  assert.equal(drift.inSync, true)
  assert.deepEqual(drift.extraTables, [])
})

test('the same holds on postgres', async () => {
  usePostgresProject()
  const resolved = resolveDb({}, root, root)!
  const generate = () =>
    generateMigrations(
      resolved,
      root,
      ['src'],
      { error: (msg: string) => assert.fail(`unexpected error log: ${msg}`) },
      [{ package: 'addon-auth' }]
    )

  const before: SchemaArtifact = {
    postgres: {
      sql: 'CREATE TABLE person (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL);',
      tables: beforePlugin!.tables,
    },
  }
  const after: SchemaArtifact = {
    postgres: {
      sql: afterPlugin!.sql,
      tables: afterPlugin!.tables,
    },
  }

  publishAddonSchema('addon-auth', before, root)
  await generate()
  publishAddonSchema('addon-auth', after, root)
  const migration = (await generate()).written.find(
    (w) => w.source === 'addon-auth'
  )
  assert.ok(migration, 'the new table and column were written')
  const body = readFileSync(migration.file, 'utf8')

  assert.match(body, /CREATE TABLE two_factor \(id TEXT NOT NULL PRIMARY KEY/)
  assert.match(body, /REFERENCES person \(id\)/)
  assert.match(body, /CREATE INDEX two_factor_person_id_idx/)
  assert.doesNotMatch(body, /REVIEW/)
  assert.match(
    body,
    /ALTER TABLE person ADD COLUMN two_factor_enabled INTEGER;/
  )

  await migrateAndCodegen(resolved)
  assert.equal((await driftOf(resolved)).inSync, true)
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

describe('db.schema', () => {
  test('resolveDb carries the schema onto a postgres database', () => {
    usePostgresProject()
    const resolved = resolveDb({}, root, root, undefined, 'app')!

    assert.equal(resolved.dialect, 'postgres')
    if (resolved.dialect !== 'postgres') throw new Error('expected postgres')
    assert.equal(resolved.schema, 'app')
  })

  test('resolveDb leaves it unset when nothing asked for one', () => {
    usePostgresProject()
    const resolved = resolveDb({}, root, root)!

    assert.equal(resolved.dialect, 'postgres')
    if (resolved.dialect !== 'postgres') throw new Error('expected postgres')
    assert.equal(resolved.schema, undefined)
  })

  test('resolveDb refuses it on sqlite rather than silently ignoring it', () => {
    // sqlite's REFERENCES clause takes a bare table name, so there is no
    // qualified DDL to generate — and a setting that does nothing is worse
    // than one that says so.
    assert.throws(
      () =>
        resolveDb(
          { sqliteDb: '.pikku-runtime/dev.db' },
          root,
          root,
          undefined,
          'app'
        ),
      /db\.schema is set to 'app'.*sqlite/s
    )
  })

  /**
   * The half of #713 that survived: a project's migrations should carry the
   * runtime tables it has a use for, not all nine schemas unconditionally.
   */
  test('the declaration narrows to the services the project reaches', async () => {
    usePostgresProject()
    const resolved = resolveDb({}, root, root)!
    const logger = {
      error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
    }

    const runtime = await desiredRuntimeSchema(
      resolved,
      root,
      ['src'],
      logger,
      new Set(['workflowService'])
    )

    assert.ok(runtime.tables.has('workflow_step'), 'the service it wires')
    assert.ok(!runtime.tables.has('agent_run'), 'a service it does not wire')
    assert.ok(!runtime.tables.has('channels'))
    assert.ok(!runtime.tables.has('webhook_delivery'))
    assert.ok(!runtime.tables.has('credentials'))

    // No service owns these, so they are never gated off.
    assert.ok(runtime.tables.has('pikku_user_sessions'))
    assert.ok(runtime.tables.has('secrets'))
    assert.ok(runtime.tables.has('pikku_deployments'))
  })

  /**
   * Drift recognises rather than requires, so it asks the unscoped question.
   * A table created by a wiring that has since been deleted is still a runtime
   * table, and scoping the declaration here would report it as unexplained.
   */
  test('omitting the wirings keeps the whole declaration', async () => {
    usePostgresProject()
    const resolved = resolveDb({}, root, root)!
    const runtime = await desiredRuntimeSchema(resolved, root, ['src'], {
      error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
    })

    assert.ok(runtime.tables.has('agent_run'))
    assert.ok(runtime.tables.has('channels'))
    assert.ok(runtime.tables.has('workflow_step'))
  })

  test('the runtime SQL is qualified while the table names stay bare', async () => {
    usePostgresProject()
    const resolved = resolveDb({}, root, root, undefined, 'app')!
    const logger = {
      error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
    }

    const runtime = await desiredRuntimeSchema(resolved, root, ['src'], logger)

    assert.match(runtime.sql, /create table "app"\./)
    assert.doesNotMatch(
      runtime.sql,
      /create table "(?!app")[^"]+" \(/,
      'every runtime table belongs in the configured schema'
    )

    // The table map is what drift and coverage compare on, and those speak bare
    // names throughout. Qualifying it would make every table look unrecorded.
    for (const table of runtime.tables.keys()) {
      assert.doesNotMatch(table, /\./, `${table} should be a bare name`)
    }
    assert.ok(runtime.tables.has('workflow_step'))
  })

  test('without a schema the same SQL is unqualified', async () => {
    usePostgresProject()
    const resolved = resolveDb({}, root, root)!
    const logger = {
      error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
    }

    const runtime = await desiredRuntimeSchema(resolved, root, ['src'], logger)

    assert.doesNotMatch(runtime.sql, /"app"\./)
    assert.match(runtime.sql, /create table "workflow_step"/i)
  })

  /**
   * A table of the same name in another schema is a different table.
   *
   * The bare desired names match a qualified covered one so that migrations
   * written before the option existed still count. Letting that match ignore
   * which schema the copy is in makes `public.workflow_step` — the very table
   * the option exists to move away from — read as coverage, and generation
   * would call the source up to date having created nothing in `app`.
   */
  test('a table covered in another schema is not coverage for this one', async () => {
    usePostgresProject({
      migrationSql: `CREATE TABLE public.workflow_step (
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL
);
`,
    })
    const resolved = resolveDb({}, root, root, undefined, 'app')!

    const { written, upToDate } = await generateMigrations(
      resolved,
      root,
      ['src'],
      { error: (msg: string) => assert.fail(`unexpected error log: ${msg}`) }
    )

    assert.ok(
      !upToDate.includes('pikku-runtime'),
      'the runtime source still needs its tables in app'
    )
    const migration = written.find((w) => w.source === 'pikku-runtime')
    assert.ok(migration, 'the runtime source got a migration')
    const body = readFileSync(migration.file, 'utf8')

    // Created, not altered. Counting the `public` copy as coverage turns the
    // table into a column-level delta, and every one of those ALTERs then runs
    // against an `app.workflow_step` that was never created.
    assert.match(body, /create table ("app"\.)?"?workflow_step"?/i)
    assert.doesNotMatch(body, /ALTER TABLE "app"\.workflow_step/)
  })
})

/**
 * The case the option was added for.
 *
 * A project whose migrations already create the runtime tables but are a column
 * short — what upgrading `@pikku/kysely` looks like — gets a delta rather than
 * the whole schema. The delta is written from bare introspected names, so it is
 * the one output that does not inherit the qualification from the compiled SQL
 * and has to be given it. Unqualified, `ALTER TABLE workflow_step` resolves
 * against `search_path` and alters a table in `public` that nothing reads.
 */
test('db generate qualifies the ALTER TABLE delta too', async () => {
  usePostgresProject({
    migrationSql: `CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE app.workflow_step (
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL
);
`,
  })
  const resolved = resolveDb({}, root, root, undefined, 'app')!

  const { written } = await generateMigrations(resolved, root, ['src'], {
    error: (msg: string) => assert.fail(`unexpected error log: ${msg}`),
  })

  const migration = written.find((w) => w.source === 'pikku-runtime')
  assert.ok(migration, 'the runtime source got a migration')
  const body = readFileSync(migration.file, 'utf8')

  // The column the covered table is missing, as an alteration of the table in
  // `app` — not of whatever `workflow_step` resolves to.
  assert.match(body, /ALTER TABLE "app"\.workflow_step ADD COLUMN/)
  assert.doesNotMatch(
    body,
    /ALTER TABLE workflow_step /,
    'an unqualified ALTER would land in whichever schema search_path finds'
  )

  // And the tables it does create wholesale are qualified as well.
  assert.match(body, /create table "app"\./i)
})
