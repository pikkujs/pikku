import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'

import { KyselyVirtualUserScheduleStore } from './kysely-virtual-user-schedule-store.js'
import { SerializePlugin } from './serialize-plugin.js'
import { applyPikkuSchemas, virtualUserScheduleSchema } from './schema/index.js'
import type { KyselyPikkuDB } from './kysely-tables.js'

// With the plugin, because most projects in this package run with it and it is
// the harder case: it deserialises columns the store has already stringified.
const withPlugin = () =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })

const bare = () =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })

const HOUR = 60 * 60 * 1000

describe('KyselyVirtualUserScheduleStore', () => {
  let db: Kysely<KyselyPikkuDB>
  let store: KyselyVirtualUserScheduleStore

  beforeEach(async () => {
    db = withPlugin()
    await applyPikkuSchemas(db, [virtualUserScheduleSchema])
    store = new KyselyVirtualUserScheduleStore(db)
  })

  test('a persona given a cadence is not running until someone says so', async () => {
    const written = await store.set({ persona: 'guest' })
    assert.equal(written.enabled, false)
    assert.deepEqual(await store.due(new Date(Date.now() + 1000)), [])
    assert.equal((await store.get('guest'))?.enabled, false)
  })

  test('a schedule written without an interval gets one, sparse by default', async () => {
    const written = await store.set({ persona: 'guest' })
    assert.ok(written.minIntervalMs >= HOUR)
    assert.ok(written.maxIntervalMs >= written.minIntervalMs)
    const stored = await store.get('guest')
    assert.equal(stored?.minIntervalMs, written.minIntervalMs)
    assert.equal(stored?.maxIntervalMs, written.maxIntervalMs)
  })

  test('setting one field leaves the rest of the schedule alone', async () => {
    await store.set({
      persona: 'guest',
      enabled: true,
      disposition: 'adversarial',
      goals: ['book a room'],
      budget: { steps: 40 },
      minIntervalMs: HOUR,
      maxIntervalMs: 2 * HOUR,
    })
    await store.set({ persona: 'guest', enabled: false })

    const stored = await store.get('guest')
    assert.equal(stored?.enabled, false)
    assert.equal(stored?.disposition, 'adversarial')
    assert.deepEqual(stored?.goals, ['book a room'])
    assert.deepEqual(stored?.budget, { steps: 40 })
    assert.equal(stored?.minIntervalMs, HOUR)
  })

  test('only enabled personas whose time has come come back as due', async () => {
    const now = new Date()
    await store.set({
      persona: 'due',
      enabled: true,
      nextRunAt: new Date(now.getTime() - HOUR),
    })
    await store.set({
      persona: 'later',
      enabled: true,
      nextRunAt: new Date(now.getTime() + HOUR),
    })
    await store.set({
      persona: 'off',
      enabled: false,
      nextRunAt: new Date(now.getTime() - HOUR),
    })

    assert.deepEqual(
      (await store.due(now)).map((row) => row.persona),
      ['due']
    )
  })

  test('claiming pushes the persona out of the due list', async () => {
    const now = new Date()
    await store.set({
      persona: 'guest',
      enabled: true,
      nextRunAt: new Date(now.getTime() - HOUR),
    })
    await store.claim('guest', {
      nextRunAt: new Date(now.getTime() + HOUR),
      runId: 'run-1',
      at: now,
    })

    assert.deepEqual(await store.due(now), [])
    const stored = await store.get('guest')
    assert.equal(stored?.lastRunId, 'run-1')
    assert.equal(stored?.lastRunAt?.getTime(), now.getTime())
  })

  test('the claim written before a run starts does not blank the last run', async () => {
    const now = new Date()
    await store.set({ persona: 'guest', enabled: true })
    await store.claim('guest', { nextRunAt: now, runId: 'run-1', at: now })
    await store.claim('guest', {
      nextRunAt: new Date(now.getTime() + HOUR),
      runId: null,
      at: now,
    })

    assert.equal((await store.get('guest'))?.lastRunId, 'run-1')
  })

  test('a cadence survives a store with no serialize plugin', async () => {
    const plainDb = bare()
    await applyPikkuSchemas(plainDb, [virtualUserScheduleSchema])
    const plain = new KyselyVirtualUserScheduleStore(plainDb)
    await plain.set({
      persona: 'guest',
      enabled: true,
      goals: ['book a room'],
      budget: { steps: 40, duration: '30m' },
      minIntervalMs: HOUR,
      maxIntervalMs: 2 * HOUR,
    })

    const stored = await plain.get('guest')
    assert.equal(stored?.enabled, true)
    assert.deepEqual(stored?.goals, ['book a room'])
    assert.deepEqual(stored?.budget, { steps: 40, duration: '30m' })
    assert.ok(stored?.nextRunAt instanceof Date)
  })

  test('a persona can be taken off the clock entirely', async () => {
    await store.set({ persona: 'guest', enabled: true })
    await store.remove('guest')
    assert.equal(await store.get('guest'), null)
    assert.deepEqual(await store.list(), [])
  })
})
