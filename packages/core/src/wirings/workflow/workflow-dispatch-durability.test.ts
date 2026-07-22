import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { WorkflowDispatchException } from './pikku-workflow-service.js'

// Register a `workflowQueued: true` function so the workflow's `do()` routes
// the step through the queue (dispatchStep) instead of running it inline.
function registerDispatchedFn(rpcName: string): void {
  const funcId = `fn:${rpcName}`
  pikkuState(null, 'rpc', 'meta', { [rpcName]: funcId } as any)
  pikkuState(null, 'function', 'meta', {
    [funcId]: { workflowQueued: true },
  } as any)
}

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

describe('dispatch durability: a transient queue failure is recoverable', () => {
  test('failed dispatch leaves the step PENDING and the run un-failed, then re-dispatches on replay', async () => {
    registerDispatchedFn('doThing')
    let queueUp = false
    pikkuState(null, 'package', 'singletonServices', {
      queueService: {
        add: async () => {
          if (!queueUp) throw new Error('pg-boss is down')
        },
      },
      logger: silentLogger,
    } as any)

    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'thing', 'doThing', {})

    // Queue is down → dispatch throws the TRANSIENT exception (not a step failure).
    await assert.rejects(
      (ws as any).rpcStep(runId, 'thing', 'doThing', {}, {}),
      (err: any) => err instanceof WorkflowDispatchException,
      'a queue outage surfaces as WorkflowDispatchException'
    )

    // The step must NOT be stranded in `scheduled` — otherwise replay would pause
    // forever on a job that was never enqueued.
    const afterFail = await ws.getStepState(runId, 'thing')
    assert.equal(
      afterFail.status,
      'pending',
      'step stays pending after a failed dispatch'
    )

    // The run itself must stay alive (not failed) — it is the snapshot we replay.
    const runAfterFail = await ws.getRun(runId)
    assert.notEqual(
      runAfterFail?.status,
      'failed',
      'run is not failed by a queue blip'
    )

    // Queue recovers → replaying the step now dispatches (pauses via async exception)
    // and the step transitions to `scheduled`. A real replay runs through
    // runWorkflowJob which resets the ordinal counter; simulate that so the
    // second reach resolves to the same step key, not the next ordinal.
    ;(ws as any).resetStepOrdinals(runId)
    queueUp = true
    await assert.rejects(
      (ws as any).rpcStep(runId, 'thing', 'doThing', {}, {}),
      (err: any) => err.name === 'WorkflowAsyncException',
      'recovered dispatch pauses the workflow as normal'
    )
    const afterRecover = await ws.getStepState(runId, 'thing')
    assert.equal(
      afterRecover.status,
      'scheduled',
      'step is scheduled only after a successful dispatch'
    )
  })
})

describe('orchestrateWorkflow treats a dispatch failure as non-terminal', () => {
  function makeService(throwIt: () => never) {
    pikkuState(null, 'package', 'singletonServices', {
      queueService: { add: async () => {} },
      logger: silentLogger,
    } as any)
    const ws = new InMemoryWorkflowService()
    // Override the replay to throw whatever the test wants.
    ;(ws as any).runWorkflowJob = async () => throwIt()
    return ws
  }

  test('WorkflowDispatchException → run NOT marked failed, error rethrown for queue retry', async () => {
    const ws = makeService(() => {
      throw new WorkflowDispatchException('r', 's')
    })
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })

    await assert.rejects(
      ws.orchestrateWorkflow(runId, {}),
      (err: any) => err instanceof WorkflowDispatchException
    )
    const run = await ws.getRun(runId)
    assert.notEqual(
      run?.status,
      'failed',
      'a transient dispatch failure must leave the run resumable'
    )
  })

  test('a genuine step error still fails the run (unchanged behavior)', async () => {
    const ws = makeService(() => {
      throw new Error('business logic blew up')
    })
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })

    await assert.rejects(ws.orchestrateWorkflow(runId, {}))
    const run = await ws.getRun(runId)
    assert.equal(run?.status, 'failed', 'real errors still fail the run')
  })
})
