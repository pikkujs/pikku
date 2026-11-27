import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isRunCancelled,
  isRunClosedToSteps,
  isRunSettled,
  isRunStopped,
  WORKFLOW_END_STATES,
} from './workflow-constants.js'
import { buildRunTimeline, reconstructFinalState } from './run-timeline.js'
import { runningStepLease } from './workflow-step-lease.js'
import { planUnwind } from './workflow-unwind-plan.js'

describe('the cancelling statuses', () => {
  test('a cancelling run is cancelled, stopped and closed to steps, but not ended', () => {
    assert.equal(isRunCancelled({ status: 'cancelling' }), true)
    assert.equal(isRunStopped('cancelling'), true)
    assert.equal(isRunClosedToSteps('cancelling'), true)
    assert.equal(isRunSettled('cancelling'), false)
    assert.equal(WORKFLOW_END_STATES.has('cancelling'), false)
  })

  test('a cancelling step holds an unwind open', () => {
    const now = new Date()
    const plan = planUnwind({
      records: [
        {
          stepName: 'charge',
          rpcName: 'charge',
          status: 'cancelling',
          createdAt: now,
          updatedAt: now,
        },
      ],
      skip: new Set(),
      hasCompensation: () => true,
      isChildWorkflow: () => false,
    })

    assert.equal(plan.forwardInFlight, true)
    assert.equal(plan.settled, false)
  })

  test('a cancelling step is held or lost by its lease, as a running one is', () => {
    const lease = (ms: number) =>
      runningStepLease({
        status: 'cancelling',
        leaseExpiresAt: new Date(Date.now() + ms),
      })

    assert.equal(lease(60_000), 'held')
    assert.equal(lease(-1), 'lapsed')
  })

  test('a run with a cancelling step is still running on its timeline', () => {
    const now = new Date()
    const timeline = buildRunTimeline([
      {
        stepId: 'one',
        stepName: 'charge',
        status: 'cancelling',
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
        runningAt: now,
      },
    ])

    assert.equal(reconstructFinalState(timeline).phase, 'running')
  })
})
