/**
 * Verifies that `pikku db anonymize` applies the correct per-column strategy
 * to each classified column: null→NULL, keep→unchanged, fake:email/fake:name
 * → synthetic value, hash→hex digest.
 *
 * Flow per test:
 *  1. Create temp project with migrations + seed.sql
 *  2. `pikku db migrate` — creates dev.db + classification.gen.ts
 *  3. `pikku db seed`    — inserts fixture rows
 *  4. `pikku db anonymize --out anon.db` — produces anonymized copy
 *  5. Open anon.db with node:sqlite and assert per-column values
 */

import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

function runPikku(dir: string, args: string[]): { exitCode: number; output: string } {
  try {
    const output = execFileSync('node', [PIKKU_BIN, ...args], {
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

interface ProjectOptions {
  migrationSql: string
  seedSql: string
}

async function createProject(opts: ProjectOptions): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-anon-test-'))
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

  await writeFile(join(tmpDir, 'db', 'migrations', '001_init.sql'), opts.migrationSql)
  await writeFile(join(tmpDir, 'db', 'seed.sql'), opts.seedSql)

  return tmpDir
}

function openDb(dbPath: string) {
  const { DatabaseSync } = (new Function("return import('node:sqlite')") as any)()
  return new DatabaseSync(dbPath)
}

// Avoids the async dynamic-import dance by using execFileSync of a small inline script
function queryDb(dbPath: string, sql: string): unknown[] {
  const script = `
const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync(${JSON.stringify(dbPath)})
const rows = db.prepare(${JSON.stringify(sql)}).all()
process.stdout.write(JSON.stringify(rows))
db.close()
`
  const out = execFileSync('node', ['--input-type=module'], {
    input: script,
    stdio: ['pipe', 'pipe', 'inherit'],
    timeout: 10_000,
  })
  return JSON.parse(out.toString()) as unknown[]
}

describe('DB anonymize — per-strategy verification', () => {
  test('null strategy: replaces private column values with NULL', async (t) => {
    // Column must be nullable for the null strategy to work (NOT NULL columns are skipped)
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE users (
          id    INTEGER PRIMARY KEY AUTOINCREMENT, -- @public
          name  TEXT -- @private
        );
      `,
      seedSql: `INSERT INTO users (name) VALUES ('Alice'), ('Bob');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.output}`)

    const seed = runPikku(dir, ['db', 'seed'])
    assert.equal(seed.exitCode, 0, `seed failed: ${seed.output}`)

    const anon = runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const anonDb = join(dir, 'anon.db')
    const rows = queryDb(anonDb, 'SELECT name FROM users') as Array<{ name: string | null }>
    for (const row of rows) {
      assert.equal(row.name, null, `Expected NULL but got: ${row.name}`)
    }
  })

  test('keep strategy: leaves column values unchanged', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE posts (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL, -- @public
          slug  TEXT NOT NULL  -- @private:keep
        );
      `,
      seedSql: `INSERT INTO posts (title, slug) VALUES ('My Post', 'my-post');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.output}`)

    const seed = runPikku(dir, ['db', 'seed'])
    assert.equal(seed.exitCode, 0, `seed failed: ${seed.output}`)

    const anon = runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const rows = queryDb(join(dir, 'anon.db'), 'SELECT slug FROM posts') as Array<{ slug: string }>
    assert.equal(rows[0]?.slug, 'my-post', 'keep strategy must preserve original value')
  })

  test('fake:email strategy: produces synthetic @example.com address', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE contacts (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL -- @private:fake:email
        );
      `,
      seedSql: `INSERT INTO contacts (email) VALUES ('real@company.com');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.output}`)

    const seed = runPikku(dir, ['db', 'seed'])
    assert.equal(seed.exitCode, 0, `seed failed: ${seed.output}`)

    const anon = runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const rows = queryDb(join(dir, 'anon.db'), 'SELECT email FROM contacts') as Array<{ email: string }>
    const email = rows[0]?.email
    assert.ok(email, 'anonymized email should not be null')
    assert.match(email, /@example\.com$/, 'fake:email should end with @example.com')
    assert.notEqual(email, 'real@company.com', 'anonymized value must differ from original')
  })

  test('fake:name strategy: produces synthetic Anon_<hex> value', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE people (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL -- @private:fake:name
        );
      `,
      seedSql: `INSERT INTO people (name) VALUES ('John Doe');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.output}`)

    const seed = runPikku(dir, ['db', 'seed'])
    assert.equal(seed.exitCode, 0, `seed failed: ${seed.output}`)

    const anon = runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const rows = queryDb(join(dir, 'anon.db'), 'SELECT name FROM people') as Array<{ name: string }>
    const name = rows[0]?.name
    assert.ok(name, 'anonymized name should not be null')
    assert.match(name, /^Anon_[0-9a-f]+$/, 'fake:name should match Anon_<hex>')
    assert.notEqual(name, 'John Doe', 'anonymized value must differ from original')
  })

  test('hash strategy: produces 32-char hex digest', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE secrets (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL -- @secret:hash
        );
      `,
      seedSql: `INSERT INTO secrets (token) VALUES ('supersecret123');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.output}`)

    const seed = runPikku(dir, ['db', 'seed'])
    assert.equal(seed.exitCode, 0, `seed failed: ${seed.output}`)

    const anon = runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const rows = queryDb(join(dir, 'anon.db'), 'SELECT token FROM secrets') as Array<{ token: string }>
    const token = rows[0]?.token
    assert.ok(token, 'hash result should not be null')
    assert.match(token, /^[0-9a-f]{32}$/, 'hash strategy should produce 32 hex chars')
    assert.notEqual(token, 'supersecret123', 'hashed value must differ from original')
  })

  test('public columns are untouched in the anonymized copy', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE articles (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          slug  TEXT NOT NULL, -- @public
          title TEXT NOT NULL  -- @public
        );
      `,
      seedSql: `INSERT INTO articles (slug, title) VALUES ('hello-world', 'Hello World');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.output}`)

    const seed = runPikku(dir, ['db', 'seed'])
    assert.equal(seed.exitCode, 0, `seed failed: ${seed.output}`)

    const anon = runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const rows = queryDb(join(dir, 'anon.db'), 'SELECT slug, title FROM articles') as Array<{ slug: string; title: string }>
    assert.equal(rows[0]?.slug, 'hello-world', 'public slug must be unchanged')
    assert.equal(rows[0]?.title, 'Hello World', 'public title must be unchanged')
  })

  test('source database is never modified', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE users (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL -- @private:fake:email
        );
      `,
      seedSql: `INSERT INTO users (email) VALUES ('original@test.com');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    runPikku(dir, ['db', 'migrate'])
    runPikku(dir, ['db', 'seed'])
    runPikku(dir, ['db', 'anonymize', '--out', 'anon.db'])

    const srcRows = queryDb(
      join(dir, '.pikku-runtime', 'dev.db'),
      'SELECT email FROM users'
    ) as Array<{ email: string }>
    assert.equal(
      srcRows[0]?.email,
      'original@test.com',
      'source database must remain untouched'
    )
  })

  test('--in and --out default paths are used when flags omitted', async (t) => {
    const dir = await createProject({
      migrationSql: `
        CREATE TABLE items (
          id   INTEGER PRIMARY KEY AUTOINCREMENT, -- @public
          name TEXT -- @private
        );
      `,
      seedSql: `INSERT INTO items (name) VALUES ('sensitive');`,
    })
    t.after(() => rm(dir, { recursive: true, force: true }))

    runPikku(dir, ['db', 'migrate'])
    runPikku(dir, ['db', 'seed'])

    // No --out flag → should default to dev.anonymized.db
    const anon = runPikku(dir, ['db', 'anonymize'])
    assert.equal(anon.exitCode, 0, `anonymize failed: ${anon.output}`)

    const anonDb = join(dir, '.pikku-runtime', 'dev.anonymized.db')
    const rows = queryDb(anonDb, 'SELECT name FROM items') as Array<{ name: string | null }>
    assert.equal(rows[0]?.name, null, 'default output file should be created and anonymized')
  })
})
