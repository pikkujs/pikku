import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { LeaseTakenError } from '../../services/lease-service.js'
import { WorkflowStepLeaseExpiredError } from './workflow-errors.js'
import {
  RedispatchBackoff,
  sweepScheduledSteps,
  WorkflowRecovery,
  type ScheduledStep,
} from './workflow-recovery.js'
import { takeBackLostInlineStep } from './workflow-step-claim.js'
import type { StepState } from './workflow.types.js'

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

/** Past steps, with only the fields the sweep reads. */
const scheduled = (overrides: Partial<ScheduledStep>): ScheduledStep => ({
  runId: 'run',
  stepId: 'step',
  stepName: 'Wait',
  rpcName: null,
  data: { duration: 60_000 },
  scheduledAt: new Date(),
  ...overrides,
})

const sweepOf = async (
  steps: ScheduledStep[],
  options: {
    rearm?: boolean
    wakeGraceMs?: number
    undispatchedAfterMs?: number
  },
  owned = false
) => {
  const calls = {
    woken: [] as string[],
    rearmed: [] as Array<[string, number]>,
    redispatched: [] as string[],
  }
  const outcome = await sweepScheduledSteps(
    async (_limit, offset) => (offset === 0 ? steps : []),
    new RedispatchBackoff(),
    options,
    {
      wake: async ({ stepId }) => {
        if (!owned) calls.woken.push(stepId)
        return !owned
      },
      rearm: async ({ stepId }, remaining) => {
        calls.rearmed.push([stepId, remaining])
      },
      redispatch: async ({ stepId }) => {
        calls.redispatched.push(stepId)
      },
    }
  )
  return { calls, outcome }
}

describe('scheduled step recovery', () => {
  test('a restart re-arms a sleep for what remains of it, not for all of it', async () => {
    const { calls } = await sweepOf(
      [scheduled({ scheduledAt: new Date(Date.now() - 45_000) })],
      { rearm: true }
    )
    assert.equal(calls.woken.length, 0)
    const [[, remaining]] = calls.rearmed as [[string, number]]
    assert.ok(remaining > 14_000 && remaining <= 15_000, `${remaining}`)
  })

  test('a restart wakes an overdue sleep at once', async () => {
    const { calls } = await sweepOf(
      [scheduled({ scheduledAt: new Date(Date.now() - 90_000) })],
      { rearm: true }
    )
    assert.deepEqual(calls.woken, ['step'])
    assert.equal(calls.rearmed.length, 0)
  })

  test('a running process leaves a sleep alone until its timer is known lost', async () => {
    const onTime = await sweepOf(
      [scheduled({ scheduledAt: new Date(Date.now() - 45_000) })],
      {}
    )
    const barelyLate = await sweepOf(
      [scheduled({ scheduledAt: new Date(Date.now() - 61_000) })],
      {}
    )
    const lost = await sweepOf(
      [scheduled({ scheduledAt: new Date(Date.now() - 70_000) })],
      {}
    )
    assert.equal(onTime.calls.woken.length + onTime.calls.rearmed.length, 0)
    assert.equal(barelyLate.calls.woken.length, 0)
    assert.deepEqual(lost.calls.woken, ['step'])
  })

  test('a sleep on a run another instance owns is not reported as woken', async () => {
    const { outcome } = await sweepOf(
      [scheduled({ scheduledAt: new Date(Date.now() - 70_000) })],
      {},
      true
    )
    assert.deepEqual(outcome.woken, [])
  })

  test('a dispatched step is sent again only once its job looks lost', async () => {
    const { calls } = await sweepOf(
      [
        scheduled({ stepId: 'fresh', rpcName: 'work' }),
        scheduled({
          stepId: 'stale',
          rpcName: 'work',
          scheduledAt: new Date(Date.now() - 60_000),
        }),
      ],
      { undispatchedAfterMs: 30_000 }
    )
    assert.deepEqual(calls.redispatched, ['stale'])
  })
})

describe('recovery ownership', () => {
  const stalledRun = async (ws: InMemoryWorkflowService) => {
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'Step', 'work', {})
    await backdate(ws, runId, 10 * 60_000)
    return runId
  }

  test('leaves a run alone while another instance holds its lease, and picks it up after', async () => {
    const resumes = trackResumes()
    class HeldElsewhere extends InMemoryWorkflowService {
      held = true
      override async withRunLease<T>(id: string, fn: () => Promise<T>) {
        if (this.held) throw new LeaseTakenError(`workflow-run:${id}`)
        return fn()
      }
    }
    const ws = new HeldElsewhere()
    const runId = await stalledRun(ws)

    assert.deepEqual((await ws.recoverStalledRuns()).resumed, [])
    assert.deepEqual(resumes.runIds, [])

    ws.held = false
    // Nothing was re-driven, so no backoff stands between the run and recovery.
    assert.deepEqual((await ws.recoverStalledRuns()).resumed, [runId])
  })

  test('leaves a retry sitting out its delay alone', async () => {
    const resumes = trackResumes()
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    const step = await ws.insertStepState(
      runId,
      'Step',
      'work',
      {},
      {
        retries: 3,
        retryDelay: '1hour',
      }
    )
    await ws.setStepError(step.stepId, new Error('boom'))
    await ws.createRetryAttempt(step.stepId, 'pending')
    const run = await ws.getRun(runId)
    ;(run as any).updatedAt = new Date(0)

    const before = new Date(Date.now() + 1000)
    assert.deepEqual(await (ws as any).findStalledRunIds(before, 10), [runId])
    assert.deepEqual(
      (await ws.recoverStalledRuns({ stalledAfterMs: -1000 })).resumed,
      []
    )
    assert.deepEqual(resumes.runIds, [])
  })

  test('one recovery loop per service, and it stops', async () => {
    trackResumes()
    let swept = 0
    const loop = new WorkflowRecovery({} as any)
    loop.recover = async () => {
      swept += 1
    }
    loop.start({ intervalMs: 5 })
    loop.start({ intervalMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 30))
    loop.stop()
    const settled = swept
    assert.ok(settled >= 2)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(swept, settled)
  })

  test('`false` keeps the loop from starting at all', async () => {
    const loop = new WorkflowRecovery({} as any)
    let swept = 0
    loop.recover = async () => {
      swept += 1
    }
    loop.start(false)
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(swept, 0)
  })
})

describe('a step lost mid-pass', () => {
  const store = () => {
    const calls: string[] = []
    return {
      calls,
      setStepError: async () => {
        calls.push('error')
      },
      createRetryAttempt: async () => {
        calls.push('retry')
        return { status: 'pending', attemptCount: 2 } as StepState
      },
    }
  }
  const running = (attemptCount: number, retries: number) =>
    ({ stepId: 's', status: 'running', attemptCount, retries }) as StepState

  test('runs again as a counted attempt', async () => {
    const s = store()
    const next = await takeBackLostInlineStep(s, 'r', 'n', running(1, 5))
    assert.equal(next.attemptCount, 2)
    assert.deepEqual(s.calls, ['retry'])
  })

  test('fails loudly once a step has taken its process down every attempt', async () => {
    const s = store()
    await assert.rejects(
      takeBackLostInlineStep(s, 'r', 'n', running(6, 5)),
      WorkflowStepLeaseExpiredError
    )
    assert.deepEqual(s.calls, ['error'])
  })

  test('a step that is not running is left as it is', async () => {
    const s = store()
    const pending = { status: 'pending' } as StepState
    assert.equal(await takeBackLostInlineStep(s, 'r', 'n', pending), pending)
    assert.deepEqual(s.calls, [])
  })
})
