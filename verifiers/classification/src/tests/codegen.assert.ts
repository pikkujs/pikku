/**
 * Verifies that `pikku db migrate` emits correct Private<T>/Secret<T> brands
 * in schema.d.ts and a well-formed classification.gen.ts manifest.
 */

import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

function runPikkuDbMigrate(dir: string): { exitCode: number; output: string } {
  try {
    const output = execFileSync('node', [PIKKU_BIN, 'db', 'migrate'], {
      cwd: dir,
      stdio: 'pipe',
      timeout: 30_000,
    })
    return { exitCode: 0, output: output.toString() }
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      output: (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? ''),
    }
  }
}

async function createProject(migrations: Record<string, string>): Promise<string> {
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
      compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', strict: true },
      include: ['src'],
    })
  )
  await mkdir(join(tmpDir, 'db', 'migrations'), { recursive: true })
  await mkdir(join(tmpDir, 'src'), { recursive: true })

  for (const [name, sql] of Object.entries(migrations)) {
    await writeFile(join(tmpDir, 'db', 'migrations', name), sql)
  }

  return tmpDir
}

describe('DB codegen — classification brands', () => {
  test('emits Private<string> for @private columns', async (t) => {
    const dir = await createProject({
      '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT NOT NULL,
          email TEXT NOT NULL -- @private:fake:email
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
    assert.match(schema, /Private<string>/, 'email should be Private<string>')
    assert.ok(
      schema.includes('email:') && schema.includes('ColumnType<Private<string>'),
      'email column type should use ColumnType<Private<string>, ...'
    )
  })

  test('emits Secret<string> for @secret columns', async (t) => {
    const dir = await createProject({
      '001_tokens.sql': `
        CREATE TABLE IF NOT EXISTS tokens (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT NOT NULL -- @secret:hash
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
    assert.match(schema, /Secret<string>/)
  })

  test('emits plain type for @public columns (no brand)', async (t) => {
    const dir = await createProject({
      '001_posts.sql': `
        CREATE TABLE IF NOT EXISTS posts (
          id    INTEGER PRIMARY KEY AUTOINCREMENT, -- @public
          title TEXT NOT NULL, -- @public
          body  TEXT NOT NULL  -- @public
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
    // The type aliases Private<T>/Secret<T> are always emitted in the header.
    // Verify that no column *uses* them (no ColumnType<Private<...> or ColumnType<Secret<...)
    assert.doesNotMatch(
      schema,
      /ColumnType<Private</,
      'all-@public table should have no columns using Private<> brand'
    )
    assert.doesNotMatch(
      schema,
      /ColumnType<Secret</,
      'all-@public table should have no columns using Secret<> brand'
    )
  })

  test('defaults unnanotated columns to private (Private brand)', async (t) => {
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

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
    assert.match(schema, /Private<string>/, 'unannotated text column defaults to Private')
  })

  test('handles combined annotations on same line (@date @private:keep)', async (t) => {
    const dir = await createProject({
      '001_events.sql': `
        CREATE TABLE IF NOT EXISTS events (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')) -- @date @private:keep
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
    // @date makes it Date type, @private:keep means it's Private<Date>
    assert.match(schema, /Private<Date>/)
  })

  test('handles ALTER TABLE ADD COLUMN annotations', async (t) => {
    const dir = await createProject({
      '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL -- @public
        );
      `,
      '002_add_phone.sql': `
        ALTER TABLE users ADD COLUMN phone TEXT; -- @private:fake:name
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0, `pikku db migrate failed:\n${output}`)

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
    assert.match(schema, /phone[^;]*Private<string>|Private<string>[^;]*phone/, 'ALTER TABLE phone column should get Private brand')

    const manifest = await readFile(join(dir, '.pikku', 'db', 'classification.gen.ts'), 'utf-8')
    assert.match(manifest, /"phone"/, 'manifest should include the phone column')
    assert.match(manifest, /classification:\s*['"]private['"]/, 'phone should be classified private')
    assert.match(manifest, /['"]fake:name['"]/, 'ALTER annotation strategy fake:name should be preserved')
  })

  test('generates classification.gen.ts manifest with correct entries', async (t) => {
    const dir = await createProject({
      '001_mixed.sql': `
        CREATE TABLE IF NOT EXISTS mixed (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          pub   TEXT NOT NULL, -- @public
          priv  TEXT NOT NULL, -- @private:fake:email
          sec   TEXT NOT NULL  -- @secret:hash
        );
      `,
    })
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
    const dir = await createProject({
      '001_posts.sql': `
        CREATE TABLE IF NOT EXISTS posts (
          id    INTEGER PRIMARY KEY AUTOINCREMENT, -- @public
          title TEXT NOT NULL -- @public
        );
      `,
    })
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
    const dir = await createProject({
      '001_users.sql': `
        CREATE TABLE IF NOT EXISTS users (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL -- @private:fake:name
        );
      `,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode } = runPikkuDbMigrate(dir)
    assert.equal(exitCode, 0)

    const schema = await readFile(join(dir, '.pikku', 'db', 'schema.d.ts'), 'utf-8')
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
