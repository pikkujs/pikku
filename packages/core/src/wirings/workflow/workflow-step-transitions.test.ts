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
