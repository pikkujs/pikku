import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type {
  VirtualUserRunRecord,
  VirtualUserRunStore,
} from './virtual-user-run-store.js'
import type {
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from './virtual-user-schedule-store.js'
import {
  isDue,
  nextRunAt,
  STALE_RUN_AFTER_MS,
  tickVirtualUserSchedules,
} from './virtual-user-schedule.js'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-01-01T12:00:00.000Z')

const schedule = (
  over: Partial<VirtualUserScheduleRecord> = {}
): VirtualUserScheduleRecord => ({
  persona: 'guest',
  enabled: true,
  disposition: 'realistic',
  goals: [],
  budget: null,
  minIntervalMs: HOUR,
  maxIntervalMs: 3 * HOUR,
  nextRunAt: new Date(NOW.getTime() - 1000),
  lastRunId: null,
  lastRunAt: null,
  ...over,
})

const run = (
  over: Partial<VirtualUserRunRecord> = {}
): VirtualUserRunRecord => ({
  runId: 'run-1',
  persona: 'guest',
  disposition: 'realistic',
  seed: 1,
  status: 'completed',
  goals: [],
  memory: {},
  findings: [],
  intents: [],
  tally: null,
  stoppedBy: null,
  error: null,
  startedBy: null,
  createdAt: NOW,
  finishedAt: null,
  ...over,
})

const stores = (
  schedules: VirtualUserScheduleRecord[],
  runs: VirtualUserRunRecord[]
) => {
  const claims: {
    persona: string
    from: Date
    nextRunAt: Date
    runId: string | null
  }[] = []
  const failed: { runId: string; error: string }[] = []
  const scheduleStore = {
    // Copies, as every real store hands back: a caller holding the row object
    // itself would never see the value it read go stale underneath it.
    due: async (now: Date) =>
      schedules.filter((s) => isDue(s, now)).map((s) => ({ ...s })),
    // The row is the lock, so the fake enforces the same compare-and-set the
    // stores do: a claim lands only while the row still holds what was read.
    claim: async (persona, claim) => {
      const row = schedules.find((s) => s.persona === persona)
      if (!row || row.nextRunAt.getTime() !== claim.from.getTime()) {
        return false
      }
      row.nextRunAt = claim.nextRunAt
      if (claim.runId) {
        row.lastRunId = claim.runId
        row.lastRunAt = claim.at
      }
      claims.push({ persona, ...claim })
      return true
    },
  } as unknown as VirtualUserScheduleStore
  const runStore = {
    list: async ({ persona } = {}) =>
      runs.filter((r) => !persona || r.persona === persona),
    fail: async (runId: string, error: string) => {
      failed.push({ runId, error })
    },
  } as unknown as VirtualUserRunStore
  return { scheduleStore, runStore, claims, failed }
}

describe('virtual user schedule', () => {
  test('a disabled persona is never due, however overdue it looks', () => {
    const row = schedule({
      enabled: false,
      nextRunAt: new Date(NOW.getTime() - 1000 * HOUR),
    })
    assert.equal(isDue(row, NOW), false)
  })

  test('the next run lands somewhere inside the persona interval, not on the hour', () => {
    const row = schedule({ minIntervalMs: HOUR, maxIntervalMs: 5 * HOUR })
    const draws = [0, 0.25, 0.5, 0.99].map(
      (value) => nextRunAt(row, NOW, () => value).getTime() - NOW.getTime()
    )
    for (const gap of draws) {
      assert.ok(gap >= HOUR && gap <= 5 * HOUR, `outside the interval: ${gap}`)
    }
    assert.equal(new Set(draws).size, draws.length)
  })

  test('a fixed cadence is expressed by asking for the same bound twice', () => {
    const row = schedule({ minIntervalMs: HOUR, maxIntervalMs: HOUR })
    assert.equal(nextRunAt(row, NOW, () => 0.7).getTime() - NOW.getTime(), HOUR)
  })

  test('bounds the wrong way round read as a range rather than a negative gap', () => {
    const row = schedule({ minIntervalMs: 5 * HOUR, maxIntervalMs: HOUR })
    const gap = nextRunAt(row, NOW, () => 0).getTime() - NOW.getTime()
    assert.equal(gap, HOUR)
  })

  test('a due persona is dispatched and pushed out before the run starts', async () => {
    const { scheduleStore, runStore, claims } = stores([schedule()], [])
    const order: string[] = []
    const result = await tickVirtualUserSchedules({
      schedules: {
        ...scheduleStore,
        claim: async (persona, claim) => {
          order.push('claim')
          return await scheduleStore.claim(persona, claim)
        },
      } as VirtualUserScheduleStore,
      runs: runStore,
      now: NOW,
      random: () => 0.5,
      dispatch: async () => {
        order.push('dispatch')
        return 'run-new'
      },
    })

    assert.deepEqual(result.dispatched, [
      { persona: 'guest', runId: 'run-new' },
    ])
    assert.deepEqual(order, ['claim', 'dispatch', 'claim'])
    assert.ok(claims[0]!.nextRunAt.getTime() > NOW.getTime())
    assert.equal(claims.at(-1)!.runId, 'run-new')
  })

  test('a persona already acting is left alone rather than doubled up', async () => {
    const { scheduleStore, runStore, claims } = stores(
      [schedule()],
      [run({ status: 'running', createdAt: new Date(NOW.getTime() - 60_000) })]
    )
    let dispatched = 0
    const result = await tickVirtualUserSchedules({
      schedules: scheduleStore,
      runs: runStore,
      now: NOW,
      dispatch: async () => {
        dispatched++
        return 'run-new'
      },
    })

    assert.equal(dispatched, 0)
    assert.deepEqual(result.skipped, [
      { persona: 'guest', reason: 'in-flight' },
    ])
    assert.deepEqual(claims, [])
  })

  test('a run stranded by a restart is failed, not waited on forever', async () => {
    const { scheduleStore, runStore, failed } = stores(
      [schedule()],
      [
        run({
          status: 'running',
          createdAt: new Date(NOW.getTime() - STALE_RUN_AFTER_MS - 1),
        }),
      ]
    )
    const result = await tickVirtualUserSchedules({
      schedules: scheduleStore,
      runs: runStore,
      now: NOW,
      dispatch: async () => 'run-new',
    })

    assert.deepEqual(result.reaped, ['run-1'])
    assert.equal(failed.length, 1)
    assert.match(failed[0]!.error, /still running/)
    assert.deepEqual(result.dispatched, [
      { persona: 'guest', runId: 'run-new' },
    ])
  })

  test('a persona that will not start waits its interval instead of spinning', async () => {
    const { scheduleStore, runStore, claims } = stores([schedule()], [])
    const result = await tickVirtualUserSchedules({
      schedules: scheduleStore,
      runs: runStore,
      now: NOW,
      dispatch: async () => {
        throw new Error('no target')
      },
    })

    assert.deepEqual(result.dispatched, [])
    assert.deepEqual(result.skipped, [
      { persona: 'guest', reason: 'dispatch-failed' },
    ])
    assert.equal(claims.length, 1)
    assert.ok(claims[0]!.nextRunAt.getTime() >= NOW.getTime() + HOUR)
  })

  test('two ticks racing over one persona produce a single run', async () => {
    const row = schedule()
    const { scheduleStore, runStore } = stores([row], [])
    const dispatched: string[] = []
    const tick = () =>
      tickVirtualUserSchedules({
        schedules: scheduleStore,
        runs: runStore,
        now: NOW,
        random: () => 0.5,
        dispatch: async ({ persona }) => {
          const runId = `run-${dispatched.length + 1}`
          dispatched.push(persona)
          return runId
        },
      })

    // Both read the row while it is still due — the state two cron processes
    // are in the moment before either of them writes.
    const [first, second] = await Promise.all([tick(), tick()])

    assert.equal(dispatched.length, 1)
    const [won, lost] =
      first.dispatched.length > 0 ? [first, second] : [second, first]
    assert.equal(won.dispatched.length, 1)
    assert.deepEqual(lost.dispatched, [])
    assert.deepEqual(lost.skipped, [
      { persona: 'guest', reason: 'claimed-elsewhere' },
    ])
  })

  test('one persona failing does not stop the others from running', async () => {
    const { scheduleStore, runStore } = stores(
      [schedule({ persona: 'guest' }), schedule({ persona: 'admin' })],
      []
    )
    const result = await tickVirtualUserSchedules({
      schedules: scheduleStore,
      runs: runStore,
      now: NOW,
      dispatch: async ({ persona }) => {
        if (persona === 'guest') throw new Error('no target')
        return 'run-admin'
      },
    })

    assert.deepEqual(result.dispatched, [
      { persona: 'admin', runId: 'run-admin' },
    ])
    assert.deepEqual(result.skipped, [
      { persona: 'guest', reason: 'dispatch-failed' },
    ])
  })
})
