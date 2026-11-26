import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'

let h: QueuedWorkflowHarness

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
})

/** One pass over rows that have all been quiet since before it. */
const recover = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5))
  await h.ws.recoverWorkflows({ stalledAfterMs: 1, undispatchedAfterMs: 1 })
  await h.pump()
}

describe('InMemoryWorkflowService recovery', () => {
  test('a settled child hands its output to the parent it never told', async () => {
    h.register('childWork', h.ok({ pages: 3 }))
    h.register('childWorkflow', h.ok())
    h.defineDsl('childWorkflow', (w) => w.do('Child work', 'childWork', {}))
    h.defineDsl('parentWorkflow', (w) => w.do('Run child', 'childWorkflow', {}))

    const internals = h.ws as any
    const handBack = internals.onChildWorkflowCompleted
    internals.onChildWorkflowCompleted = async () => {}
    const runId = await h.start('parentWorkflow')
    internals.onChildWorkflowCompleted = handBack
    assert.equal((await h.run(runId)).status, 'running')

    await recover()

    assert.equal((await h.run(runId)).status, 'completed')
    assert.deepEqual((await h.run(runId)).output, { pages: 3 })
    assert.equal(h.log.filter((l) => l === 'do:childWork').length, 1)
  })

  test('a decided approval whose resume was lost runs on', async () => {
    h.register('pay', h.ok({ paid: true }))
    h.defineDsl('payoutWorkflow', async (w) => {
      await w.approval('Approve payout', {
        approvers: 'any',
        schema: {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value: unknown) => ({ value }),
          },
        },
      })
      return w.do('Pay', 'pay', {})
    })
    const runId = await h.start('payoutWorkflow')

    await recover()
    assert.equal((await h.run(runId)).status, 'suspended')

    h.dropWhen = () => true
    await h.ws.approveStep(runId, 'Approve payout', { ok: true })
    await h.pump()
    h.dropWhen = undefined
    await recover()

    assert.equal((await h.run(runId)).status, 'completed')
    assert.deepEqual(h.log, ['do:pay'])
  })

  test('a run left compensating finishes its unwind', async () => {
    h.register('reserve', h.undoable())
    h.register('charge', h.boom('card declined'))
    h.defineDsl('bookingWorkflow', async (w) => {
      await w.do('Reserve', 'reserve', {})
      await w.do('Charge', 'charge', {}, { retries: 0 })
    })
    let undoSent = false
    h.dropWhen = (job) => {
      if (job.data.rpcName === 'reserve:compensate') {
        undoSent = true
        return false
      }
      return undoSent && job.data.stepName === undefined
    }
    const runId = await h.start('bookingWorkflow')
    assert.equal((await h.run(runId)).status, 'compensating')

    h.dropWhen = undefined
    await recover()

    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:reserve'])
  })

  for (const retries of [2, 0]) {
    test(`a lapsed step parked on a child is not claimed again (retries ${retries})`, async () => {
      const runId = await h.ws.createRun('flow', {}, false, 'hash', {
        type: 'test',
      } as never)
      const step = await h.ws.insertStepState(
        runId,
        'child',
        'flow',
        {},
        { retries }
      )
      await h.ws.setStepRunning(step.stepId)
      await h.ws.setStepChildRunId(step.stepId, 'child-1')
      await h.ws.refreshStepLease(step.stepId, -1_000)

      const claimed = await (h.ws as any).claimStepForExecution(
        runId,
        'child',
        'flow',
        60_000
      )

      assert.equal(claimed, null)
      const after = await h.ws.getStepState(runId, 'child')
      assert.equal(after.status, 'running')
      assert.equal(after.attemptCount, 1)
    })
  }
})
