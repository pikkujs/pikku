import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import {
  applyPikkuSchemas,
  KyselyVirtualUserRunStore,
  KyselyVirtualUserScheduleStore,
  SerializePlugin,
  virtualUserSchema,
  virtualUserScheduleSchema,
} from '@pikku/kysely'
import { runScheduledTask } from '@pikku/core/scheduler'

import '../../.pikku/pikku-bootstrap.gen.js'
import { createSingletonServices } from '../services.js'
import { createConfig } from '../config.js'

const HOUR = 60 * 60 * 1000

/**
 * A real project, real stores on a real (in-memory) SQLite, and the scheduler
 * wiring a project writes. The only fake is the queue, because what is being
 * checked ends where a run is handed to the queue: that a due virtual user becomes a
 * recorded run, once, and that nothing slips past the production refusal or the
 * scope gate on the way.
 */
const boot = async (nodeEnv: string) => {
  const db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [virtualUserSchema, virtualUserScheduleSchema])
  const virtualUserRunStore = new KyselyVirtualUserRunStore(db)
  const virtualUserScheduleStore = new KyselyVirtualUserScheduleStore(db)
  await virtualUserRunStore.init()
  await virtualUserScheduleStore.init()

  const queued: { queue: string; job: any; options: any }[] = []
  const queueService = {
    add: async (queue: string, job: unknown, options: unknown) => {
      queued.push({ queue, job, options })
      return `job-${queued.length}`
    },
  } as any

  await createSingletonServices({ ...(await createConfig()), nodeEnv } as any, {
    virtualUserRunStore,
    virtualUserScheduleStore,
    queueService,
  })
  return { virtualUserRunStore, virtualUserScheduleStore, queued }
}

const dueNow = (virtualUserId = 'guest') => ({
  virtualUserId,
  enabled: true,
  minIntervalMs: HOUR,
  maxIntervalMs: 3 * HOUR,
  nextRunAt: new Date(Date.now() - 1000),
})

describe('virtual users on a schedule', () => {
  let app: Awaited<ReturnType<typeof boot>>

  describe('outside production', () => {
    beforeEach(async () => {
      app = await boot('staging')
    })

    test('a due virtual user becomes one recorded run, queued, and is pushed out', async () => {
      await app.virtualUserScheduleStore.set(dueNow())

      await runScheduledTask({ name: 'virtualUsers' })

      const runs = await app.virtualUserRunStore.list({
        virtualUserId: 'guest',
      })
      assert.equal(runs.length, 1, 'one run is recorded')
      assert.equal(app.queued.length, 1, 'and handed to the queue')
      assert.equal(app.queued[0]!.queue, 'pikku-virtual-user-runs')
      assert.equal(app.queued[0]!.options.attempts, 1)
      assert.equal(app.queued[0]!.job.runId, runs[0]!.runId)

      const row = await app.virtualUserScheduleStore.get('guest')
      assert.equal(row!.lastRunId, runs[0]!.runId)
      assert.ok(
        row!.nextRunAt.getTime() >= Date.now() + HOUR - 5000,
        'the next run is at least the minimum interval away'
      )
    })

    test('a second tick straight after does not run the virtual user again', async () => {
      await app.virtualUserScheduleStore.set(dueNow())

      await runScheduledTask({ name: 'virtualUsers' })
      await runScheduledTask({ name: 'virtualUsers' })

      assert.equal(
        (await app.virtualUserRunStore.list({ virtualUserId: 'guest' })).length,
        1
      )
      assert.equal(app.queued.length, 1)
    })

    test('a virtual user that is not due yet is left alone', async () => {
      await app.virtualUserScheduleStore.set({
        ...dueNow(),
        nextRunAt: new Date(Date.now() + HOUR),
      })

      await runScheduledTask({ name: 'virtualUsers' })

      assert.equal((await app.virtualUserRunStore.list()).length, 0)
      assert.equal(app.queued.length, 0)
    })

    test('a disabled virtual user never runs, however overdue', async () => {
      await app.virtualUserScheduleStore.set({ ...dueNow(), enabled: false })

      await runScheduledTask({ name: 'virtualUsers' })

      assert.equal((await app.virtualUserRunStore.list()).length, 0)
      assert.equal(app.queued.length, 0)
    })

    test('a tick without the platform session cannot start a run', async () => {
      await app.virtualUserScheduleStore.set(dueNow())

      await runScheduledTask({ name: 'virtualUsersWithoutSession' })

      assert.equal(
        (await app.virtualUserRunStore.list()).length,
        0,
        'the virtualUser:run scope is what lets a tick start a run'
      )
      assert.equal(app.queued.length, 0)
    })
  })

  describe('in production', () => {
    beforeEach(async () => {
      app = await boot('production')
    })

    test('a due virtual user is not run, and waits its interval instead of spinning', async () => {
      await app.virtualUserScheduleStore.set(dueNow())

      await runScheduledTask({ name: 'virtualUsers' })

      assert.equal((await app.virtualUserRunStore.list()).length, 0)
      assert.equal(app.queued.length, 0)
      const row = await app.virtualUserScheduleStore.get('guest')
      assert.ok(
        row!.nextRunAt.getTime() >= Date.now() + HOUR - 5000,
        'the refused virtual user is pushed out, so the next tick does not retry at once'
      )
    })
  })
})
