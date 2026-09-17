import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveStandaloneDb } from './build-pipeline.js'

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

const resolve = () =>
  resolveStandaloneDb(projectDir, pikkuDir, unitDir, ['src'], silentLogger)

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

    assert.deepEqual(await resolve(), { engine: 'sqlite' })
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

    assert.deepEqual(await resolve(), { engine: 'sqlite' })
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
})
