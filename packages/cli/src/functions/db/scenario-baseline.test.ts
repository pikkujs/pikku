import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import {
  captureScenarioBaseline,
  copyName,
  keepMatcher,
} from './scenario-baseline.js'
import { resolveDb, type ResolvedSqliteDb } from './local-db.js'

let runtimeCache: Awaited<ReturnType<typeof loadSqliteRuntime>>

const setup = (dbFile: string) => {
  const db = runtimeCache.open(dbFile)
  db.exec(`
    CREATE TABLE venue (venue_id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE booking (
      booking_id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL REFERENCES venue(venue_id)
    );
    CREATE TABLE session (session_id TEXT PRIMARY KEY, token TEXT NOT NULL);
    INSERT INTO venue VALUES ('v1', 'Seed venue');
    INSERT INTO booking VALUES ('b1', 'v1');
  `)
  db.close()
}

const rowsOf = (dbFile: string, table: string) => {
  const db = runtimeCache.open(dbFile)
  try {
    return db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all() as any[]
  } finally {
    db.close()
  }
}

describe('scenario baseline (sqlite)', () => {
  let dir: string
  let dbFile: string
  let resolved: ResolvedSqliteDb

  beforeEach(async () => {
    runtimeCache = await loadSqliteRuntime()
    dir = mkdtempSync(join(tmpdir(), 'pikku-scenario-baseline-'))
    mkdirSync(join(dir, 'db', 'sqlite'), { recursive: true })
    mkdirSync(join(dir, '.pikku-runtime'), { recursive: true })
    dbFile = join(dir, '.pikku-runtime', 'dev.db')
    setup(dbFile)
    resolved = resolveDb(
      { sqliteDb: '.pikku-runtime/dev.db' },
      dir,
      '.pikku',
      '.pikku-runtime'
    ) as ResolvedSqliteDb
    assert.equal(resolved.dialect, 'sqlite')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('restores rows a scenario added, removed and changed', async () => {
    const baseline = await captureScenarioBaseline(resolved)

    const db = runtimeCache.open(dbFile)
    db.exec(`
      INSERT INTO venue VALUES ('v2', 'Made by a scenario');
      DELETE FROM booking;
      UPDATE venue SET name = 'Renamed' WHERE venue_id = 'v1';
    `)
    db.close()

    await baseline.restore()

    assert.deepEqual(rowsOf(dbFile, 'venue'), [
      { venue_id: 'v1', name: 'Seed venue' },
    ])
    assert.deepEqual(rowsOf(dbFile, 'booking'), [
      { booking_id: 'b1', venue_id: 'v1' },
    ])
  })

  test('leaves kept tables alone', async () => {
    const baseline = await captureScenarioBaseline(resolved, {
      keep: ['session'],
    })
    assert.ok(!baseline.tables.includes('session'))

    const db = runtimeCache.open(dbFile)
    db.exec(`INSERT INTO session VALUES ('s1', 'signed-in')`)
    db.close()

    await baseline.restore()

    assert.deepEqual(rowsOf(dbFile, 'session'), [
      { session_id: 's1', token: 'signed-in' },
    ])
  })

  test('restores in any foreign-key order', async () => {
    const baseline = await captureScenarioBaseline(resolved)
    const db = runtimeCache.open(dbFile)
    db.exec(`
      DELETE FROM booking;
      DELETE FROM venue;
    `)
    db.close()

    await baseline.restore()

    assert.equal(rowsOf(dbFile, 'booking').length, 1)
    assert.equal(rowsOf(dbFile, 'venue').length, 1)
  })

  test('a feature layer survives a scenario rollback, and pops back to the seed', async () => {
    const baseline = await captureScenarioBaseline(resolved)

    const hook = runtimeCache.open(dbFile)
    hook.exec(
      `INSERT INTO venue VALUES ('v-feature', 'Built by a before hook')`
    )
    hook.close()
    await baseline.pushFeatureLayer()

    const scenario = runtimeCache.open(dbFile)
    scenario.exec(
      `INSERT INTO venue VALUES ('v-scenario', 'Built by a scenario')`
    )
    scenario.close()
    await baseline.restore()

    assert.deepEqual(
      rowsOf(dbFile, 'venue').map((row) => row.venue_id),
      ['v-feature', 'v1']
    )

    await baseline.popFeatureLayer()
    await baseline.restore()

    assert.deepEqual(
      rowsOf(dbFile, 'venue').map((row) => row.venue_id),
      ['v1']
    )
  })

  test('drop removes the copies of every layer', async () => {
    const baseline = await captureScenarioBaseline(resolved)
    await baseline.pushFeatureLayer()
    await baseline.drop()

    const db = runtimeCache.open(dbFile)
    const remaining = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'pikku_scenario_baseline__%'`
      )
      .all() as { name: string }[]
    db.close()
    assert.deepEqual(remaining, [])
  })

  test('refuses a postgresUrl on another host', async () => {
    await assert.rejects(
      () =>
        captureScenarioBaseline({
          dialect: 'postgres',
          mode: 'url',
          connectionString: 'postgres://pikku@db.example.com:5432/app',
        } as any),
      /other than this machine/
    )
  })

  test('allows a postgresUrl on this machine past the host check', async () => {
    await assert.rejects(
      () =>
        captureScenarioBaseline({
          dialect: 'postgres',
          mode: 'url',
          connectionString: 'postgres://pikku@localhost:5432/app',
        } as any),
      (error: any) => !/other than this machine/.test(error.message)
    )
  })

  test('refuses to run in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await assert.rejects(
        () => captureScenarioBaseline(resolved),
        /NODE_ENV=production/
      )
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previous
    }
  })
})

describe('copyName', () => {
  test('joins the parts when they fit', () => {
    assert.equal(copyName(['seed', 'public', 'venue']), 'seed__public__venue')
  })

  test('two long names that share a prefix do not collide', () => {
    const long = 'a'.repeat(80)
    const a = copyName(['seed', long + 'one'])
    const b = copyName(['seed', long + 'two'])
    assert.equal(a.length, 63)
    assert.equal(b.length, 63)
    assert.notEqual(a, b)
  })
})

describe('keepMatcher', () => {
  test('matches a bare name in any schema, and a qualified one only in its own', () => {
    const keep = keepMatcher(['Session', 'audit.event'])
    assert.equal(keep(null, 'session'), true)
    assert.equal(keep('public', 'SESSION'), true)
    assert.equal(keep('audit', 'event'), true)
    assert.equal(keep('public', 'event'), false)
    assert.equal(keep(null, 'event'), false)
  })
})
