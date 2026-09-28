import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { resolveStandaloneDb } from './build-pipeline.js'

/** sqlite-vec's library for this platform: `vec0.dylib`, `vec0.so`, `vec0.dll`. */
const VEC0 = basename(
  createRequire(import.meta.url)('sqlite-vec').getLoadablePath()
)

const silentLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
}

let root: string
let projectDir: string
let pikkuDir: string
let unitDir: string

const writeConfig = (body: string) => {
  mkdirSync(join(projectDir, 'src'), { recursive: true })
  writeFileSync(join(projectDir, 'src', 'config.js'), body, 'utf-8')
}

const writeMigrations = (engine: 'sqlite' | 'postgres') => {
  const dir = join(projectDir, 'db', engine)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '0001-init.sql'), 'select 1;', 'utf-8')
}

const resolve = (sqliteExtensions?: string[]) =>
  resolveStandaloneDb(
    projectDir,
    pikkuDir,
    unitDir,
    ['src'],
    silentLogger,
    sqliteExtensions
  )

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-standalone-db-'))
  projectDir = join(root, 'project')
  pikkuDir = join(projectDir, '.pikku')
  unitDir = join(root, 'unit')
  mkdirSync(projectDir, { recursive: true })
  mkdirSync(unitDir, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveStandaloneDb', () => {
  test('a project with no database at all gets none', async () => {
    assert.equal(await resolve(), undefined)
  })

  test('sqliteDb in createConfig declares a database with no migrations dir', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: '.pikku-runtime/dev.db' })`
    )

    assert.deepEqual(await resolve(), {
      engine: 'sqlite',
      sqliteExtensions: [VEC0],
    })
  })

  test('postgresUrl in createConfig declares a database with no migrations dir', async () => {
    writeConfig(
      `export const createConfig = async () => ({ postgresUrl: 'postgres://localhost:5432/app' })`
    )

    assert.deepEqual(await resolve(), { engine: 'postgres' })
  })

  test('createConfig wins over the migrations directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => ({ postgresUrl: 'postgres://localhost:5432/app' })`
    )

    assert.deepEqual(await resolve(), { engine: 'postgres' })
  })

  test('the migrations directory still answers when createConfig declares nothing', async () => {
    writeMigrations('postgres')
    writeConfig(`export const createConfig = async () => ({ port: 4002 })`)

    assert.deepEqual(await resolve(), { engine: 'postgres' })
    assert.ok(existsSync(join(unitDir, 'db', 'postgres', '0001-init.sql')))
  })

  test('a createConfig that throws falls back to the migrations directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => { throw new Error('DATABASE_URL is not set') }`
    )

    assert.deepEqual(await resolve(), {
      engine: 'sqlite',
      sqliteExtensions: [VEC0],
    })
  })

  test('a createConfig that throws in a project with no database is not a build failure', async () => {
    writeConfig(
      `export const createConfig = async () => { throw new Error('DATABASE_URL is not set') }`
    )

    assert.equal(await resolve(), undefined)
  })

  test('both migration directories are refused', async () => {
    writeMigrations('sqlite')
    writeMigrations('postgres')

    await assert.rejects(resolve, /both db\/sqlite and db\/postgres migrations/)
  })

  test('both dialects in createConfig are refused', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: 'dev.db', postgresUrl: 'postgres://localhost:5432/app' })`
    )

    await assert.rejects(resolve, /both postgresUrl and sqliteDb/)
  })

  test('a generated coercion map travels with the database', async () => {
    writeMigrations('sqlite')
    mkdirSync(join(pikkuDir, 'db'), { recursive: true })
    writeFileSync(
      join(pikkuDir, 'db', 'coercion.gen.ts'),
      'export const coercionMap = {}',
      'utf-8'
    )

    const db = await resolve()
    assert.equal(db?.engine, 'sqlite')
    assert.match(db?.coercionImportPath ?? '', /coercion\.gen\.js$/)
  })

  test('a SQLite build ships sqlite-vec by default, with a manifest that embeds it', async () => {
    writeMigrations('sqlite')
    const db = await resolve()

    assert.deepEqual(db?.sqliteExtensions, [VEC0])
    assert.ok(existsSync(join(unitDir, 'sqlite-extensions', VEC0)))
    const manifest = readFileSync(
      join(unitDir, 'sqlite-extensions.gen.js'),
      'utf-8'
    )
    assert.match(
      manifest,
      new RegExp(
        `from './sqlite-extensions/${VEC0.replace('.', '\\.')}' with \\{ type: 'file' \\}`
      )
    )
    assert.match(manifest, new RegExp(`name: '${VEC0.replace('.', '\\.')}'`))
  })

  test('db.sqliteExtensions: [] ships none', async () => {
    writeMigrations('sqlite')
    assert.deepEqual(await resolve([]), { engine: 'sqlite' })
    assert.equal(existsSync(join(unitDir, 'sqlite-extensions')), false)
  })

  test('a Postgres build ships no SQLite extensions', async () => {
    writeMigrations('postgres')
    assert.deepEqual(await resolve(), { engine: 'postgres' })
    assert.equal(existsSync(join(unitDir, 'sqlite-extensions')), false)
  })

  test('an extension that cannot be resolved fails the build', async () => {
    writeMigrations('sqlite')
    await assert.rejects(
      resolve(['@not-installed/sqlite-nothing']),
      (error: Error) => {
        assert.match(error.message, /cannot be shipped in this build/)
        return true
      }
    )
  })
})
