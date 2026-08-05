import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/**
 * `relayUndispatchedSteps` re-drives a run by putting it back on the
 * orchestrator queue, so the queue is the observation point.
 */
function trackResumes(): { runIds: string[] } {
  const seen: string[] = []
  pikkuState(null, 'package', 'singletonServices', {
    queueService: {
      add: async (_queue: string, data: { runId: string }) => {
        seen.push(data.runId)
      },
    },
    logger: silentLogger,
  } as any)
  return { runIds: seen }
}

/** Backdates a step's timestamp so it reads as undispatched. */
async function backdateSteps(
  ws: InMemoryWorkflowService,
  runId: string,
  ms: number
): Promise<void> {
  const past = new Date(Date.now() - ms)
  for (const step of await ws.getRunHistory(runId)) {
    ;(step as any).updatedAt = past
  }
}

describe('undispatched step relay', () => {
  test('re-dispatches a step whose arming was lost', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    // The row committed; the process died before the timer was armed.
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })
    await backdateSteps(ws, runId, 60_000)

    const { redispatched } = await ws.relayUndispatchedSteps()

    assert.deepEqual(redispatched, [runId], 'the run is re-dispatched')
    assert.deepEqual(resumes.runIds, [runId], 'it is put back on the queue')
  })

  test('leaves a freshly written step alone', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    // Written milliseconds ago — its dispatch is almost certainly in flight.
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })

    const { redispatched } = await ws.relayUndispatchedSteps()

    assert.deepEqual(redispatched, [], 'nothing is re-dispatched')
    assert.deepEqual(resumes.runIds, [], 'nothing is queued')
  })

  test('backs off rather than re-dispatching the same step every tick', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'Charge card', 'charge', {})
    await backdateSteps(ws, runId, 60_000)

    const first = await ws.relayUndispatchedSteps()
    // The step is still pending — a real queue backlog looks exactly like this.
    const second = await ws.relayUndispatchedSteps()

    assert.deepEqual(first.redispatched, [runId], 'the first tick relays it')
    assert.deepEqual(
      second.redispatched,
      [],
      'the next tick is held off by the backoff'
    )
    assert.deepEqual(resumes.runIds, [runId], 'only one queue message')
  })

  test('ignores steps belonging to a settled run', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })
    await backdateSteps(ws, runId, 60_000)
    await ws.updateRunStatus(runId, 'completed', {})

    const { redispatched } = await ws.relayUndispatchedSteps()

    assert.deepEqual(redispatched, [], 'a finished run is not re-dispatched')
    assert.deepEqual(resumes.runIds, [], 'nothing is queued')
  })

  test('re-dispatches each stuck run once per tick', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runIds: string[] = []
    for (const n of [1, 2]) {
      const runId = await ws.createRun('flow', {}, false, 'hash', {
        type: 'test',
      })
      // Two orphaned steps in one run must still produce a single resume.
      await ws.insertStepState(runId, `Wait ${n}a`, null, { duration: 1000 })
      await ws.insertStepState(runId, `Wait ${n}b`, null, { duration: 1000 })
      await backdateSteps(ws, runId, 60_000)
      runIds.push(runId)
    }

    const { redispatched } = await ws.relayUndispatchedSteps()

    assert.deepEqual(redispatched.sort(), runIds.sort(), 'both runs relayed')
    assert.equal(resumes.runIds.length, 2, 'one queue message per run')
  })
})
