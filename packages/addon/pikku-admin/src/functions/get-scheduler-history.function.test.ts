import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getSchedulerHistory } from './get-scheduler-history.function.js'

test('an app that wires no scheduler has no history rather than throwing', async () => {
  assert.deepEqual(
    await getSchedulerHistory.func(
      { schedulerService: undefined } as never,
      undefined as never,
      {} as never
    ),
    {}
  )
})

test('a wired scheduler is read through', async () => {
  const runs = {
    nightly: { nextRun: new Date(0), lastRun: null, history: [] },
  }
  assert.deepEqual(
    await getSchedulerHistory.func(
      { schedulerService: { getTaskRuns: async () => runs } } as never,
      undefined as never,
      {} as never
    ),
    runs
  )
})
