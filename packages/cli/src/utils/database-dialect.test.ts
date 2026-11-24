import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { detectDatabaseDialect } from './database-dialect.js'

const scratchRoot = () => {
  const dir = join(import.meta.dir, '../..', '.tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

const logger = { debug: () => {} }

let projectDir: string

const writeConfig = (body: string) => {
  mkdirSync(join(projectDir, 'src'), { recursive: true })
  writeFileSync(join(projectDir, 'src', 'config.js'), body, 'utf-8')
}

const writeMigrations = (engine: 'sqlite' | 'postgres' | 'mysql') => {
  const dir = join(projectDir, 'db', engine)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '0001-init.sql'), 'select 1;', 'utf-8')
}

const detect = (subject?: string) =>
  detectDatabaseDialect(projectDir, ['src'], logger, subject)

beforeEach(() => {
  projectDir = mkdtempSync(join(scratchRoot(), 'pikku-database-dialect-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('detectDatabaseDialect', () => {
  test('a project with no database has no dialect', async () => {
    assert.equal(await detect(), undefined)
  })

  test('sqlite from the migrations directory', async () => {
    writeMigrations('sqlite')
    assert.equal(await detect(), 'sqlite')
  })

  test('postgres from the migrations directory', async () => {
    writeMigrations('postgres')
    assert.equal(await detect(), 'postgres')
  })

  test('sqlite from createConfig alone', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: 'x.db' })`
    )
    assert.equal(await detect(), 'sqlite')
  })

  test('postgres from createConfig wins over a sqlite directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => ({ postgresUrl: 'postgres://localhost/app' })`
    )
    assert.equal(await detect(), 'postgres')
  })

  test('mysql from the migrations directory', async () => {
    writeMigrations('mysql')
    assert.equal(await detect(), 'mysql')
  })

  test('two migration directories are refused, naming the subject', async () => {
    writeMigrations('sqlite')
    writeMigrations('postgres')
    await assert.rejects(
      detect('pikku dev'),
      /both db\/sqlite and db\/postgres migrations, so pikku dev cannot tell/
    )
  })

  test('two dialects in createConfig are refused', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: 'x.db', postgresUrl: 'postgres://localhost/app' })`
    )
    await assert.rejects(detect(), /both postgresUrl and sqliteDb/)
  })

  test('a createConfig that throws falls back to the directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => { throw new Error('x') }`
    )
    assert.equal(await detect(), 'sqlite')
  })
})
