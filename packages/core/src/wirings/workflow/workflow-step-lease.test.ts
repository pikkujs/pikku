import { describe, mock, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import {
  startStepLeaseRefresh,
  stepLeaseMsForQueue,
} from './workflow-step-lease.js'
import {
  DEFAULT_STEP_LEASE_MS,
  STEP_LEASE_REFRESH_MIN_MS,
} from './workflow-constants.js'
import { pikkuState } from '../../pikku-state.js'
import type { StepState } from './workflow.types.js'

const RPC_NAME = 'charge:card'
const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/** A step whose function is dispatched through the queue rather than inline. */
function registerDispatched(rpcName: string): void {
  const funcId = `fn:${rpcName}`
  pikkuState(null, 'rpc', 'meta', { [rpcName]: funcId } as any)
  pikkuState(null, 'function', 'meta', {
    [funcId]: { workflowQueued: true },
  } as any)
}

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

  // The sweep resumes the run, and the resumed run meets the step still
  // `running`. Redispatching it as `scheduled` would hand it to the claim as a
  // first run, and a step that kills its worker every time would never run out.
  test('a resumed run redispatches a lapsed step without resetting its attempts', async () => {
    const resumes = trackResumes()
    registerDispatched(RPC_NAME)
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card', { retries: 0 })

    await claim(ws, runId, 'Charge card')
    await loseTheWorker(ws, runId, 'Charge card')
    await assert.rejects(
      (ws as any).rpcStep(runId, 'Charge card', RPC_NAME, {}, {}),
      (e: Error) => e.name === 'WorkflowAsyncException'
    )

    assert.deepEqual(resumes.runIds, [runId], 'the step is dispatched again')
    assert.equal(
      (await ws.getStepState(runId, 'Charge card')).status,
      'running',
      'it is left running for the claim to count'
    )
    assert.equal(await claim(ws, runId, 'Charge card'), null)
    assert.equal(
      (await ws.getStepState(runId, 'Charge card')).status,
      'failed',
      'its one attempt is spent, so it fails'
    )
  })

  test('a resumed run leaves a step with a live lease to its worker', async () => {
    const resumes = trackResumes()
    registerDispatched(RPC_NAME)
    const ws = new InMemoryWorkflowService()
    const runId = await startRun(ws, 'Charge card')

    await claim(ws, runId, 'Charge card')
    await assert.rejects(
      (ws as any).rpcStep(runId, 'Charge card', RPC_NAME, {}, {}),
      (e: Error) => e.name === 'WorkflowAsyncException'
    )

    assert.deepEqual(resumes.runIds, [], 'nothing is dispatched')
    assert.equal(
      (await ws.getStepState(runId, 'Charge card')).status,
      'running'
    )
  })

  // Releasing the lease of a step parked on a child run happens after the
  // refresh stops. A renewal still in flight must not land after the release.
  test('stopping the refresh waits for a renewal in flight', async () => {
    let release!: () => void
    let stopped = false

    mock.timers.enable({ apis: ['setInterval'] })
    try {
      const stop = startStepLeaseRefresh(
        'step-1',
        10_000,
        () => new Promise<void>((resolve) => (release = resolve))
      )
      mock.timers.tick(5_000)
      const stopping = stop().then(() => (stopped = true))
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(stopped, false, 'stop returned with a renewal outstanding')
      release()
      await stopping
    } finally {
      mock.timers.reset()
    }

    assert.equal(stopped, true)
  })

  test('a lease shorter than the refresh floor is still refreshed before it lapses', async () => {
    trackResumes()
    // Under twice the floor, which is where applying the floor as a maximum
    // pushes the first refresh past the expiry it is meant to prevent.
    const leaseMs = STEP_LEASE_REFRESH_MIN_MS
    const refreshes: Date[] = []

    mock.timers.enable({ apis: ['setInterval'] })
    try {
      const stop = startStepLeaseRefresh(
        'step-1',
        leaseMs,
        async (expiresAt) => {
          refreshes.push(expiresAt)
        }
      )
      mock.timers.tick(leaseMs - 1)
      await stop()
    } finally {
      mock.timers.reset()
    }

    assert.ok(
      refreshes.length > 0,
      `a ${leaseMs}ms lease was never refreshed in the ${leaseMs - 1}ms before it expired`
    )
  })
})

describe('stepLeaseMsForQueue', () => {
  const register = (queueName: string, config: unknown) => {
    pikkuState(null, 'queue', 'registrations').set(queueName, {
      name: queueName,
      config,
    } as any)
  }

  test('takes the queue lock as the lease', () => {
    register('charges', { lockDuration: 45_000, visibilityTimeout: 90 })
    assert.equal(stepLeaseMsForQueue('charges'), 45_000)
  })

  // A visibility timeout is the same ownership window said in seconds, so it
  // has to be converted rather than used as milliseconds.
  test('converts a visibility timeout from seconds', () => {
    register('shipments', { visibilityTimeout: 30 })
    assert.equal(stepLeaseMsForQueue('shipments'), 30_000)
  })

  test('falls back to the default when the queue sets neither', () => {
    register('emails', {})
    assert.equal(stepLeaseMsForQueue('emails'), DEFAULT_STEP_LEASE_MS)
  })

  test('falls back to the default for an unregistered queue', () => {
    assert.equal(
      stepLeaseMsForQueue('nobody-wired-this'),
      DEFAULT_STEP_LEASE_MS
    )
  })
})
