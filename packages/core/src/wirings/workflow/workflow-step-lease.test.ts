import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import type { StepState } from './workflow.types.js'

const RPC_NAME = 'charge:card'
const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/** `recoverStalledRuns` re-drives a run through the queue, so it needs one. */
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

const claim = (
  ws: InMemoryWorkflowService,
  runId: string,
  stepName: string,
  leaseMs = 60_000
): Promise<StepState | null> =>
  (ws as any).claimStepForExecution(
    runId,
    stepName,
    RPC_NAME,
    new Date(Date.now() + leaseMs)
  )

/** The worker died: its lease lapses because nothing is left to refresh it. */
async function loseTheWorker(
  ws: InMemoryWorkflowService,
  runId: string,
  stepName: string
): Promise<void> {
  const step = await ws.getStepState(runId, stepName)
  ;(step as any).leaseExpiresAt = new Date(Date.now() - 1)
}

async function startRun(
  ws: InMemoryWorkflowService,
  stepName: string,
  stepOptions?: { retries?: number }
): Promise<string> {
  const runId = await ws.createRun('flow', {}, false, 'hash', { type: 'test' })
  await ws.insertStepState(runId, stepName, RPC_NAME, {}, stepOptions)
  return runId
}

describe('step leases', () => {
  test('a live lease still excludes a second dispatch', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card')

    const first = await claim(ws, runId, 'Charge card')
    const second = await claim(ws, runId, 'Charge card')

    assert.ok(first, 'the first dispatch owns the step')
    assert.equal(
      second,
      null,
      'the second is turned away while the lease holds'
    )
  })

  test('a step whose worker died is claimable once its lease lapses', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card')

    await claim(ws, runId, 'Charge card')
    await loseTheWorker(ws, runId, 'Charge card')
    const second = await claim(ws, runId, 'Charge card')

    assert.ok(second, 'the abandoned step is up for grabs again')
    assert.equal(second.attemptCount, 2, 're-claiming it counts as an attempt')
  })

  test('a worker that keeps refreshing its lease keeps its step', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card')

    const held = await claim(ws, runId, 'Charge card', 50)
    assert.ok(held)
    await ws.refreshStepLease(held.stepId, new Date(Date.now() + 60_000))
    const second = await claim(ws, runId, 'Charge card')

    assert.equal(second, null, 'a live worker is not displaced')
  })

  test('a run wedged on a lapsed lease is swept as stalled', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card')

    await claim(ws, runId, 'Charge card')
    await loseTheWorker(ws, runId, 'Charge card')
    const past = new Date(Date.now() - 10 * 60_000)
    ;((await ws.getRun(runId)) as any).updatedAt = past
    for (const step of await ws.getRunHistory(runId)) {
      ;(step as any).updatedAt = past
    }

    const { resumed } = await ws.recoverStalledRuns()

    assert.deepEqual(resumed, [runId], 'the run is no longer read as in flight')
    assert.deepEqual(resumes.runIds, [runId], 'it is put back on the queue')
  })

  test('a step that keeps losing its worker fails instead of looping', async () => {
    trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card', { retries: 1 })

    await claim(ws, runId, 'Charge card')
    await loseTheWorker(ws, runId, 'Charge card')
    await claim(ws, runId, 'Charge card')
    await loseTheWorker(ws, runId, 'Charge card')
    const exhausted = await claim(ws, runId, 'Charge card')

    assert.equal(exhausted, null, 'the step is not handed out a third time')
    const step = await ws.getStepState(runId, 'Charge card')
    assert.equal(step.status, 'failed', 'it fails loudly rather than wedging')
    assert.match(String(step.error?.message), /lease/i)
  })
})
