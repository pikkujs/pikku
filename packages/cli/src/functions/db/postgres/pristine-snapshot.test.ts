import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { createPristineOpener, userCacheDir } from './pristine-snapshot.js'
import {
  desiredRuntimeSchema,
  writeSourceMigrations,
  type ResolvedDb,
} from '../local-db.js'

const scratch = join(import.meta.dirname, '..', '..', '..', '..', '.tmp')

describe('the pristine PGlite snapshot', () => {
  let root = ''
  const cacheHome = process.env.XDG_CACHE_HOME
  const server = process.env.PIKKU_SCRATCH_DATABASE_URL

  const loads: boolean[] = []
  const boot = async (loadDataDir?: Blob) => {
    loads.push(!!loadDataDir)
    const db = new PGlite(loadDataDir ? { loadDataDir } : {})
    await db.waitReady
    return db
  }

  const bootBare = () => boot()

  const seedSnapshot = async () => {
    await (await createPristineOpener()(boot, bootBare)).close()
    loads.length = 0
  }

  const tables = async (db: PGlite) =>
    (
      await db.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
      )
    ).rows.map((row) => row.tablename)

  before(() => {
    mkdirSync(scratch, { recursive: true })
    root = mkdtempSync(join(scratch, 'pristine-snapshot-'))
    process.env.XDG_CACHE_HOME = join(root, 'cache')
    delete process.env.PIKKU_SCRATCH_DATABASE_URL
  })

  after(() => {
    if (cacheHome === undefined) delete process.env.XDG_CACHE_HOME
    else process.env.XDG_CACHE_HOME = cacheHome
    if (server !== undefined) process.env.PIKKU_SCRATCH_DATABASE_URL = server
    rmSync(root, { recursive: true, force: true })
  })

  const snapshotPath = () => {
    const dir = join(root, 'cache', 'pikku')
    const [file] = readdirSync(dir)
    return join(dir, file!)
  }

  test('later databases start from it, and share nothing written since', async () => {
    const openPristineDatabase = createPristineOpener()
    const first = await openPristineDatabase(boot, bootBare)
    await first.exec('CREATE TABLE only_in_first (id int)')
    const second = await openPristineDatabase(boot, bootBare)
    await second.exec('CREATE TABLE only_in_second (id int)')
    const third = await openPristineDatabase(boot, bootBare)

    assert.deepEqual(loads, [false, true, true, true])
    assert.deepEqual(await tables(second), ['only_in_second'])
    assert.deepEqual(await tables(third), [])
    assert.equal(statSync(snapshotPath()).mode & 0o777, 0o600)
    await Promise.all([first.close(), second.close(), third.close()])
  })

  test('a snapshot that does not load is replaced by a new one', async () => {
    await seedSnapshot()
    let attempts = 0
    const db = await createPristineOpener()(async (loadDataDir) => {
      attempts++
      if (attempts === 1) throw new Error('damaged')
      return boot(loadDataDir)
    }, bootBare)
    assert.equal(attempts, 2)
    assert.deepEqual(loads, [false, true])
    assert.deepEqual(await tables(db), [])
    await db.close()
  })

  test('a relative XDG_CACHE_HOME never places the cache in the project', () => {
    const configured = process.env.XDG_CACHE_HOME
    try {
      process.env.XDG_CACHE_HOME = '.cache'
      assert.equal(userCacheDir(), join(homedir(), '.cache'))
    } finally {
      process.env.XDG_CACHE_HOME = configured
    }
  })

  test('a new process starts from the copy on disk', async () => {
    await seedSnapshot()
    const db = await createPristineOpener()(boot, bootBare)
    assert.deepEqual(loads, [true])
    assert.deepEqual(await tables(db), [])
    await db.close()
  })

  test('what a project extension writes at boot stays out of the snapshot', async () => {
    process.env.XDG_CACHE_HOME = join(root, 'extension-cache')
    const extensionDir = join(root, 'node_modules', '@probe', 'boot-writer')
    mkdirSync(extensionDir, { recursive: true })
    writeFileSync(
      join(extensionDir, 'package.json'),
      JSON.stringify({
        name: '@probe/boot-writer',
        type: 'module',
        main: 'index.js',
      })
    )
    writeFileSync(
      join(extensionDir, 'index.js'),
      `export const bootWriter = {
        name: 'bootWriter',
        setup: async (pg) => ({
          init: async () => {
            await pg.exec('CREATE TABLE IF NOT EXISTS extension_probe (id int)')
          },
        }),
      }`
    )
    try {
      await desiredRuntimeSchema(
        {
          dialect: 'postgres',
          mode: 'url',
          connectionString: 'postgres://unused@127.0.0.1:1/unused',
          rootDir: root,
          pgliteExtensions: ['@probe/boot-writer'],
        } as unknown as ResolvedDb,
        process.cwd(),
        [],
        { error: (message: string) => assert.fail(message) }
      )
      const other = await createPristineOpener()(boot, bootBare)
      assert.deepEqual(await tables(other), [])
      await other.close()
    } finally {
      process.env.XDG_CACHE_HOME = join(root, 'cache')
    }
  })

  test('a replay is repeated once a migration changes', async () => {
    const migrationsDir = join(root, 'migrations')
    mkdirSync(migrationsDir)
    const file = join(migrationsDir, '0001-a.sql')
    writeFileSync(file, 'CREATE TABLE a (id integer);\n')
    const resolved = {
      dialect: 'postgres',
      mode: 'url',
      connectionString: 'postgres://unused@127.0.0.1:1/unused',
      migrationsDir,
      rootDir: root,
      pgliteExtensions: [],
    } as unknown as ResolvedDb
    const source = {
      name: 'probe',
      desired: {
        tables: new Map([['a', new Map()]]),
        sql: 'CREATE TABLE a (id integer);',
      },
    } as any

    assert.deepEqual(
      (await writeSourceMigrations(resolved, [source])).upToDate,
      ['probe']
    )

    writeFileSync(file, 'CREATE TABLE b (id integer);\n')
    assert.equal(
      (await writeSourceMigrations(resolved, [source])).written.length,
      1
    )
  })
})
