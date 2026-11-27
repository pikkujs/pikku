import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { getSingletonServices } from '../../pikku-state.js'
import { pikkuWorkflowOrchestratorFunc } from './workflow-queue-workers.js'
import { runLeaseKey } from './workflow-lease-helpers.test.js'
import {
  leaseRenewalIntervalMs,
  LeaseTakenError,
} from '../../services/lease-service.js'
import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import { DEFAULT_STEP_LEASE_MS } from './workflow-constants.js'
import {
  afterRenewal,
  fastLeaseRenewals,
} from './workflow-lease-helpers.test.js'

const LIMIT = { timeout: 20_000 }

let restoreTimers: () => void
before(() => {
  restoreTimers = fastLeaseRenewals([
    leaseRenewalIntervalMs(DEFAULT_STEP_LEASE_MS),
  ])
})
after(() => restoreTimers())

/** Refuses to renew the lease of any step the test says is lost. */
class LosingStepService extends InMemoryWorkflowService {
  private readonly lost = new Set<string>()

  async loseStep(runId: string, stepName: string) {
    const step = await this.getStepState(runId, stepName)
    this.lost.add(step.stepId)
    await afterRenewal()
  }

  /** What the store's clock does once nobody renews. */
  async lapse(runId: string, stepName: string) {
    const step = await this.getStepState(runId, stepName)
    step.leaseExpiresAt = new Date(0)
  }

  override async refreshStepLease(
    stepId: string,
    leaseMs: number | null,
    attempt?: number
  ) {
    return this.lost.has(stepId)
      ? false
      : super.refreshStepLease(stepId, leaseMs, attempt)
  }
}

let ws: LosingStepService
let h: QueuedWorkflowHarness
let runId: string

beforeEach(() => {
  ws = new LosingStepService()
  h = new QueuedWorkflowHarness(ws)
})

/** Run the job next in line as an orchestrator would, and return it. */
const wake = async () => {
  const { data } = h.queue.shift()!
  await pikkuWorkflowOrchestratorFunc({}, data, { rpc: h.rpc as never })
  return data
}

/** The delay of every job added from now on. */
const recordDelays = () => {
  const queue = getSingletonServices()!.queueService!
  const add = queue.add.bind(queue)
  const delays: number[] = []
  queue.add = (name, data, options) => {
    delays.push(Number(options?.delay ?? 0))
    return add(name, data, options)
  }
  return delays
}

const wakeFor = (stepName: string) => ({
  runId,
  awaitedStep: { stepName, attempt: 1 },
})

const rows = async () =>
  (await ws.getRunSteps(runId)).map(
    (step) => `${step.stepName}:${step.attemptCount}:${step.status}`
  )

const status = async () => (await ws.getRun(runId))!.status

/** Run jobs until the one for `stepName` is next, and take it off the queue. */
const jobFor = async (stepName: string) => {
  for (let i = 0; i < 50; i++) {
    const job = h.queue.shift()!
    if (job.data.stepName === stepName) return job.data
    if (job.data.stepName === undefined) {
      await ws.orchestrateWorkflow(
        job.data.runId,
        h.rpc as never,
        job.data.awaitedStep
      )
    } else {
      // A queue keeps a worker's failure to itself.
      await deliver(job.data).catch(() => {})
    }
  }
  throw new Error(`no job for ${stepName}`)
}

const deliver = (job: any) =>
  ws.executeWorkflowStep(
    job.runId,
    job.stepName,
    job.rpcName,
    job.data,
    h.rpc as never
  )

const start = async (name = 'flow') => {
  ;({ runId } = await ws.startWorkflow(
    name,
    {},
    { type: 'test' },
    h.rpc as never
  ))
}

const oneStep = (retries: number) =>
  h.defineDsl('flow', async (w: any) => {
    await w.do('Zero', 'zero', {})
    await w.do('First', 'first', {}, { retries })
    return {}
  })

const failsHavingLost = (stepName: string, error = new Error('boom')) => {
  let calls = 0
  return async () => {
    if (++calls > 1) return {}
    await ws.loseStep(runId, stepName)
    throw error
  }
}

describe('a queued step worker that lost its step lease', () => {
  for (const retries of [0, 2]) {
    test(
      `retries ${retries}: its throw writes nothing and only wakes the run`,
      LIMIT,
      async () => {
        h.register('zero', h.undoable())
        h.register('first', { forward: failsHavingLost('First') })
        oneStep(retries)
        await start()
        const job = await jobFor('First')

        await assert.doesNotReject(deliver(job))

        assert.deepEqual(await rows(), ['Zero:1:succeeded', 'First:1:running'])
        assert.equal(await status(), 'running')
        assert.deepEqual(
          h.queue.map((queued) => queued.data),
          [wakeFor('First')]
        )
        assert.deepEqual(h.undone, [])
      }
    )
  }

  test(
    'the woken run gives the lapsed step one more attempt',
    LIMIT,
    async () => {
      h.register('zero', h.undoable())
      h.register('first', { forward: failsHavingLost('First') })
      oneStep(1)
      await start()
      await deliver(await jobFor('First'))
      await ws.lapse(runId, 'First')

      await h.pump()

      assert.deepEqual(await rows(), [
        'Zero:1:succeeded',
        'First:1:running',
        'First:2:succeeded',
      ])
      assert.equal(await status(), 'completed')
      assert.deepEqual(h.undone, [])
    }
  )

  test(
    'with no attempt left the step is lost and the run compensates once',
    LIMIT,
    async () => {
      h.register('zero', h.undoable())
      h.register('first', { forward: failsHavingLost('First') })
      oneStep(0)
      await start()
      await deliver(await jobFor('First'))
      await ws.lapse(runId, 'First')

      await h.pump()

      assert.equal(await status(), 'compensated')
      assert.deepEqual(h.undone, ['undo:zero'])
      assert.deepEqual(
        h.log.filter((entry) => entry === 'do:first'),
        ['do:first']
      )
    }
  )

  const lostFirst = async () => {
    h.register('zero', h.ok())
    h.register('first', { forward: failsHavingLost('First') })
    oneStep(1)
    await start()
    const job = await jobFor('First')
    const delays = recordDelays()
    await deliver(job)
    return delays
  }

  test('the wake waits until the lease can have lapsed', LIMIT, async () => {
    const delays = await lostFirst()

    assert.equal(delays.length, 1)
    assert.ok(delays[0]! > DEFAULT_STEP_LEASE_MS, `delay ${delays[0]}`)
  })

  test(
    'a wake that finds the lease live schedules another',
    LIMIT,
    async () => {
      const delays = await lostFirst()
      // A renewal the store took after the worker had given up on it.
      const step = await ws.getStepState(runId, 'First')
      step.leaseExpiresAt = new Date(Date.now() + 30_000)

      assert.deepEqual(await wake(), wakeFor('First'))
      assert.deepEqual(await wake(), wakeFor('First'))

      assert.deepEqual(
        h.queue.map((queued) => queued.data),
        [wakeFor('First')]
      )
      const [, ...again] = delays
      assert.equal(again.length, 2)
      for (const delay of again) {
        assert.ok(delay > 20_000 && delay <= 31_000, `delay ${delay}`)
      }

      await ws.lapse(runId, 'First')
      await h.pump()

      assert.equal(await status(), 'completed')
      assert.deepEqual(await rows(), [
        'Zero:1:succeeded',
        'First:1:running',
        'First:2:succeeded',
      ])
    }
  )

  test(
    'a wake that finds the run held elsewhere is sent on as it was',
    LIMIT,
    async () => {
      await lostFirst()
      const held = ws.withRunLease
      ws.withRunLease = async () => {
        throw new LeaseTakenError(runLeaseKey(runId))
      }

      await wake()

      ws.withRunLease = held
      assert.deepEqual(
        h.queue.map((queued) => queued.data),
        [wakeFor('First')]
      )
    }
  )

  test('no further wake follows a step that moved on', LIMIT, async () => {
    await lostFirst()
    const step = await ws.getStepState(runId, 'First')
    await ws.createRetryAttempt(step.stepId, 'running', 1)
    await ws.refreshStepLease(
      (await ws.getStepState(runId, 'First')).stepId,
      30_000
    )

    await wake()

    assert.deepEqual(h.queue, [])
  })

  test('a success the step fence accepts is recorded', LIMIT, async () => {
    h.register('zero', h.ok())
    h.register('first', {
      forward: async () => {
        await ws.loseStep(runId, 'First')
        return {}
      },
    })
    oneStep(1)
    await start()

    await deliver(await jobFor('First'))

    assert.equal((await ws.getStepState(runId, 'First')).status, 'succeeded')
  })

  test('a wake that cannot be enqueued hands the job back', LIMIT, async () => {
    h.register('zero', h.ok())
    h.register('first', { forward: failsHavingLost('First') })
    oneStep(1)
    await start()
    const job = await jobFor('First')
    h.rejectAddWhen = () => true

    await assert.rejects(deliver(job))

    assert.deepEqual(await rows(), ['Zero:1:succeeded', 'First:1:running'])
  })

  test(
    'a compensation that throws is not failed, and runs once more',
    LIMIT,
    async () => {
      let undos = 0
      h.register('zero', {
        ...h.ok(),
        compensate: async () => {
          if (++undos > 1) return
          await ws.loseStep(runId, 'Zero:compensate')
          throw new Error('undo interrupted')
        },
      })
      h.register('first', h.boom())
      oneStep(0)
      await start()
      const job = await jobFor('Zero:compensate')

      await deliver(job)

      assert.equal(await status(), 'compensating')
      assert.ok((await rows()).includes('Zero:compensate:1:running'))
      assert.ok(!(await rows()).includes('Zero:compensate:1:failed'))

      // `Zero` has the default retries, so its compensation has one to spend.
      await ws.lapse(runId, 'Zero:compensate')
      await h.pump()

      assert.equal(await status(), 'compensated')
      assert.equal(undos, 2)
    }
  )

  test('a graph node writes nothing either', LIMIT, async () => {
    h.register('first', { forward: failsHavingLost('first') })
    h.defineGraph('graph', 'first', { first: { retries: 2 } })
    await start('graph')

    await deliver(await jobFor('first'))

    assert.deepEqual(await rows(), ['first:1:running'])
    assert.equal(await status(), 'running')
    assert.deepEqual(
      h.queue.map((queued) => queued.data),
      [wakeFor('first')]
    )
  })

  test(
    'a graph node whose function is missing does not suspend the run',
    LIMIT,
    async () => {
      h.register('first', {
        forward: failsHavingLost('first', new RPCNotFoundError('first')),
      })
      h.defineGraph('graph', 'first', { first: {} })
      await start('graph')

      await deliver(await jobFor('first'))

      assert.equal(await status(), 'running')
    }
  )
})
