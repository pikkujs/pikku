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
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { createPristineOpener } from './pristine-snapshot.js'
import { writeSourceMigrations, type ResolvedDb } from '../local-db.js'

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
    const first = await openPristineDatabase(boot)
    await first.exec('CREATE TABLE only_in_first (id int)')
    const second = await openPristineDatabase(boot)
    await second.exec('CREATE TABLE only_in_second (id int)')
    const third = await openPristineDatabase(boot)

    assert.deepEqual(loads, [false, true, true])
    assert.deepEqual(await tables(second), ['only_in_second'])
    assert.deepEqual(await tables(third), [])
    assert.equal(statSync(snapshotPath()).mode & 0o777, 0o600)
    await Promise.all([first.close(), second.close(), third.close()])
  })

  test('a snapshot that does not load is replaced by a fresh boot', async () => {
    let attempts = 0
    const openPristineDatabase = createPristineOpener()
    const db = await openPristineDatabase(async (loadDataDir) => {
      attempts++
      if (loadDataDir) throw new Error('damaged')
      return boot()
    })
    assert.equal(attempts, 2)
    assert.deepEqual(await tables(db), [])
    await db.close()
  })

  test('a new process starts from the copy on disk', async () => {
    loads.length = 0
    const db = await createPristineOpener()(boot)
    assert.deepEqual(loads, [true])
    assert.deepEqual(await tables(db), [])
    await db.close()
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
