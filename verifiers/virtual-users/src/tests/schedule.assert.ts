import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { runScheduledTask } from '@pikku/core/scheduler'

import { boot, HOUR } from './boot.js'

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
