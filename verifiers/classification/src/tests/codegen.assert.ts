/**
 * Verifies that `pikku db migrate` emits correct Private<T>/Secret<T> brands
 * in schema.d.ts and a well-formed classification.gen.ts manifest.
 *
 * Classification + type info is authored in `db/annotations.ts` (the single
 * source) — there is no SQL-comment annotation path anymore.
 */

import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

/** Authored `db/annotations.ts` shape: table → column → ColumnEntry. */
type ColumnEntry = {
  security?: 'public' | 'private' | 'pii' | 'secret' | 'encrypted'
  classification?: 'fake:email' | 'fake:name' | 'hash' | 'keep'
  kind?: 'date' | 'bool' | 'json' | 'uuid'
  tsType?: string
  format?: string
}
type Annotations = Record<string, Record<string, ColumnEntry>>

function runPikkuDbMigrate(dir: string): { exitCode: number; output: string } {
  // spawnSync (not execFileSync) so we capture stderr on *success* too — codegen
  // warnings go to console.warn (stderr) and some tests assert on them.
  const res = spawnSync('node', [PIKKU_BIN, 'db', 'migrate'], {
    cwd: dir,
    timeout: 30_000,
    encoding: 'utf8',
  })
  return {
    exitCode: res.status ?? 1,
    output: (res.stdout ?? '') + (res.stderr ?? ''),
  }
}

async function createProject(
  migrations: Record<string, string>,
  annotations?: Annotations
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-codegen-test-'))
  await writeFile(
    join(tmpDir, 'pikku.config.json'),
    JSON.stringify({
      srcDirectories: ['./src'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    })
  )
  await writeFile(
    join(tmpDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        strict: true,
      },
      include: ['src'],
    })
  )
  await mkdir(join(tmpDir, 'db', 'sqlite'), { recursive: true })
  await mkdir(join(tmpDir, 'src'), { recursive: true })

  for (const [name, sql] of Object.entries(migrations)) {
    await writeFile(join(tmpDir, 'db', 'sqlite', name), sql)
  }

  // The codegen compiles db/annotations.ts → annotations.gen.json before
  // introspection, so authored classification applies in a single migrate.
  if (annotations) {
    await writeFile(
      join(tmpDir, 'db', 'annotations.ts'),
      `export const classifications = ${JSON.stringify(annotations, null, 2)}\n`
    )
  }

  return tmpDir
}

describe('DB codegen — classification brands', () => {
  test('emits Private<string> for private columns', async (t) => {
    const dir = await createProject(
      {
        '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT NOT NULL,
          email TEXT NOT NULL
        );
      `,
      },
      { users: { email: { security: 'private', classification: 'fake:email' } } }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.match(schema, /Private<string>/, 'email should be Private<string>')
    assert.ok(
      schema.includes('email:') &&
        schema.includes('ColumnType<Private<string>'),
      'email column type should use ColumnType<Private<string>, ...'
    )
  })

  test('emits Secret<string> for secret columns', async (t) => {
    const dir = await createProject(
      {
        '001_tokens.sql': `
        CREATE TABLE IF NOT EXISTS tokens (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT NOT NULL
        );
      `,
      },
      { tokens: { value: { security: 'secret', classification: 'hash' } } }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.match(schema, /Secret<string>/)
  })

  test('emits plain type for public columns (no brand)', async (t) => {
    const dir = await createProject(
      {
        '001_posts.sql': `
        CREATE TABLE IF NOT EXISTS posts (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body  TEXT NOT NULL
        );
      `,
      },
      {
        posts: {
          id: { security: 'public' },
          title: { security: 'public' },
          body: { security: 'public' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    // The type aliases Private<T>/Pii<T>/Secret<T> are always emitted in the header.
    // Verify that no column *uses* them.
    assert.doesNotMatch(
      schema,
      /ColumnType<Private</,
      'all-public table should have no columns using Private<> brand'
    )
    assert.doesNotMatch(
      schema,
      /ColumnType<Pii</,
      'all-public table should have no columns using Pii<> brand'
    )
    assert.doesNotMatch(
      schema,
      /ColumnType<Secret</,
      'all-public table should have no columns using Secret<> brand'
    )
  })

  test('defaults unannotated columns to private (Private brand)', async (t) => {
    const dir = await createProject({
      '001_items.sql': `
        CREATE TABLE IF NOT EXISTS items (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.match(
      schema,
      /Private<string>/,
      'unannotated text column defaults to Private'
    )
  })

  test('honours kind: date together with a private classification', async (t) => {
    const dir = await createProject(
      {
        '001_events.sql': `
        CREATE TABLE IF NOT EXISTS events (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `,
      },
      {
        events: {
          created_at: { security: 'private', classification: 'keep', kind: 'date' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    // kind: 'date' makes it Date; private classification makes it Private<Date>.
    assert.match(schema, /Private<Date>/)
  })

  test('honours tsType as a general type override', async (t) => {
    const dir = await createProject(
      {
        '001_configs.sql': `
        CREATE TABLE IF NOT EXISTS configs (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          tags TEXT NOT NULL
        );
      `,
      },
      {
        configs: {
          tags: { security: 'public', kind: 'json', tsType: 'string[]' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.match(schema, /string\[\]/, 'tsType override should surface as string[]')
  })

  test('kind: uuid types as Uuid and emits z.uuid() in zod', async (t) => {
    const dir = await createProject(
      {
        '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id    TEXT PRIMARY KEY,
          email TEXT NOT NULL
        );
      `,
      },
      {
        users: {
          id: { security: 'public', kind: 'uuid' },
          email: { security: 'public' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.match(schema, /export type Uuid = string/, 'emits the Uuid alias')
    assert.match(schema, /id: Uuid/, 'id column types as Uuid')

    const zod = await readFile(join(dir, '.pikku', 'db', 'zod.gen.ts'), 'utf-8')
    assert.match(zod, /id: z\.uuid\(\)/, 'zod emits z.uuid() for the uuid column')
    assert.match(zod, /email: z\.string\(\)/, 'plain text column stays z.string()')
  })

  test('format: email refines the zod schema to z.email()', async (t) => {
    const dir = await createProject(
      {
        '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          name  TEXT NOT NULL
        );
      `,
      },
      {
        users: {
          email: { security: 'public', format: 'email' },
          name: { security: 'public' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    // The TS type is unchanged by a format — it stays a plain string.
    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.doesNotMatch(schema, /Email/, 'format must not introduce a named type')

    const zod = await readFile(join(dir, '.pikku', 'db', 'zod.gen.ts'), 'utf-8')
    assert.match(zod, /email: z\.email\(\)/, 'zod emits z.email() for the format')
    assert.match(zod, /name: z\.string\(\)/, 'unformatted column stays z.string()')
  })

  test('format on a non-string (kind: date) column is ignored with a warning', async (t) => {
    const dir = await createProject(
      {
        '001_events.sql': `
        CREATE TABLE IF NOT EXISTS events (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `,
      },
      {
        events: {
          // kind: date resolves the type to Date, so format: email cannot apply.
          created_at: { security: 'public', kind: 'date', format: 'email' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)
    assert.match(
      output,
      /format 'email' ignored/,
      'a contradicting format should warn'
    )

    const zod = await readFile(join(dir, '.pikku', 'db', 'zod.gen.ts'), 'utf-8')
    assert.match(zod, /createdAt: z\.date\(\)/, 'date kind wins; no z.email()')
    assert.doesNotMatch(zod, /z\.email\(\)/, 'the ignored format is not emitted')
  })

  test('applies annotations to columns added via ALTER TABLE', async (t) => {
    const dir = await createProject(
      {
        '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );
      `,
        '002_add_phone.sql': `
        ALTER TABLE users ADD COLUMN phone TEXT;
      `,
      },
      {
        users: {
          name: { security: 'public' },
          phone: { security: 'private', classification: 'fake:name' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    assert.match(
      schema,
      /phone[^;]*Private<string>|Private<string>[^;]*phone/,
      'ALTER TABLE phone column should get Private brand'
    )

    const manifest = await readFile(
      join(dir, '.pikku', 'db', 'classification.gen.ts'),
      'utf-8'
    )
    assert.match(
      manifest,
      /"phone"/,
      'manifest should include the phone column'
    )
    assert.match(
      manifest,
      /classification:\s*['"]private['"]/,
      'phone should be classified private'
    )
    assert.match(
      manifest,
      /['"]fake:name['"]/,
      'ALTER annotation strategy fake:name should be preserved'
    )
  })

  test('generates classification.gen.ts manifest with correct entries', async (t) => {
    const dir = await createProject(
      {
        '001_mixed.sql': `
        CREATE TABLE IF NOT EXISTS mixed (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          pub   TEXT NOT NULL,
          priv  TEXT NOT NULL,
          sec   TEXT NOT NULL
        );
      `,
      },
      {
        mixed: {
          pub: { security: 'public' },
          priv: { security: 'private', classification: 'fake:email' },
          sec: { security: 'secret', classification: 'hash' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const manifest = await readFile(
      join(dir, '.pikku', 'db', 'classification.gen.ts'),
      'utf-8'
    )

    // Must be a valid TS const
    assert.match(manifest, /export const classificationManifest/)
    assert.match(manifest, /as const/)

    // pub column must be public with no anonymize strategy
    assert.match(manifest, /"pub"/)
    assert.match(manifest, /classification: 'public'/)

    // priv column must be private with fake:email strategy
    assert.match(manifest, /"priv"/)
    assert.match(manifest, /classification: 'private'/)
    assert.match(manifest, /'fake:email'/)

    // sec column must be secret with hash strategy
    assert.match(manifest, /"sec"/)
    assert.match(manifest, /classification: 'secret'/)
    assert.match(manifest, /'hash'/)
  })

  test('manifest covers ALL columns including public ones', async (t) => {
    const dir = await createProject(
      {
        '001_posts.sql': `
        CREATE TABLE IF NOT EXISTS posts (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL
        );
      `,
      },
      {
        posts: {
          id: { security: 'public' },
          title: { security: 'public' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0)

    const manifest = await readFile(
      join(dir, '.pikku', 'db', 'classification.gen.ts'),
      'utf-8'
    )
    assert.match(manifest, /"id"/)
    assert.match(manifest, /"title"/)
  })

  test('brand is placed in SelectType slot only — ColumnType<Private<T>, T, T>', async (t) => {
    const dir = await createProject(
      {
        '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );
      `,
      },
      { users: { name: { security: 'private', classification: 'fake:name' } } }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.d.ts'),
      'utf-8'
    )
    // The pattern must be ColumnType<Private<string>, string, string>
    // NOT Private<ColumnType<string, ...>>
    assert.match(
      schema,
      /ColumnType<Private<string>, string, string>/,
      'brand must be in the SelectType slot only'
    )
    assert.doesNotMatch(
      schema,
      /Private<ColumnType/,
      'Private must not wrap the entire ColumnType'
    )
  })
})

describe('DB codegen — pikku-db-schema.gen.json', () => {
  test('writes schema JSON with tables and columns', async (t) => {
    const dir = await createProject({
      '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT NOT NULL,
          bio   TEXT
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const raw = await readFile(
      join(dir, '.pikku', 'db', 'pikku-db-schema.gen.json'),
      'utf-8'
    )
    const schema = JSON.parse(raw)

    assert.ok(Array.isArray(schema.tables), 'schema.tables must be an array')
    assert.ok(Array.isArray(schema.enums), 'schema.enums must be an array')

    const users = schema.tables.find((t: any) => t.name === 'users')
    assert.ok(users, 'users table must be present')
    assert.ok(Array.isArray(users.columns), 'users.columns must be an array')

    const colNames = users.columns.map((c: any) => c.name)
    assert.ok(colNames.includes('id'), 'id column must be present')
    assert.ok(colNames.includes('name'), 'name column must be present')
    assert.ok(colNames.includes('bio'), 'bio column must be present')
  })

  test('primary key columns are non-nullable', async (t) => {
    const dir = await createProject({
      '001_items.sql': `
        CREATE TABLE IF NOT EXISTS items (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const raw = await readFile(
      join(dir, '.pikku', 'db', 'pikku-db-schema.gen.json'),
      'utf-8'
    )
    const schema = JSON.parse(raw)
    const items = schema.tables.find((t: any) => t.name === 'items')
    const idCol = items.columns.find((c: any) => c.name === 'id')

    assert.equal(idCol.isPrimaryKey, true, 'id must be marked as primary key')
    assert.equal(
      idCol.nullable,
      false,
      'primary key columns must not be nullable'
    )

    const labelCol = items.columns.find((c: any) => c.name === 'label')
    assert.equal(
      labelCol.nullable,
      true,
      'optional TEXT column must be nullable'
    )
  })

  test('foreign keys are captured in the schema JSON', async (t) => {
    const dir = await createProject({
      '001_base.sql': `
        CREATE TABLE IF NOT EXISTS authors (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS books (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          title     TEXT NOT NULL,
          author_id INTEGER NOT NULL REFERENCES authors(id)
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const raw = await readFile(
      join(dir, '.pikku', 'db', 'pikku-db-schema.gen.json'),
      'utf-8'
    )
    const schema = JSON.parse(raw)
    const books = schema.tables.find((t: any) => t.name === 'books')
    const authorIdCol = books.columns.find((c: any) => c.name === 'author_id')

    assert.ok(authorIdCol.foreignKey, 'author_id must have a foreignKey entry')
    assert.equal(authorIdCol.foreignKey.table, 'authors')
    assert.equal(authorIdCol.foreignKey.column, 'id')
  })
})
