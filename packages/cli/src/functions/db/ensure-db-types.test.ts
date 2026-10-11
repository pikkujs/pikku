import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureDbTypes } from './ensure-db-types.js'

function project(migration?: string) {
  const root = mkdtempSync(join(tmpdir(), 'ensure-db-types-'))
  if (migration !== undefined) {
    mkdirSync(join(root, 'db', 'sqlite'), { recursive: true })
    writeFileSync(join(root, 'db', 'sqlite', '0001-init.sql'), migration)
  }
  return { root, outDir: join(root, '.pikku') }
}

test('generates schema.gen.ts from sqlite migrations with no database', async () => {
  const { root, outDir } = project(
    'CREATE TABLE widget (id TEXT PRIMARY KEY, name TEXT NOT NULL);'
  )
  assert.equal(await ensureDbTypes(root, outDir), 'generated')
  const schema = readFileSync(join(outDir, 'db', 'schema.gen.ts'), 'utf8')
  assert.match(schema, /interface DB/)
  assert.match(schema, /widget/)
})

test('leaves an existing schema.gen.ts alone', async () => {
  const { root, outDir } = project('CREATE TABLE widget (id TEXT);')
  mkdirSync(join(outDir, 'db'), { recursive: true })
  writeFileSync(join(outDir, 'db', 'schema.gen.ts'), '// mine\n')
  assert.equal(await ensureDbTypes(root, outDir), 'present')
  assert.equal(
    readFileSync(join(outDir, 'db', 'schema.gen.ts'), 'utf8'),
    '// mine\n'
  )
})

test('writes an empty DB when the migrations do not apply', async () => {
  const { root, outDir } = project('THIS IS NOT SQL;')
  assert.equal(await ensureDbTypes(root, outDir), 'stubbed')
  assert.equal(
    readFileSync(join(outDir, 'db', 'schema.gen.ts'), 'utf8'),
    'export interface DB {}\n'
  )
})

test('does nothing for a project without a database', async () => {
  const { root, outDir } = project()
  assert.equal(await ensureDbTypes(root, outDir), 'no-db')
})

function mysqlProject() {
  const root = mkdtempSync(join(tmpdir(), 'ensure-db-types-mysql-'))
  mkdirSync(join(root, 'db', 'mysql'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'mysql', '0001-init.sql'),
    'CREATE TABLE widget (id INT PRIMARY KEY);'
  )
  return { root, outDir: join(root, '.pikku') }
}

test('a mysql project with no server configured is stubbed, not an error', async () => {
  const saved = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  try {
    const { root, outDir } = mysqlProject()
    assert.equal(await ensureDbTypes(root, outDir), 'stubbed')
    assert.equal(
      readFileSync(join(outDir, 'db', 'schema.gen.ts'), 'utf8'),
      'export interface DB {}\n'
    )
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved
  }
})

test('a mysql project generates from the mysqlUrl createConfig returns', async () => {
  const url = process.env.PIKKU_TEST_MYSQL_URL
  if (!url) return
  const { root, outDir } = mysqlProject()
  assert.equal(
    await ensureDbTypes(root, outDir, undefined, undefined, { mysqlUrl: url }),
    'generated'
  )
  assert.match(
    readFileSync(join(outDir, 'db', 'schema.gen.ts'), 'utf8'),
    /interface Widget/
  )
})
