import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'

let h: QueuedWorkflowHarness
let ws: InMemoryWorkflowService

beforeEach(() => {
  ws = new InMemoryWorkflowService()
  h = new QueuedWorkflowHarness(ws)
})

const newRun = () =>
  ws.createRun('flow', {}, false, 'hash', { type: 'test' } as never)

describe('a step outcome written late', () => {
  test('a sleep timer does not succeed a step already failed', async () => {
    const runId = await newRun()
    const step = await ws.insertStepState(runId, 'wait', null, {
      duration: 1000,
    })
    await ws.setStepRunning(step.stepId)
    await ws.setStepError(step.stepId, new Error('refused'))

    await ws.executeWorkflowSleepCompleted(runId, step.stepId).catch(() => {})

    assert.equal((await ws.getStepState(runId, 'wait')).status, 'failed')
  })

  test('a child that fails afterwards does not fail the step it already completed', async () => {
    const runId = await newRun()
    const step = await ws.insertStepState(runId, 'child', 'sub', {})
    await ws.setStepRunning(step.stepId)
    await ws.setStepResult(step.stepId, 'child output')
    const childId = await ws.createRun('sub', {}, false, 'hash', {
      type: 'workflow',
      parentRunId: runId,
      parentStepId: step.stepId,
    } as never)

    await ws.notifyChildWorkflowFailed(
      (await ws.getRun(childId))!,
      new Error('the child unwound')
    )

    const after = await ws.getStepState(runId, 'child')
    assert.equal(after.status, 'succeeded')
    assert.equal(after.result, 'child output')
  })
})

describe('a cancel that lands just after a lost step is claimed', () => {
  test('records the lost attempt, not a refusal of the new one', async () => {
    class CancelledAfterClaim extends InMemoryWorkflowService {
      protected override async claimStepForExecution(
        ...args: [string, string, string, number]
      ) {
        const claimed = await super.claimStepForExecution(...args)
        if (claimed) await this.updateRunStatus(args[0], 'compensating')
        return claimed
      }
    }
    ws = new CancelledAfterClaim()
    h = new QueuedWorkflowHarness(ws)
    h.register('work', h.ok())
    const runId = await newRun()
    const step = await ws.insertStepState(
      runId,
      'work',
      'work',
      {},
      { retries: 3 }
    )
    await ws.setStepRunning(step.stepId)
    await ws.refreshStepLease(step.stepId, -1000)

    await ws.executeWorkflowStep(runId, 'work', 'work', {}, h.rpc as never)

    const after = await ws.getStepState(runId, 'work')
    assert.deepEqual(h.log, [])
    assert.equal(after.status, 'failed')
    assert.match(after.error?.message ?? '', /lost its worker on attempt 1/)
  })
})

describe('a cancel that lands as a step is being set running', () => {
  /** The cancel is committed just before the write that starts `stepName`. */
  class CancelledAsItStarts extends InMemoryWorkflowService {
    stepName = ''
    protected override async setStepRunningImpl(
      ...args: Parameters<InMemoryWorkflowService['setStepRunningImpl']>
    ) {
      for (const run of await this.listRuns()) {
        const steps = await this.getRunSteps(run.id)
        if (
          steps.some(
            (s) => s.stepId === args[0] && s.stepName === this.stepName
          )
        ) {
          await this.updateRunStatus(run.id, 'cancelled', undefined, {
            message: 'stop',
            stack: '',
            code: 'WORKFLOW_CANCELLED',
          })
        }
      }
      return super.setStepRunningImpl(...args)
    }
  }

  let cancelling: CancelledAsItStarts

  beforeEach(() => {
    cancelling = new CancelledAsItStarts()
    cancelling.stepName = 'work'
    ws = cancelling
    h = new QueuedWorkflowHarness(ws)
  })

  const runFlow = async (inline: boolean) => {
    let runId!: string
    await ws
      .startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
        inline,
        onRunCreated: (id) => {
          runId = id
        },
      })
      .catch(() => {})
    if (!inline) await h.pump()
    return ws.getStepState(runId, 'work')
  }

  test('an inline RPC step does not run', async () => {
    h.register('work', { ...h.ok(), queued: false })
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('work', 'work', {})
    })

    const step = await runFlow(true)

    assert.deepEqual(h.log, [])
    assert.equal(step.status, 'failed')
    assert.match(step.error?.message ?? '', /the run had been stopped/)
  })

  for (const inline of [true, false]) {
    test(`a closure step of ${inline ? 'an inline' : 'a queued'} run does not run`, async () => {
      let ran = 0
      h.defineDsl('flow', async (workflow) => {
        await workflow.do('work', async () => ++ran)
      })

      const step = await runFlow(inline)

      assert.equal(ran, 0)
      assert.equal(step.status, 'failed')
      assert.match(step.error?.message ?? '', /the run had been stopped/)
    })
  }
})

describe('an inline closure step that has failed', () => {
  test('is not run again by a replay once its retries are spent', async () => {
    let calls = 0
    h.defineDsl('flow', async (workflow) => {
      await workflow
        .do(
          'work',
          async () => {
            calls++
            throw new Error('declined')
          },
          { retries: 0 }
        )
        .catch(() => {})
      await workflow.suspend('hold')
    })

    const runId = await h.start('flow', {}, { type: 'test' }, { inline: true })
    await ws.runWorkflowJob(runId, h.rpc as never)

    assert.equal(calls, 1)
    assert.equal((await ws.getStepState(runId, 'work')).status, 'failed')
  })
})
