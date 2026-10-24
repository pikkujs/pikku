import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildContributorPlatform,
  detectDatabaseDialect,
} from './contributor-platform.js'

const logger = { debug: () => {} }

let projectDir: string
let pikkuDir: string

const writeConfig = (body: string) => {
  mkdirSync(join(projectDir, 'src'), { recursive: true })
  writeFileSync(join(projectDir, 'src', 'config.js'), body, 'utf-8')
}

const writeMigrations = (engine: 'sqlite' | 'postgres' | 'mysql') => {
  const dir = join(projectDir, 'db', engine)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '0001-init.sql'), 'select 1;', 'utf-8')
}

const writeCoercion = (body: string) => {
  mkdirSync(join(pikkuDir, 'db'), { recursive: true })
  writeFileSync(join(pikkuDir, 'db', 'coercion.gen.ts'), body, 'utf-8')
}

const build = (
  extra: Partial<Parameters<typeof buildContributorPlatform>[0]> = {}
) =>
  buildContributorPlatform({
    projectDir,
    pikkuDir,
    srcDirectories: ['src'],
    logger,
    serviceNames: [],
    ...extra,
  })

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'pikku-contributor-platform-'))
  pikkuDir = join(projectDir, '.pikku')
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('buildContributorPlatform', () => {
  test('a project with no database has no db and the given service facts', async () => {
    const platform = await build({
      serviceNames: ['queueService', 'emailService'],
      runtimeServices: ['logger'],
    })
    assert.deepEqual(platform, {
      serviceNames: ['queueService', 'emailService'],
      needsQueue: true,
      needsWorkflow: false,
      needsAgent: false,
      runtimeServices: ['logger'],
    })
  })

  test('needs follow the service names unless the caller overrides them', async () => {
    const derived = await build({
      serviceNames: ['workflowService', 'agentRunner'],
    })
    assert.equal(derived.needsWorkflow, true)
    assert.equal(derived.needsAgent, true)
    assert.equal(derived.needsQueue, false)

    const overridden = await build({
      serviceNames: [],
      needs: { queue: true },
    })
    assert.equal(overridden.needsQueue, true)
  })

  test('runtimeServices is left out when the adapter gives none', async () => {
    assert.equal('runtimeServices' in (await build()), false)
  })

  test('sqlite from the migrations directory', async () => {
    writeMigrations('sqlite')
    assert.deepEqual((await build()).db, { engine: 'sqlite' })
  })

  test('postgres from the migrations directory', async () => {
    writeMigrations('postgres')
    assert.deepEqual((await build()).db, { engine: 'postgres' })
  })

  test('sqlite from createConfig alone', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: 'x.db' })`
    )
    assert.deepEqual((await build()).db, { engine: 'sqlite' })
  })

  test('postgres from createConfig wins over a sqlite directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => ({ postgresUrl: 'postgres://localhost/app' })`
    )
    assert.deepEqual((await build()).db, { engine: 'postgres' })
  })

  test('mysql is a database but not a contributor engine', async () => {
    writeMigrations('mysql')
    assert.equal((await build()).db, undefined)
    assert.equal(
      await detectDatabaseDialect(projectDir, ['src'], logger),
      'mysql'
    )
  })

  test('two migration directories are refused, naming the subject', async () => {
    writeMigrations('sqlite')
    writeMigrations('postgres')
    await assert.rejects(
      build({ subject: 'pikku dev' }),
      /both db\/sqlite and db\/postgres migrations, so pikku dev cannot tell/
    )
  })

  test('two dialects in createConfig are refused', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: 'x.db', postgresUrl: 'postgres://localhost/app' })`
    )
    await assert.rejects(build(), /both postgresUrl and sqliteDb/)
  })

  test('a createConfig that throws falls back to the directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => { throw new Error('x') }`
    )
    assert.deepEqual((await build()).db, { engine: 'sqlite' })
  })

  test('the coercion map travels with the engine', async () => {
    writeMigrations('postgres')
    writeCoercion(
      `export const coercionMap = {"todo":{"due_at":"date","done":"bool"}} as const`
    )
    assert.deepEqual((await build()).db, {
      engine: 'postgres',
      coercionMap: { todo: { due_at: 'date', done: 'bool' } },
    })
  })

  test('an empty coercion map and an absent file both leave coercionMap out', async () => {
    writeMigrations('sqlite')
    assert.equal('coercionMap' in (await build()).db!, false)
    writeCoercion(`export const coercionMap = {} as const`)
    assert.equal('coercionMap' in (await build()).db!, false)
  })

  test('a coercion map without a database is not reported', async () => {
    writeCoercion(`export const coercionMap = {"a":{"b":"json"}} as const`)
    assert.equal((await build()).db, undefined)
  })
})
