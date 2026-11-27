import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { WorkflowAsyncException } from './workflow-errors.js'
import { gate } from './workflow-lease-helpers.test.js'

const LIMIT = { timeout: 20_000 }

let ws: InMemoryWorkflowService
let h: QueuedWorkflowHarness
let runId: string

beforeEach(() => {
  ws = new InMemoryWorkflowService()
  h = new QueuedWorkflowHarness(ws)
})

const rows = async () =>
  (await ws.getRunSteps(runId)).map(
    (step) => `${step.stepName}:${step.attemptCount}:${step.status}`
  )

const createRun = async () => {
  runId = await ws.createRun('flow', {}, false, 'flow-hash', { type: 'test' })
}

const pass = () => ws.runWorkflowJob(runId, h.rpc as never)

describe('a closure step on a store whose run lease is a pass-through', () => {
  for (const retries of [0, 2]) {
    test(
      `retries ${retries}: a second pass leaves a step being worked alone`,
      LIMIT,
      async () => {
        const entered = gate()
        const release = gate()
        let calls = 0
        h.defineDsl('flow', async (w: any) => {
          await w.do(
            'A',
            async () => {
              if (++calls === 1) {
                entered.open()
                await release.passed
              }
              return calls
            },
            { retries }
          )
          return {}
        })
        await createRun()
        const older = pass()
        await entered.passed

        await assert.rejects(pass(), WorkflowAsyncException)

        assert.deepEqual(await rows(), ['A:1:running'])
        release.open()
        await older
        assert.equal(calls, 1)
        assert.deepEqual(await rows(), ['A:1:succeeded'])
        assert.equal((await ws.getRun(runId))!.status, 'completed')
      }
    )
  }

  test('a step nothing is working is taken back', LIMIT, async () => {
    let calls = 0
    h.defineDsl('flow', async (w: any) => {
      await w.do('A', async () => ++calls, { retries: 1 })
      return {}
    })
    await createRun()
    // As a process that died mid-step leaves it.
    const step = await ws.insertStepState(runId, 'A', null, null, {
      retries: 1,
    })
    await ws.setStepRunning(step.stepId, 1)

    await pass()

    assert.equal(calls, 1)
    assert.deepEqual(await rows(), ['A:1:running', 'A:2:succeeded'])
    assert.equal((await ws.getRun(runId))!.status, 'completed')
  })

  test(
    'a step whose pass ended without an outcome is taken back',
    LIMIT,
    async () => {
      let calls = 0
      h.defineDsl('flow', async (w: any) => {
        await w.do('A', async () => ++calls, { retries: 1 })
        return {}
      })
      await createRun()
      const record = ws.setStepResult.bind(ws)
      ws.setStepResult = async () => {
        ws.setStepResult = record
        throw new Error('store unreachable')
      }
      await assert.rejects(pass(), /store unreachable/)
      assert.deepEqual(await rows(), ['A:1:running'])
      // The failed pass ended the run; what is left is the step's row.
      ;(await ws.getRun(runId))!.status = 'running'

      await pass()

      assert.equal(calls, 2)
      assert.deepEqual(await rows(), ['A:1:running', 'A:2:succeeded'])
    }
  )
})
