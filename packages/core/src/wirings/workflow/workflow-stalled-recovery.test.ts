import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/**
 * `recoverStalledRuns` re-drives a run by putting it back on the orchestrator
 * queue, so the queue is the observation point.
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

/** Backdates every persisted timestamp so the run reads as idle. */
async function backdate(
  ws: InMemoryWorkflowService,
  runId: string,
  ms: number
): Promise<void> {
  const past = new Date(Date.now() - ms)
  const run = await ws.getRun(runId)
  ;(run as any).updatedAt = past
  for (const step of await ws.getRunHistory(runId)) {
    ;(step as any).updatedAt = past
  }
}

describe('stalled run recovery', () => {
  test('resumes a running run left with a pending step and nothing in flight', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    // A sleep whose timer was never armed: the step row exists, nothing will
    // ever complete it.
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })
    await backdate(ws, runId, 10 * 60_000)

    const { resumed } = await ws.recoverStalledRuns()

    assert.deepEqual(resumed, [runId], 'the orphaned run is resumed')
    assert.deepEqual(resumes.runIds, [runId], 'it is put back on the queue')
  })

  test('leaves a run alone while a step is still scheduled', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    const step = await ws.insertStepState(runId, 'Wait 1h', null, {
      duration: 3_600_000,
    })
    await ws.setStepScheduled(step.stepId)
    await backdate(ws, runId, 10 * 60_000)

    const { resumed } = await ws.recoverStalledRuns()

    assert.deepEqual(
      resumed,
      [],
      'a legitimately sleeping run is not a stalled run'
    )
  })

  test('leaves a run alone until it has actually gone idle', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })

    const { resumed } = await ws.recoverStalledRuns()

    assert.deepEqual(resumed, [], 'a run that just moved is not swept')
  })

  test('backs off rather than re-resuming the same run every tick', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })
    await backdate(ws, runId, 10 * 60_000)

    const first = await ws.recoverStalledRuns()
    // Still stalled: a resume does not clear whatever wedged the run, so an
    // unconditional sweep would re-queue it on this tick and on every tick
    // after it.
    const second = await ws.recoverStalledRuns()

    assert.deepEqual(first.resumed, [runId], 'the first sweep resumes it')
    assert.deepEqual(
      second.resumed,
      [],
      'the next sweep is held off by the backoff'
    )
    assert.deepEqual(resumes.runIds, [runId], 'only one queue message')
  })

  test('does not re-drive a run the relay has just re-dispatched', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    // Old enough to read as both an undispatched step and a stalled run.
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })
    await backdate(ws, runId, 10 * 60_000)

    const relayed = await ws.relayUndispatchedSteps()
    const swept = await ws.recoverStalledRuns()

    assert.deepEqual(relayed.redispatched, [runId], 'the relay re-drives it')
    assert.deepEqual(
      swept.resumed,
      [],
      'the sweep adds nothing the relay has not already queued'
    )
    assert.deepEqual(resumes.runIds, [runId], 'only one queue message')
  })

  test('leaves a finished run alone', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'Wait 15s', null, { duration: 15000 })
    await ws.updateRunStatus(runId, 'completed')
    await backdate(ws, runId, 10 * 60_000)

    const { resumed } = await ws.recoverStalledRuns()

    assert.deepEqual(resumed, [], 'only running runs are swept')
  })
})
