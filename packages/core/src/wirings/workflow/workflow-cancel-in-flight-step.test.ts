/**
 * Repro (expected to FAIL on main): `cancelRun` does not tell a step that is
 * already executing that its run was cancelled.
 *
 * `cancelRun` (pikku-workflow-service.ts) marks the run and unwinds it through
 * `cancelAndUnwind`, but nothing reaches the step function that is mid-flight:
 * its wire carries no AbortSignal (see `buildWorkflowStepWire` in
 * workflow-wire.ts), and the step-lease renewal's own AbortController
 * (workflow-step-lease.ts) is not exposed to step code either. The step keeps
 * going and its durable side effects land after the cancel. Compensation can
 * undo them afterwards, but only for steps that declare `compensate`, and only
 * after the late write has already been visible.
 *
 * The run itself is safe: its `cancelled` status holds after the late step
 * returns or throws. What is missing is only a way for step code to stop early.
 *
 * Fixture provenance: derived from a production-shaped run in a downstream app,
 * anonymized. Shape kept (times relative to run creation): a queued, non-inline
 * two-step run; step 1 succeeded at +0.5s; step 2 started at +0.6s; the run was
 * cancelled at +4.5s; step 2 still wrote its result (and the app's own status
 * rows) at +16.3s, ~12s after the cancel. Names are generic. In the test the
 * cancel arrives from inside the step, as in workflow-inline-cancel.test.ts, so
 * it lands deterministically while the step is in flight.
 *
 * Expected: some AbortSignal reachable from the step's wire is aborted once the
 * run is cancelled, so a step can check it before a durable write. The test
 * looks for one on `wire`, `wire.workflowStep` and `wire.workflow` without
 * prescribing its name.
 */
import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'

let h: QueuedWorkflowHarness

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
})

const findAbortSignal = (wire: any): AbortSignal | undefined => {
  for (const holder of [wire, wire?.workflowStep, wire?.workflow]) {
    if (!holder || typeof holder !== 'object') continue
    for (const value of Object.values(holder)) {
      if (value instanceof AbortSignal) return value
    }
  }
  return undefined
}

describe('cancelling a run while one of its steps is executing', () => {
  for (const queued of [true, false]) {
    test(
      `${queued ? 'queued' : 'inline'} step: the step is told its run was cancelled`,
      { todo: 'a step wire carries no cancel signal' },
      async () => {
        /** What the step "wrote" after the cancel landed, as the app saw it. */
        const lateWrites: string[] = []
        let sawSignal: AbortSignal | undefined

        h.register('fetchProfile', h.ok({ profile: 'p' }))
        h.register('detectLinks', {
          queued,
          forward: async (_data, wire) => {
            // The cancel arrives while this step is in flight.
            await h.ws.cancelRun(wire.workflowStep.runId, h.rpc as never)

            sawSignal = findAbortSignal(wire)
            if (!sawSignal?.aborted) {
              // A step with no signal to check performs its durable write.
              lateWrites.push('linksStatus=done')
            }
            return { links: 1 }
          },
        })
        h.defineDsl('detectLinksWorkflow', async (workflow) => {
          await workflow.do('Fetch profile', 'fetchProfile', {})
          await workflow.do('Detect links', 'detectLinks', {})
          return { done: true }
        })

        const runId = await h.start('detectLinksWorkflow')
        const run = await h.run(runId)

        // Guards the assertion below: the cancel did land.
        assert.equal(run.status, 'cancelled')
        assert.ok(
          sawSignal instanceof AbortSignal,
          'the step wire carries no AbortSignal, so step code has no way to learn the run was cancelled'
        )
        assert.equal(sawSignal.aborted, true, 'the signal was not aborted')
        assert.deepEqual(lateWrites, [])
      }
    )
  }
})
